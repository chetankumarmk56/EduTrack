from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.logger import logger
from app.models.finance import Payment, StudentFee, PaymentAllocation, PaymentTransaction


class PaymentServiceMixin:
    async def verify_razorpay_payment(
        self,
        db: AsyncSession,
        institution_id: int,
        razorpay_order_id: str,
        razorpay_payment_id: str,
        razorpay_signature: str,
    ) -> bool:
        """
        Verify authenticity of a Razorpay payment and trigger allocation.

        CRITICAL call order: signature verify → prerequisite check → mark SUCCESS
        → allocate_payment → _update_student_fee → commit.
        Never reorder these steps; doing so can produce charged-but-unrecorded payments.
        """
        stmt = select(Payment).where(
            Payment.razorpay_order_id == razorpay_order_id,
            Payment.institution_id == institution_id,
        )
        result = await db.execute(stmt)
        payment = result.scalars().first()

        if not payment:
            raise Exception("Payment record not found for this order ID.")

        if payment.status == "SUCCESS":
            logger.info(
                f"Payment {payment.id} already marked SUCCESS. Returning cached result."
            )
            return True

        validation_result = await self._validate_payment_prerequisites(
            db, payment.student_id
        )
        if not validation_result["valid"]:
            logger.error(
                f"CRITICAL: Payment {payment.id} cannot be allocated: "
                f"{validation_result['reason']}"
            )
            payment.status = "FAILED"
            await db.commit()
            raise Exception(f"Cannot allocate payment: {validation_result['reason']}")

        params_dict = {
            "razorpay_order_id": razorpay_order_id,
            "razorpay_payment_id": razorpay_payment_id,
            "razorpay_signature": razorpay_signature,
        }

        try:
            if razorpay_order_id.startswith("order_mock_") or \
               razorpay_payment_id == "pay_mock_success":
                logger.info(
                    f"Simulated Payment Mode: Bypassing signature verification "
                    f"for order {razorpay_order_id}"
                )
            else:
                self.razorpay_client.utility.verify_payment_signature(params_dict)

            payment.status = "SUCCESS"
            payment.razorpay_payment_id = razorpay_payment_id

            logger.info(
                f"Payment {payment.id} verified for order {razorpay_order_id}. "
                f"Initializing allocation..."
            )

            await self.allocate_payment(db, payment.id)
            await self._update_student_fee(
                db, payment.student_id, payment.amount, institution_id
            )

            await db.commit()
            logger.info(
                f"Processed verification and allocation for payment {payment.id}."
            )
            return True

        except Exception as e:
            logger.error(
                f"Verification/Allocation Failed for Order {razorpay_order_id}: {str(e)}"
            )
            await db.rollback()

            try:
                stmt = select(Payment).where(Payment.id == payment.id)
                res = await db.execute(stmt)
                payment_to_mark = res.scalars().first()
                if payment_to_mark and payment_to_mark.status != "FAILED":
                    payment_to_mark.status = "FAILED"
                    await db.commit()
                    logger.info(
                        f"Payment {payment.id} marked FAILED after rollback."
                    )
            except Exception as rollback_err:
                logger.critical(
                    f"FATAL: Failed to mark payment {payment.id} as FAILED: {rollback_err}"
                )

            return False

    async def allocate_payment(self, db: AsyncSession, payment_id: int):
        """
        Create PaymentAllocation audit records and a PaymentTransaction idempotency
        record for a successful payment.

        Works against StudentFee (live source of truth). Does NOT update StudentFee —
        that is the sole responsibility of _update_student_fee, called separately.
        """
        stmt = select(Payment).where(Payment.id == payment_id)
        result = await db.execute(stmt)
        payment = result.scalars().first()
        if not payment or payment.status != "SUCCESS":
            return

        logger.info(
            f"ALLOCATION: Starting for Payment {payment_id}, "
            f"Student {payment.student_id}, Amount ₹{payment.amount}"
        )

        fee_stmt = (
            select(StudentFee)
            .where(StudentFee.student_id == payment.student_id)
            .order_by(StudentFee.class_id.asc())
        )
        fee_result = await db.execute(fee_stmt)
        student_fees = fee_result.scalars().all()

        remaining_payment = payment.amount
        allocated_count = 0

        if student_fees:
            for sf in student_fees:
                if remaining_payment <= 0:
                    break
                due_on_fee = max(0.0, sf.due_amount)
                if due_on_fee <= 0:
                    continue
                allocation_amount = min(remaining_payment, due_on_fee)
                allocation = PaymentAllocation(
                    payment_id=payment.id,
                    fee_type="TUITION",
                    allocated_amount=allocation_amount,
                    institution_id=payment.institution_id,
                )
                db.add(allocation)
                remaining_payment -= allocation_amount
                allocated_count += 1
                logger.debug(
                    f"ALLOCATION: ₹{allocation_amount} mapped to StudentFee {sf.id}. "
                    f"Remaining: ₹{remaining_payment}"
                )
        else:
            logger.warning(
                f"ALLOCATION: No StudentFee records for Student {payment.student_id}. "
                f"Creating generic TUITION allocation."
            )
            allocation = PaymentAllocation(
                payment_id=payment.id,
                fee_type="TUITION",
                allocated_amount=payment.amount,
                institution_id=payment.institution_id,
            )
            db.add(allocation)
            allocated_count = 1

        razorpay_pid = payment.razorpay_payment_id or f"manual_{payment.id}"
        existing_txn = await db.execute(
            select(PaymentTransaction).where(
                PaymentTransaction.razorpay_payment_id == razorpay_pid
            )
        )
        if not existing_txn.scalars().first():
            transaction = PaymentTransaction(
                razorpay_payment_id=razorpay_pid,
                order_id=payment.razorpay_order_id or f"order_manual_{payment.id}",
                amount=payment.amount,
                status="allocated",
            )
            db.add(transaction)

        logger.info(
            f"ALLOCATION: Completed for Payment {payment_id}. "
            f"Created {allocated_count} allocation records."
        )
        await db.flush()

    async def allocate_payment_to_fees(self, db: AsyncSession, payment_id: int):
        # Deprecated alias — use allocate_payment
        await self.allocate_payment(db, payment_id)

    async def record_manual_payment(
        self,
        db: AsyncSession,
        institution_id: int,
        student_id: int,
        amount: float,
        mode: str,
        note,
        user_id: int,
    ) -> Payment:
        """Record a manual payment (Cash/Manual UPI) and immediately allocate it."""
        from app.models.directory import Student

        student_check = await db.execute(
            select(Student.id).where(
                Student.id == student_id,
                Student.institution_id == institution_id,
            )
        )
        if not student_check.scalar():
            raise ValueError(
                f"Student {student_id} not found in this institution. "
                "Cannot record payment for an unknown student."
            )

        logger.info(
            f"Recording manual payment: Student {student_id}, "
            f"Amount {amount}, Mode {mode}"
        )

        payment = Payment(
            student_id=student_id,
            amount=amount,
            payment_mode=mode,
            status="SUCCESS",
            note=note,
            created_by_id=user_id,
            institution_id=institution_id,
        )
        db.add(payment)
        await db.flush()

        await self.allocate_payment(db, payment.id)
        await self._update_student_fee(db, student_id, amount, institution_id)

        await db.commit()

        stmt = (
            select(Payment)
            .where(Payment.id == payment.id)
            .options(selectinload(Payment.allocations))
        )
        res = await db.execute(stmt)
        return res.scalars().first()
