from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case
from typing import List

from app.core.logger import logger
from app.models.finance import Payment, StudentFee, StudentFeeStatus
from app.models.directory import Student
from app.models.academic import SchoolClass
from app.schemas.finance import (
    FinanceSummaryResponse,
    CategoryTotal,
    DefaulterResponse,
)


class ReportingServiceMixin:
    async def get_finance_summary(
        self, db: AsyncSession, institution_id: int
    ) -> FinanceSummaryResponse:
        """Institutional finance summary using optimised aggregations."""
        collected_stmt = select(func.sum(Payment.amount)).where(
            Payment.institution_id == institution_id,
            Payment.status == "SUCCESS",
        )
        collected_res = await db.execute(collected_stmt)
        total_collected = collected_res.scalar() or 0.0

        pending_stmt = select(func.sum(StudentFee.due_amount)).where(
            StudentFee.institution_id == institution_id
        )
        pending_res = await db.execute(pending_stmt)
        total_pending = pending_res.scalar() or 0.0

        cat_collected = (
            [CategoryTotal(category="TUITION", amount=total_collected)]
            if total_collected > 0
            else []
        )
        cat_pending = (
            [CategoryTotal(category="TUITION", amount=total_pending)]
            if total_pending > 0
            else []
        )

        return FinanceSummaryResponse(
            total_collected=total_collected,
            total_pending=total_pending,
            category_collected=cat_collected,
            category_pending=cat_pending,
        )

    async def get_class_finance_breakdown(
        self, db: AsyncSession, institution_id: int
    ):
        """
        Per-class breakdown: student counts (paid/partial/unpaid/no-record),
        expected, collected, and pending amounts.

        Uses 4 aggregated queries instead of N*6 queries (eliminates N+1).
        """
        from app.schemas.finance import ClassFinanceRow, ClassFinanceBreakdownResponse
        from app.models.academic import Grade

        # Query 1: All school classes for this institution
        sc_res = await db.execute(
            select(SchoolClass)
            .where(SchoolClass.institution_id == institution_id)
            .order_by(SchoolClass.display_name)
        )
        school_classes = sc_res.scalars().all()

        if not school_classes:
            return ClassFinanceBreakdownResponse(
                rows=[],
                grand_total_expected=0.0,
                grand_total_collected=0.0,
                grand_total_pending=0.0,
                total_classes_with_fee=0,
                total_students=0,
            )

        class_ids = [sc.id for sc in school_classes]

        # Query 2: Grade fees for classes that have no fee set directly
        grade_ids_needing_lookup = {
            sc.grade_id
            for sc in school_classes
            if sc.grade_id and not (sc.total_fee or sc.tuition_fee)
        }
        grades_map: dict = {}
        if grade_ids_needing_lookup:
            grades_res = await db.execute(
                select(Grade).where(Grade.id.in_(grade_ids_needing_lookup))
            )
            grades_map = {g.id: g for g in grades_res.scalars().all()}

        # Query 3: Active student counts per class (single GROUP BY)
        student_count_res = await db.execute(
            select(Student.school_class_id, func.count(Student.id))
            .where(
                Student.institution_id == institution_id,
                Student.is_active == True,
                Student.school_class_id.in_(class_ids),
            )
            .group_by(Student.school_class_id)
        )
        student_counts: dict = {row[0]: row[1] for row in student_count_res.all()}

        # Query 4: Fee aggregations per class (single GROUP BY with CASE sums)
        fee_agg_res = await db.execute(
            select(
                StudentFee.class_id,
                func.sum(
                    case((StudentFee.status == StudentFeeStatus.PAID.value, 1), else_=0)
                ).label("paid_count"),
                func.sum(
                    case((StudentFee.status == StudentFeeStatus.PARTIAL.value, 1), else_=0)
                ).label("partial_count"),
                func.sum(
                    case((StudentFee.status == StudentFeeStatus.UNPAID.value, 1), else_=0)
                ).label("unpaid_count"),
                func.coalesce(func.sum(StudentFee.amount_paid), 0.0).label("total_collected"),
                func.coalesce(func.sum(StudentFee.due_amount), 0.0).label("total_pending"),
            )
            .where(StudentFee.class_id.in_(class_ids))
            .group_by(StudentFee.class_id)
        )
        fee_agg: dict = {row[0]: row for row in fee_agg_res.all()}

        rows = []
        grand_total_expected = 0.0
        grand_total_collected = 0.0
        grand_total_pending = 0.0
        total_students_all = 0

        for sc in school_classes:
            fee_per_student = sc.total_fee or sc.tuition_fee or 0.0
            if fee_per_student == 0.0 and sc.grade_id and sc.grade_id in grades_map:
                fee_per_student = grades_map[sc.grade_id].tuition_fee or 0.0

            total_students = student_counts.get(sc.id, 0)
            if total_students == 0 and fee_per_student == 0.0:
                continue

            agg = fee_agg.get(sc.id)
            paid_count = int(agg[1]) if agg else 0
            partial_count = int(agg[2]) if agg else 0
            unpaid_count = int(agg[3]) if agg else 0
            total_collected = float(agg[4]) if agg else 0.0
            total_pending = float(agg[5]) if agg else 0.0

            fee_record_count = paid_count + partial_count + unpaid_count
            no_record_count = max(0, total_students - fee_record_count)
            total_expected = fee_per_student * total_students

            grand_total_expected += total_expected
            grand_total_collected += total_collected
            grand_total_pending += total_pending
            total_students_all += total_students

            class_name = sc.display_name or f"Class {sc.grade_id}-{sc.section_id}"

            rows.append(
                ClassFinanceRow(
                    class_id=sc.id,
                    class_name=class_name,
                    fee_per_student=fee_per_student,
                    total_students=total_students,
                    paid_count=paid_count,
                    partial_count=partial_count,
                    unpaid_count=unpaid_count,
                    no_record_count=no_record_count,
                    total_expected=total_expected,
                    total_collected=total_collected,
                    total_pending=total_pending,
                )
            )

        total_classes_with_fee = sum(1 for r in rows if r.fee_per_student > 0)

        return ClassFinanceBreakdownResponse(
            rows=rows,
            grand_total_expected=grand_total_expected,
            grand_total_collected=grand_total_collected,
            grand_total_pending=grand_total_pending,
            total_classes_with_fee=total_classes_with_fee,
            total_students=total_students_all,
        )

    async def get_defaulters(
        self, db: AsyncSession, institution_id: int
    ) -> List[DefaulterResponse]:
        """Identify students with outstanding balances, ordered by amount owed."""
        stmt = (
            select(
                Student.id,
                Student.name,
                func.sum(StudentFee.due_amount).label("total_due"),
                SchoolClass.display_name.label("class_name"),
                Student.parent_phone.label("phone"),
                SchoolClass.id.label("class_id"),
                SchoolClass.grade_id.label("grade_id"),
            )
            .join(StudentFee, Student.id == StudentFee.student_id)
            .join(SchoolClass, Student.school_class_id == SchoolClass.id, isouter=True)
            .where(Student.institution_id == institution_id)
            .group_by(
                Student.id,
                Student.name,
                SchoolClass.display_name,
                Student.parent_phone,
                SchoolClass.id,
                SchoolClass.grade_id,
            )
            .having(func.sum(StudentFee.due_amount) > 0)
            .order_by(func.sum(StudentFee.due_amount).desc())
        )

        result = await db.execute(stmt)
        return [
            DefaulterResponse(
                student_id=row[0],
                student_name=row[1],
                total_due=row[2],
                class_name=row[3],
                phone=row[4],
                class_id=row[5],
                grade_id=row[6],
            )
            for row in result.all()
        ]
