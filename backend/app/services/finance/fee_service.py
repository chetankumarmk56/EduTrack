from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Optional, Tuple
from datetime import datetime

from app.core.logger import logger
from app.models.finance import Payment, StudentFee, StudentFeeStatus, PaymentAllocation
from app.models.directory import Student
from app.schemas.finance import (
    StudentDuesResponse, CategoryWiseDue, PreviousYearArrear, ArrearsStudentResponse,
)


class FeeServiceMixin:
    @staticmethod
    async def _active_year_id(db: AsyncSession, institution_id: int) -> Optional[int]:
        """Active academic year id for read paths — never creates one."""
        from app.services.academic.academic_year_service import academic_year_service
        year = await academic_year_service.get_active_year(
            db, institution_id, create_if_missing=False
        )
        return year.id if year else None

    @staticmethod
    def _is_previous_year_arrear(fee, active_year_id: Optional[int]) -> bool:
        """A still-owed fee that belongs to a year other than the active one."""
        return bool(
            fee.due_amount and fee.due_amount > 0
            and fee.academic_year_id is not None
            and active_year_id is not None
            and fee.academic_year_id != active_year_id
        )

    async def get_institutional_arrears(
        self, db: AsyncSession, institution_id: int
    ) -> List[ArrearsStudentResponse]:
        """Students carrying unpaid fees from a previous (non-active) year.

        Powers the admin finance "carried-forward arrears" view. Returns []
        when the institution has no active year (can't classify yet).
        """
        active_year_id = await self._active_year_id(db, institution_id)
        if active_year_id is None:
            return []

        from app.models.directory import Parent  # noqa: F401 — relationship target

        res = await db.execute(
            select(StudentFee)
            .options(
                selectinload(StudentFee.school_class),
                selectinload(StudentFee.academic_year),
                selectinload(StudentFee.student).selectinload(Student.school_class),
                selectinload(StudentFee.student).selectinload(Student.parent),
            )
            .where(
                StudentFee.institution_id == institution_id,
                StudentFee.academic_year_id.is_not(None),
                StudentFee.academic_year_id != active_year_id,
                StudentFee.due_amount > 0,
                StudentFee.status != StudentFeeStatus.PAID,
            )
        )

        by_student: dict[int, ArrearsStudentResponse] = {}
        for fee in res.scalars().all():
            st = fee.student
            if not st:
                continue
            entry = by_student.get(st.id)
            if entry is None:
                entry = ArrearsStudentResponse(
                    student_id=st.id,
                    student_name=st.name,
                    admission_number=st.admission_number,
                    current_class_name=st.school_class.display_name if st.school_class else None,
                    phone=(st.parent.primary_phone if st.parent else None),
                    previous_year_due=0.0,
                    arrears=[],
                )
                by_student[st.id] = entry
            entry.previous_year_due = round(entry.previous_year_due + fee.due_amount, 2)
            entry.arrears.append(PreviousYearArrear(
                academic_year=fee.academic_year.label if fee.academic_year else None,
                class_name=fee.school_class.display_name if fee.school_class else None,
                due=fee.due_amount,
            ))

        return sorted(by_student.values(), key=lambda e: e.previous_year_due, reverse=True)

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
        # Local import keeps the finance package free of an import-time
        # dependency on the academic service.
        from app.services.academic.academic_year_service import academic_year_service
        year_id = await academic_year_service.resolve_active_year_id(db, institution_id)
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
                    academic_year_id=year_id,
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

        active_year_id = await self._active_year_id(db, institution_id)

        stmt = (
            select(StudentFee)
            .options(
                selectinload(StudentFee.school_class),
                selectinload(StudentFee.academic_year),
            )
            .where(
                StudentFee.student_id == student_id,
                StudentFee.institution_id == institution_id,
            )
        )
        result = await db.execute(stmt)
        fees = result.scalars().all()

        total_due = 0.0
        total_paid = 0.0
        previous_year_due = 0.0
        breakdown = []
        arrears: list[PreviousYearArrear] = []
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
            if self._is_previous_year_arrear(fee, active_year_id):
                previous_year_due += fee.due_amount
                arrears.append(PreviousYearArrear(
                    academic_year=fee.academic_year.label if fee.academic_year else None,
                    class_name=fee.school_class.display_name if fee.school_class else None,
                    due=fee.due_amount,
                ))

        is_overdue = bool(due_date and due_date < today and total_due > 0)

        return StudentDuesResponse(
            student_id=student_id,
            student_name=student.name,
            total_due=total_due,
            total_paid=total_paid,
            due_date=due_date,
            is_overdue=is_overdue,
            breakdown=breakdown,
            previous_year_due=round(previous_year_due, 2),
            arrears=arrears,
        )

    async def get_students_dues_bulk(
        self, db: AsyncSession, institution_id: int, student_ids: List[int]
    ) -> List[StudentDuesResponse]:
        """
        Bulk variant of get_student_dues. Two queries total regardless of N.
        Preserves input order; skips students not found in this institution.
        """
        from datetime import date as date_type

        if not student_ids:
            return []

        active_year_id = await self._active_year_id(db, institution_id)

        student_result = await db.execute(
            select(Student).where(
                Student.id.in_(student_ids),
                Student.institution_id == institution_id,
            )
        )
        students_by_id = {s.id: s for s in student_result.scalars().all()}

        fee_result = await db.execute(
            select(StudentFee)
            .options(
                selectinload(StudentFee.school_class),
                selectinload(StudentFee.academic_year),
            )
            .where(
                StudentFee.student_id.in_(student_ids),
                StudentFee.institution_id == institution_id,
            )
        )
        fees_by_student: dict[int, list[StudentFee]] = {}
        for fee in fee_result.scalars().all():
            fees_by_student.setdefault(fee.student_id, []).append(fee)

        today = date_type.today()
        responses: List[StudentDuesResponse] = []

        for sid in student_ids:
            student = students_by_id.get(sid)
            if not student:
                continue

            fees = fees_by_student.get(sid, [])
            total_due = 0.0
            total_paid = 0.0
            previous_year_due = 0.0
            breakdown: List[CategoryWiseDue] = []
            arrears: List[PreviousYearArrear] = []
            due_date = None

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
                if self._is_previous_year_arrear(fee, active_year_id):
                    previous_year_due += fee.due_amount
                    arrears.append(PreviousYearArrear(
                        academic_year=fee.academic_year.label if fee.academic_year else None,
                        class_name=fee.school_class.display_name if fee.school_class else None,
                        due=fee.due_amount,
                    ))

            is_overdue = bool(due_date and due_date < today and total_due > 0)
            responses.append(
                StudentDuesResponse(
                    student_id=sid,
                    student_name=student.name,
                    total_due=total_due,
                    total_paid=total_paid,
                    due_date=due_date,
                    is_overdue=is_overdue,
                    breakdown=breakdown,
                    previous_year_due=round(previous_year_due, 2),
                    arrears=arrears,
                )
            )

        return responses

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
        if new_paid_amount > student_fee.total_amount + 0.001:
            raise ValueError(
                f"Overpayment rejected for Student {student_id}: "
                f"attempted ₹{new_paid_amount:.2f} but total fee is ₹{student_fee.total_amount:.2f}."
            )

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
