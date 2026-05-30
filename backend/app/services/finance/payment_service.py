"""
Admin-side manual payment recording.

The only entry point here is `record_manual_payment` — used by the Finance
dashboard's "Record Payment" button so an admin can log a Cash or Manual
UPI entry directly from the office (e.g. when a parent pays in person
without going through the parent portal).

Parent-initiated UPI payments live in `app.services.manual_payment.*`
(the verification workflow). This module never touches that flow.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.logger import logger
from app.models.finance import Payment, StudentFee, PaymentAllocation
from app.services.finance.ledger_helpers import write_ledger_entry


class PaymentServiceMixin:
    async def allocate_payment(self, db: AsyncSession, payment_id: int):
        """
        Create PaymentAllocation rows describing how a successful payment is
        distributed across the student's StudentFee records.

        Does not mutate StudentFee — that is `_update_student_fee`'s job.
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
        """Record a manual payment (Cash / Manual UPI) and allocate it."""
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

        student_res = await db.execute(
            select(Student).where(Student.id == student_id)
        )
        student = student_res.scalars().first()
        if student:
            await write_ledger_entry(
                db,
                institution_id=institution_id,
                payment=payment,
                student=student,
                payment_method=mode,
                payment_status="SUCCESS",
                notes=note,
                recorded_by_id=user_id,
            )

        await db.commit()

        stmt = (
            select(Payment)
            .where(Payment.id == payment.id)
            .options(selectinload(Payment.allocations))
        )
        res = await db.execute(stmt)
        return res.scalars().first()
