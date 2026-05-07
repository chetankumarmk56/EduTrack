from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Optional, Tuple
from datetime import datetime

from app.core.logger import logger
from app.models.finance import Payment, StudentFee, StudentFeeStatus, PaymentAllocation
from app.models.directory import Student
from app.schemas.finance import StudentDuesResponse, CategoryWiseDue


class FeeServiceMixin:
    async def get_or_create_student_fee(
        self,
        db: AsyncSession,
        student_id: int,
        class_id: int,
        institution_id: int,
        total_amount: float = 0.0,
        due_date: Optional[datetime] = None,
    ) -> StudentFee:
        """
        Idempotently get or create a StudentFee record. Updates stale totals
        when the incoming amount is meaningful (> 0) and differs from stored value.
        """
        from sqlalchemy.exc import IntegrityError

        stmt = select(StudentFee).where(
            StudentFee.student_id == student_id,
            StudentFee.class_id == class_id,
        )
        res = await db.execute(stmt)
        existing = res.scalars().first()

        if existing:
            if total_amount > 0 and existing.total_amount != total_amount:
                old_amount = existing.total_amount
                existing.total_amount = total_amount
                existing.due_amount = max(0.0, total_amount - existing.amount_paid)
                if existing.due_amount <= 0:
                    existing.status = StudentFeeStatus.PAID
                elif existing.amount_paid > 0:
                    existing.status = StudentFeeStatus.PARTIAL
                else:
                    existing.status = StudentFeeStatus.UNPAID
                if due_date and existing.due_date != due_date:
                    existing.due_date = due_date
                logger.info(
                    f"FEE_UPDATE: StudentFee for Student {student_id}, Class {class_id}: "
                    f"₹{old_amount} → ₹{total_amount}, due=₹{existing.due_amount}"
                )
            return existing

        from datetime import date
        try:
            async with db.begin_nested():
                new_fee = StudentFee(
                    student_id=student_id,
                    class_id=class_id,
                    institution_id=institution_id,
                    total_amount=total_amount,
                    due_amount=total_amount,
                    amount_paid=0.0,
                    due_date=due_date if due_date else date.today(),
                    status=StudentFeeStatus.UNPAID,
                )
                db.add(new_fee)
                await db.flush()
                logger.info(
                    f"FEE_IDEMPOTENCY: Created StudentFee for Student {student_id}, "
                    f"Class {class_id}, Amount=₹{total_amount}"
                )
                return new_fee
        except IntegrityError as e:
            logger.warning(
                f"FEE_IDEMPOTENCY: Constraint violation for Student {student_id}, "
                f"Class {class_id}. Details: {str(e)}"
            )
            res = await db.execute(stmt)
            return res.scalars().first()

    async def get_student_dues(
        self, db: AsyncSession, institution_id: int, student_id: int
    ) -> Optional[StudentDuesResponse]:
        from datetime import date as date_type

        student_result = await db.execute(
            select(Student).where(
                Student.id == student_id,
                Student.institution_id == institution_id,
            )
        )
        student = student_result.scalars().first()
        if not student:
            return None

        stmt = select(StudentFee).where(
            StudentFee.student_id == student_id,
            StudentFee.institution_id == institution_id,
        )
        result = await db.execute(stmt)
        fees = result.scalars().all()

        total_due = 0.0
        total_paid = 0.0
        breakdown = []
        due_date = None
        today = date_type.today()

        for fee in fees:
            total_due += fee.due_amount
            total_paid += fee.amount_paid
            if fee.due_date and (due_date is None or fee.due_date < due_date):
                due_date = fee.due_date
            if fee.total_amount > 0:
                breakdown.append(
                    CategoryWiseDue(
                        fee_type="TUITION",
                        total=fee.total_amount,
                        paid=fee.amount_paid,
                        due=fee.due_amount,
                    )
                )

        is_overdue = bool(due_date and due_date < today and total_due > 0)

        return StudentDuesResponse(
            student_id=student_id,
            student_name=student.name,
            total_due=total_due,
            total_paid=total_paid,
            due_date=due_date,
            is_overdue=is_overdue,
            breakdown=breakdown,
        )

    async def get_student_payments(
        self,
        db: AsyncSession,
        institution_id: int,
        student_id: int,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Payment]:
        stmt = (
            select(Payment)
            .where(
                Payment.student_id == student_id,
                Payment.institution_id == institution_id,
            )
            .options(selectinload(Payment.allocations))
            .order_by(Payment.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(stmt)
        return result.scalars().all()

    async def get_all_payments(
        self,
        db: AsyncSession,
        institution_id: int,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        mode: Optional[str] = None,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[List[Payment], int]:
        stmt = select(Payment).where(Payment.institution_id == institution_id)
        count_stmt = select(func.count(Payment.id)).where(
            Payment.institution_id == institution_id
        )

        if date_from:
            stmt = stmt.where(Payment.created_at >= date_from)
            count_stmt = count_stmt.where(Payment.created_at >= date_from)
        if date_to:
            stmt = stmt.where(Payment.created_at <= date_to)
            count_stmt = count_stmt.where(Payment.created_at <= date_to)
        if mode:
            stmt = stmt.where(Payment.payment_mode == mode)
            count_stmt = count_stmt.where(Payment.payment_mode == mode)
        if status:
            stmt = stmt.where(Payment.status == status)
            count_stmt = count_stmt.where(Payment.status == status)

        total_result = await db.execute(count_stmt)
        total = total_result.scalar()

        stmt = (
            stmt.options(selectinload(Payment.allocations))
            .order_by(Payment.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(stmt)
        items = result.scalars().all()

        return items, total

    async def _update_student_fee(
        self,
        db: AsyncSession,
        student_id: int,
        amount: float,
        institution_id: int,
    ):
        """Update the StudentFee record after a successful payment."""
        from app.models.finance import StudentFee, StudentFeeStatus
        from app.models.directory import Student

        logger.info(
            f"FEE_SYNC: Updating StudentFee for Student {student_id}, Amount: {amount}"
        )

        student_res = await db.execute(
            select(Student.school_class_id).where(Student.id == student_id)
        )
        class_id = student_res.scalar()
        if not class_id:
            logger.warning(
                f"FEE_SYNC: Student {student_id} not in any class. Skipping fee update."
            )
            return

        fee_stmt = select(StudentFee).where(
            StudentFee.student_id == student_id,
            StudentFee.class_id == class_id,
            StudentFee.institution_id == institution_id,
        )
        fee_res = await db.execute(fee_stmt)
        student_fee = fee_res.scalars().first()

        if not student_fee:
            logger.warning(
                f"FEE_SYNC: No StudentFee record for Student {student_id} in Class {class_id}."
            )
            return

        if student_fee.due_amount <= 0 and amount > 0:
            logger.warning(
                f"FEE_SAFEGUARD: Student {student_id} already has zero due. Skipping."
            )
            return

        new_paid_amount = student_fee.amount_paid + amount
        if new_paid_amount > student_fee.total_amount:
            logger.error(
                f"FEE_VALIDATION: Overpayment for Student {student_id}. "
                f"Attempted: {new_paid_amount}, Max: {student_fee.total_amount}"
            )
            new_paid_amount = student_fee.total_amount

        student_fee.amount_paid = new_paid_amount
        student_fee.due_amount = max(0.0, student_fee.total_amount - student_fee.amount_paid)

        if student_fee.due_amount <= 0:
            student_fee.status = StudentFeeStatus.PAID
        elif student_fee.amount_paid > 0:
            student_fee.status = StudentFeeStatus.PARTIAL
        else:
            student_fee.status = StudentFeeStatus.UNPAID

        logger.info(
            f"AUDIT_PAYMENT: StudentFee {student_fee.id} updated for Student {student_id}. "
            f"Paid: {student_fee.amount_paid}, Due: {student_fee.due_amount}, "
            f"Status: {student_fee.status}"
        )
        await db.flush()
