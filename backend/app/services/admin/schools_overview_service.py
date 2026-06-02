"""
Schools Overview service — powers the Super-Admin "Schools Overview" page.

Everything here is built to stay N+1-free no matter how many schools exist:
student / teacher counts are aggregated at the DB level via grouped
sub-queries that are LEFT-JOINed onto the institutions table in a single
round-trip, and the principal name is resolved through one more joined
sub-query rather than a per-row lookup.
"""
from typing import Optional

from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.core import Institution, User
from app.models.directory import Student, Teacher
from app.services.storage_service import storage_service

# Columns the grid is allowed to sort on, mapped to the underlying SQL
# expression. Anything outside this allowlist falls back to name-ascending,
# so a malicious / stale sort_by can't reach an arbitrary column.
_SORT_COLUMNS = {
    "name": Institution.name,
    "code": Institution.slug,
    "created_at": Institution.created_at,
    "status": Institution.is_active,
}


def _student_counts_subq():
    return (
        select(
            Student.institution_id.label("inst_id"),
            func.count(Student.id).label("cnt"),
        )
        .group_by(Student.institution_id)
        .subquery()
    )


def _teacher_counts_subq():
    return (
        select(
            Teacher.institution_id.label("inst_id"),
            func.count(Teacher.id).label("cnt"),
        )
        .group_by(Teacher.institution_id)
        .subquery()
    )


def _principal_subq():
    # The "principal / administrator" is the school's admin user. A school can
    # have several admins; we surface the earliest-created one (lowest id) as
    # the canonical contact, picked with a grouped MIN so it stays one join.
    return (
        select(
            User.institution_id.label("inst_id"),
            func.min(User.id).label("min_uid"),
        )
        .where(User.role == "admin")
        .group_by(User.institution_id)
        .subquery()
    )


class SchoolsOverviewService:
    @staticmethod
    async def get_summary(db: AsyncSession) -> dict:
        """
        Platform-wide rollup for the dashboard cards. Trashed (soft-deleted)
        schools are excluded so the numbers match the grid below them.
        Five small aggregate queries — no per-school iteration.
        """
        active_only = Institution.deleted_at.is_(None)

        total_schools = await db.scalar(
            select(func.count(Institution.id)).where(active_only)
        ) or 0
        active_schools = await db.scalar(
            select(func.count(Institution.id)).where(
                active_only, Institution.is_active.is_(True)
            )
        ) or 0
        total_students = await db.scalar(
            select(func.count(Student.id))
            .join(Institution, Institution.id == Student.institution_id)
            .where(active_only)
        ) or 0
        total_teachers = await db.scalar(
            select(func.count(Teacher.id))
            .join(Institution, Institution.id == Teacher.institution_id)
            .where(active_only)
        ) or 0

        return {
            "total_schools": total_schools,
            "total_students": total_students,
            "total_teachers": total_teachers,
            "active_schools": active_schools,
            "inactive_schools": total_schools - active_schools,
        }

    @staticmethod
    async def get_overview(
        db: AsyncSession,
        *,
        skip: int = 0,
        limit: int = 20,
        search: Optional[str] = None,
        status: Optional[str] = None,
        sort_by: str = "name",
        sort_dir: str = "asc",
    ) -> dict:
        """
        Return one page of school rows (with aggregated counts) plus the total
        match count for pagination. `status` accepts 'active' / 'inactive';
        anything else means "no status filter".
        """
        students = _student_counts_subq()
        teachers = _teacher_counts_subq()
        principals = _principal_subq()
        principal = aliased(User)

        student_cnt = func.coalesce(students.c.cnt, 0).label("total_students")
        teacher_cnt = func.coalesce(teachers.c.cnt, 0).label("total_teachers")

        base = (
            select(
                Institution.id,
                Institution.name,
                Institution.slug,
                Institution.is_active,
                Institution.created_at,
                principal.name.label("principal_name"),
                student_cnt,
                teacher_cnt,
            )
            .select_from(Institution)
            .outerjoin(students, students.c.inst_id == Institution.id)
            .outerjoin(teachers, teachers.c.inst_id == Institution.id)
            .outerjoin(principals, principals.c.inst_id == Institution.id)
            .outerjoin(principal, principal.id == principals.c.min_uid)
            .where(Institution.deleted_at.is_(None))
        )

        # Count query mirrors the row filters but skips the count joins — it
        # only needs the institutions table, so pagination stays cheap.
        count_q = select(func.count(Institution.id)).where(
            Institution.deleted_at.is_(None)
        )

        if search:
            like = f"%{search.strip()}%"
            cond = or_(Institution.name.ilike(like), Institution.slug.ilike(like))
            base = base.where(cond)
            count_q = count_q.where(cond)

        if status == "active":
            base = base.where(Institution.is_active.is_(True))
            count_q = count_q.where(Institution.is_active.is_(True))
        elif status == "inactive":
            base = base.where(Institution.is_active.is_(False))
            count_q = count_q.where(Institution.is_active.is_(False))

        # Sorting. Count columns aren't real table columns, so they get their
        # own labels; everything else comes from the allowlist.
        if sort_by == "total_students":
            sort_expr = student_cnt
        elif sort_by == "total_teachers":
            sort_expr = teacher_cnt
        else:
            sort_expr = _SORT_COLUMNS.get(sort_by, Institution.name)
        sort_expr = sort_expr.desc() if sort_dir == "desc" else sort_expr.asc()
        # Stable tiebreaker so equal sort keys keep a deterministic page order.
        base = base.order_by(sort_expr, Institution.id.asc())

        total = await db.scalar(count_q) or 0
        rows = (await db.execute(base.offset(skip).limit(limit))).all()

        items = [
            {
                "id": r.id,
                "name": r.name,
                "code": r.slug,
                "principal_name": r.principal_name,
                "total_students": r.total_students,
                "total_teachers": r.total_teachers,
                "is_active": r.is_active,
                "created_at": r.created_at,
            }
            for r in rows
        ]
        return {"items": items, "total": total, "skip": skip, "limit": limit}

    @staticmethod
    async def get_detail(db: AsyncSession, inst_id: int) -> Optional[dict]:
        """Expanded profile for the details drawer: school + counts + admins."""
        inst = await db.scalar(
            select(Institution).where(
                Institution.id == inst_id, Institution.deleted_at.is_(None)
            )
        )
        if not inst:
            return None

        total_students = await db.scalar(
            select(func.count(Student.id)).where(Student.institution_id == inst_id)
        ) or 0
        total_teachers = await db.scalar(
            select(func.count(Teacher.id)).where(Teacher.institution_id == inst_id)
        ) or 0

        admin_rows = (
            await db.execute(
                select(User.id, User.name, User.email, User.is_active)
                .where(User.institution_id == inst_id, User.role == "admin")
                .order_by(User.id.asc())
            )
        ).all()

        return {
            "id": inst.id,
            "name": inst.name,
            "code": inst.slug,
            "is_active": inst.is_active,
            "created_at": inst.created_at,
            "logo_url": await storage_service.resolve_url(inst.logo_url),
            "total_students": total_students,
            "total_teachers": total_teachers,
            "admins": [
                {"id": a.id, "name": a.name, "email": a.email, "is_active": a.is_active}
                for a in admin_rows
            ],
        }


schools_overview_service = SchoolsOverviewService()
