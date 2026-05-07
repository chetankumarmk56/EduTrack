from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from app.core.config import settings
from app.core.logger import logger
from app.models.finance import Payment, FeeStructure, PaymentStatus
from app.models.directory import Student


class OrderServiceMixin:
    async def _validate_payment_prerequisites(
        self, db: AsyncSession, student_id: int
    ) -> dict:
        """
        Pre-validate that payment can be processed before confirming.
        Prevents charge-but-no-record scenarios where payment is charged
        but allocation fails due to missing data.
        """
        student_result = await db.execute(
            select(Student).where(Student.id == student_id)
        )
        student = student_result.scalars().first()

        if not student:
            logger.warning(f"VALIDATION: Student {student_id} not found")
            return {"valid": False, "reason": "Student record not found"}

        if not student.school_class_id:
            logger.warning(f"VALIDATION: Student {student_id} not assigned to any class")
            return {"valid": False, "reason": "Student not assigned to any class"}

        fee_result = await db.execute(
            select(FeeStructure).where(FeeStructure.student_id == student_id)
        )
        fees = fee_result.scalars().all()

        if not fees:
            logger.warning(
                f"VALIDATION: No fee structures found for student {student_id}"
            )
            return {
                "valid": False,
                "reason": "No fee structures configured for this student",
            }

        logger.info(f"VALIDATION: All prerequisites met for student {student_id}")
        return {"valid": True}

    async def create_razorpay_order(
        self,
        db: AsyncSession,
        institution_id: int,
        student_id: int,
        amount: float,
        user_id: int,
    ) -> dict:
        amount_paise = int(amount * 100)

        is_mock = "placeholder" in (settings.RAZORPAY_KEY_ID or "").lower() or \
                  "placeholder" in (settings.RAZORPAY_KEY_SECRET or "").lower()

        if is_mock:
            razorpay_order_id = f"order_mock_{int(datetime.now().timestamp())}"
            logger.info("Simulated Payment Mode: Skipping Razorpay API call.")
        else:
            try:
                order_data = {
                    "amount": amount_paise,
                    "currency": "INR",
                    "receipt": (
                        f"receipt_inst{institution_id}_std{student_id}"
                        f"_{int(datetime.now().timestamp())}"
                    ),
                    "notes": {
                        "student_id": student_id,
                        "institution_id": institution_id,
                        "created_by": user_id,
                    },
                }
                razorpay_order = self.razorpay_client.order.create(data=order_data)
                razorpay_order_id = razorpay_order["id"]
            except Exception as e:
                logger.error(f"Razorpay Order Error: {e}")
                raise Exception(f"Failed to create Razorpay order: {str(e)}")

        new_payment = Payment(
            student_id=student_id,
            amount=amount,
            payment_mode="UPI",
            status="PENDING",
            razorpay_order_id=razorpay_order_id,
            created_by_id=user_id,
            institution_id=institution_id,
        )
        db.add(new_payment)
        await db.commit()
        await db.refresh(new_payment)

        return {
            "order_id": razorpay_order_id,
            "amount": amount_paise,
            "key_id": settings.RAZORPAY_KEY_ID,
            "currency": "INR",
            "is_mock": is_mock,
        }

    async def cancel_razorpay_order(
        self,
        db: AsyncSession,
        institution_id: int,
        razorpay_order_id: str,
        student_id: int,
    ) -> bool:
        """Mark a pending Razorpay order as CANCELLED when user dismisses the modal."""
        result = await db.execute(
            select(Payment).where(
                Payment.razorpay_order_id == razorpay_order_id,
                Payment.institution_id == institution_id,
                Payment.student_id == student_id,
                Payment.status == PaymentStatus.PENDING,
            )
        )
        payment = result.scalars().first()

        if not payment:
            logger.warning(
                f"CANCEL: Pending payment not found for order {razorpay_order_id}"
            )
            return False

        payment.status = PaymentStatus.CANCELLED
        await db.commit()
        logger.info(
            f"CANCEL: Payment {payment.id} (Order {razorpay_order_id}) marked CANCELLED"
        )
        return True
