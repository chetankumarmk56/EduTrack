import json

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.logger import logger
from app.models.finance import Payment, StudentFee, StudentFeeStatus, PaymentTransaction
from app.models.directory import Student
from app.services.finance.ledger_helpers import write_ledger_entry


class WebhookServiceMixin:
    async def handle_razorpay_webhook(
        self, db: AsyncSession, raw_body: bytes, signature: str
    ) -> bool:
        """
        Securely process Razorpay webhook notifications.

        Flow: verify signature → idempotency check → atomic StudentFee lock+update
        → allocate_payment → commit. Returning False causes Razorpay to retry.
        """
        if not settings.RAZORPAY_WEBHOOK_SECRET:
            logger.critical(
                "RAZORPAY_WEBHOOK_SECRET not configured. Webhook ignored."
            )
            return False

        try:
            self.razorpay_client.utility.verify_webhook_signature(
                raw_body.decode("utf-8"),
                signature,
                settings.RAZORPAY_WEBHOOK_SECRET,
            )
        except Exception as e:
            logger.error(f"Webhook signature verification failed: {e}")
            return False

        payload = json.loads(raw_body)
        event = payload.get("event")
        payment_entity = (
            payload.get("payload", {}).get("payment", {}).get("entity", {})
        )
        razorpay_order_id = payment_entity.get("order_id")
        razorpay_payment_id = payment_entity.get("id")
        amount_paise = payment_entity.get("amount")
        amount = amount_paise / 100 if amount_paise else 0
        # Razorpay reports `fee` (and `tax`) in paise on captured webhooks; fall back to None
        gateway_fee_paise = payment_entity.get("fee")
        gateway_fee = gateway_fee_paise / 100 if gateway_fee_paise else None
        gateway_method = (payment_entity.get("method") or "UPI").upper()

        if not razorpay_order_id or not razorpay_payment_id:
            logger.warning(
                f"Webhook event {event} missing order_id or payment_id. Ignored."
            )
            return True

        txn_stmt = select(PaymentTransaction).where(
            PaymentTransaction.razorpay_payment_id == razorpay_payment_id
        )
        txn_res = await db.execute(txn_stmt)
        if txn_res.scalars().first():
            logger.info(
                f"Webhook IDEMPOTENCY: Payment {razorpay_payment_id} already processed. "
                f"Skipping."
            )
            return True

        try:
            if event == "payment.captured":
                logger.info(
                    f"Webhook: Captured payment {razorpay_payment_id} "
                    f"for order {razorpay_order_id}. Processing..."
                )

                new_txn = PaymentTransaction(
                    razorpay_payment_id=razorpay_payment_id,
                    order_id=razorpay_order_id,
                    amount=amount,
                    status="captured",
                )
                db.add(new_txn)

                stmt = select(Payment).where(
                    Payment.razorpay_order_id == razorpay_order_id
                )
                res = await db.execute(stmt)
                payment = res.scalars().first()

                if not payment:
                    logger.error(
                        f"Webhook FATAL: No local payment record for order "
                        f"{razorpay_order_id}. Rollback."
                    )
                    return False

                student_id = payment.student_id
                student_res = await db.execute(
                    select(Student.school_class_id).where(Student.id == student_id)
                )
                class_id = student_res.scalar()

                if class_id:
                    try:
                        fee_stmt = select(StudentFee).where(
                            StudentFee.student_id == student_id,
                            StudentFee.class_id == class_id,
                        ).with_for_update(nowait=True)

                        fee_res = await db.execute(fee_stmt)
                        student_fee = fee_res.scalars().first()

                        if student_fee:
                            logger.info(
                                f"Webhook LOCK: StudentFee {student_fee.id} locked."
                            )

                            new_paid_amount = student_fee.amount_paid + amount
                            if new_paid_amount > student_fee.total_amount:
                                logger.error(
                                    f"Webhook VALIDATION: Overpayment for Student "
                                    f"{student_id}. Paid: {new_paid_amount}, "
                                    f"Total: {student_fee.total_amount}. Rollback."
                                )
                                await db.rollback()
                                return False

                            student_fee.amount_paid = new_paid_amount
                            student_fee.due_amount = (
                                student_fee.total_amount - new_paid_amount
                            )

                            if student_fee.due_amount <= 0:
                                student_fee.status = StudentFeeStatus.PAID
                            elif student_fee.amount_paid > 0:
                                student_fee.status = StudentFeeStatus.PARTIAL
                            else:
                                student_fee.status = StudentFeeStatus.UNPAID

                            logger.info(
                                f"Webhook UPDATE: StudentFee {student_fee.id} updated. "
                                f"New due: {student_fee.due_amount}"
                            )

                    except Exception as lock_error:
                        logger.warning(
                            f"Webhook LOCK_TIMEOUT: Failed to acquire lock on StudentFee "
                            f"for Student {student_id}: {lock_error}"
                        )
                        await db.rollback()
                        return False

                payment.status = "SUCCESS"
                payment.razorpay_payment_id = razorpay_payment_id
                if payment.payment_mode in (None, "UPI") and gateway_method:
                    payment.payment_mode = gateway_method
                await db.flush()

                await self.allocate_payment(db, payment.id)

                student_res2 = await db.execute(
                    select(Student).where(Student.id == student_id)
                )
                student_obj = student_res2.scalars().first()
                if student_obj:
                    await write_ledger_entry(
                        db,
                        institution_id=payment.institution_id,
                        payment=payment,
                        student=student_obj,
                        payment_method=gateway_method or payment.payment_mode or "UPI",
                        payment_status="SUCCESS",
                        gateway_fee=gateway_fee,
                    )

                await db.commit()
                logger.info(
                    f"Webhook SUCCESS: Atomic update for payment {razorpay_payment_id}."
                )

            elif event == "payment.failed":
                new_txn = PaymentTransaction(
                    razorpay_payment_id=razorpay_payment_id,
                    order_id=razorpay_order_id,
                    amount=amount,
                    status="failed",
                )
                db.add(new_txn)

                stmt = select(Payment).where(
                    Payment.razorpay_order_id == razorpay_order_id
                )
                res = await db.execute(stmt)
                payment = res.scalars().first()
                if payment and payment.status != "FAILED":
                    payment.status = "FAILED"
                    payment.razorpay_payment_id = razorpay_payment_id
                    await db.flush()

                    student_res = await db.execute(
                        select(Student).where(Student.id == payment.student_id)
                    )
                    student_obj = student_res.scalars().first()
                    if student_obj:
                        await write_ledger_entry(
                            db,
                            institution_id=payment.institution_id,
                            payment=payment,
                            student=student_obj,
                            payment_method=gateway_method or payment.payment_mode or "UPI",
                            payment_status="FAILED",
                            gateway_fee=0.0,
                        )

                await db.commit()
                logger.info(
                    f"Webhook: Payment {razorpay_payment_id} marked FAILED."
                )

            return True

        except Exception as e:
            logger.error(
                f"Webhook CRITICAL: Failed to process event {event}: {str(e)}"
            )
            await db.rollback()
            return False
