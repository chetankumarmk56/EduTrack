"""
Homework-specific service layer.

Kept separate from ``announcement_service.py`` so homework / completion
logic does not bleed into the generic announcement read/write paths. The
announcement service still owns the announcement row itself; this module
owns the *confirmation* lifecycle and the per-child targeting rules that
homework requires.

Future announcement categories (circular, event, exam_notice, …) should
follow the same pattern: a sibling ``{category}_service.py`` keeps the
category-specific concerns isolated, and ``announcement_service`` stays
small.
"""
from __future__ import annotations

from typing import List, Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.communication import (
    Announcement,
    AnnouncementCategory,
    AnnouncementType,
    HomeworkConfirmation,
)
from app.models.directory import Parent, Student, Teacher


async def _resolve_parent_for_user(
    db: AsyncSession, user_id: int, institution_id: int
) -> Optional[Parent]:
    """Resolve the Parent profile for a logged-in user, if any.

    Parents and students often share the same login (see
    ``project_parent_student_login`` memory). We try the Parent table first
    and fall back to ``Student.parent_id`` so child-only logins still get
    attributed correctly.
    """
    parent_res = await db.execute(
        select(Parent).where(
            Parent.user_id == user_id, Parent.institution_id == institution_id
        )
    )
    parent = parent_res.scalars().first()
    if parent:
        return parent

    student_res = await db.execute(
        select(Student).where(
            Student.user_id == user_id, Student.institution_id == institution_id
        )
    )
    student = student_res.scalars().first()
    if student and student.parent_id:
        p_res = await db.execute(select(Parent).where(Parent.id == student.parent_id))
        return p_res.scalars().first()

    return None


async def _children_of_parent(db: AsyncSession, parent_id: int) -> List[Student]:
    res = await db.execute(
        select(Parent)
        .options(selectinload(Parent.students))
        .where(Parent.id == parent_id)
    )
    p = res.scalars().first()
    return list(p.students) if p else []


async def _student_is_targeted(announcement: Announcement, student: Student) -> bool:
    """A homework announcement targets a child if:
       - it's STUDENT-scoped and the IDs match, or
       - it's CLASS-scoped and the child is in that class.
    """
    if announcement.type == AnnouncementType.STUDENT:
        return announcement.student_id == student.id
    if announcement.type == AnnouncementType.CLASS:
        return announcement.class_id is not None and student.school_class_id == announcement.class_id
    return False


async def confirm_homework(
    db: AsyncSession,
    announcement_id: UUID,
    user_id: int,
    institution_id: int,
    student_id: int,
) -> HomeworkConfirmation:
    """Record a per-child homework completion confirmation.

    Authorisation rules:
      - The announcement must exist, belong to ``institution_id``, and be
        of category HOMEWORK.
      - The student must belong to the calling parent (one parent → many
        children, so we must verify *this* child is theirs).
      - The student must be in the announcement's audience.

    Idempotent: a second confirmation for the same (announcement, student)
    returns the existing row instead of erroring.
    """
    ann_res = await db.execute(
        select(Announcement).where(
            Announcement.id == announcement_id,
            Announcement.institution_id == institution_id,
        )
    )
    announcement = ann_res.scalars().first()
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
    if announcement.category != AnnouncementCategory.HOMEWORK:
        raise HTTPException(
            status_code=400, detail="This announcement is not a homework"
        )

    parent = await _resolve_parent_for_user(db, user_id, institution_id)
    if not parent:
        raise HTTPException(
            status_code=403,
            detail="Only parents (or parent-linked students) can confirm homework",
        )

    stu_res = await db.execute(
        select(Student).where(
            Student.id == student_id,
            Student.institution_id == institution_id,
        )
    )
    student = stu_res.scalars().first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if student.parent_id != parent.id:
        raise HTTPException(
            status_code=403, detail="This student is not linked to your account"
        )
    if not await _student_is_targeted(announcement, student):
        raise HTTPException(
            status_code=400,
            detail="This homework was not assigned to the selected student",
        )

    # Idempotency — the unique constraint protects us from races, but check
    # first so we can return the existing row without raising.
    existing_res = await db.execute(
        select(HomeworkConfirmation).where(
            HomeworkConfirmation.announcement_id == announcement_id,
            HomeworkConfirmation.student_id == student_id,
        )
    )
    existing = existing_res.scalars().first()
    if existing:
        return existing

    row = HomeworkConfirmation(
        announcement_id=announcement_id,
        student_id=student_id,
        parent_id=parent.id,
    )
    db.add(row)
    try:
        await db.commit()
        await db.refresh(row)
    except Exception:
        # Concurrent insert won the race — fetch and return the winner.
        await db.rollback()
        again = await db.execute(
            select(HomeworkConfirmation).where(
                HomeworkConfirmation.announcement_id == announcement_id,
                HomeworkConfirmation.student_id == student_id,
            )
        )
        row = again.scalars().first()
        if not row:
            raise
    return row


async def list_confirmations_for_teacher(
    db: AsyncSession,
    announcement_id: UUID,
    user_id: int,
    institution_id: int,
) -> dict:
    """Teacher-facing breakdown of who confirmed a homework and who hasn't.

    Returns ``{"confirmed": [...], "pending": [...]}``. Only the announcement's
    author can see the audit list; other teachers in the same institution cannot.
    """
    ann_res = await db.execute(
        select(Announcement).where(
            Announcement.id == announcement_id,
            Announcement.institution_id == institution_id,
        )
    )
    announcement = ann_res.scalars().first()
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
    if announcement.category != AnnouncementCategory.HOMEWORK:
        raise HTTPException(
            status_code=400, detail="This announcement is not a homework"
        )

    teacher_res = await db.execute(
        select(Teacher).where(
            Teacher.user_id == user_id, Teacher.institution_id == institution_id
        )
    )
    teacher = teacher_res.scalars().first()
    if not teacher or teacher.id != announcement.teacher_id:
        raise HTTPException(
            status_code=403, detail="Only the announcement author can view confirmations"
        )

    from app.models.core import User as AuthUser

    rows_res = await db.execute(
        select(
            HomeworkConfirmation,
            Student.name.label("student_name"),
            AuthUser.name.label("parent_name"),
        )
        .join(Student, Student.id == HomeworkConfirmation.student_id)
        .outerjoin(Parent, Parent.id == HomeworkConfirmation.parent_id)
        .outerjoin(AuthUser, AuthUser.id == Parent.user_id)
        .where(HomeworkConfirmation.announcement_id == announcement_id)
        .order_by(HomeworkConfirmation.confirmed_at.desc())
    )
    confirmed: List[dict] = []
    confirmed_student_ids: set[int] = set()
    for row in rows_res.all():
        hc, student_name, parent_name = row
        confirmed_student_ids.add(hc.student_id)
        confirmed.append(
            {
                "id": hc.id,
                "announcement_id": hc.announcement_id,
                "student_id": hc.student_id,
                "parent_id": hc.parent_id,
                "confirmed_at": hc.confirmed_at,
                "student_name": student_name,
                "parent_name": parent_name,
            }
        )

    # Pending = audience members minus those who have confirmed.
    targeted_students: List[Student] = []
    if announcement.type == AnnouncementType.STUDENT and announcement.student_id:
        stu_res = await db.execute(
            select(Student).where(
                Student.id == announcement.student_id,
                Student.institution_id == institution_id,
            )
        )
        targeted_students = list(stu_res.scalars().all())
    elif announcement.type == AnnouncementType.CLASS and announcement.class_id:
        stu_res = await db.execute(
            select(Student)
            .where(
                Student.school_class_id == announcement.class_id,
                Student.institution_id == institution_id,
            )
            .order_by(Student.name)
        )
        targeted_students = list(stu_res.scalars().all())

    pending: List[dict] = [
        {"student_id": s.id, "student_name": s.name}
        for s in targeted_students
        if s.id not in confirmed_student_ids
    ]

    return {"confirmed": confirmed, "pending": pending}


async def homework_target_count(
    db: AsyncSession, announcement: Announcement
) -> int:
    """How many distinct students the homework is owed by.

    STUDENT-scoped → 1. CLASS-scoped → headcount of the class.
    """
    if announcement.type == AnnouncementType.STUDENT:
        return 1
    if announcement.type == AnnouncementType.CLASS and announcement.class_id:
        from sqlalchemy import func

        res = await db.execute(
            select(func.count(Student.id)).where(
                Student.school_class_id == announcement.class_id,
                Student.institution_id == announcement.institution_id,
            )
        )
        return int(res.scalar() or 0)
    return 0


async def get_my_children_status(
    db: AsyncSession,
    announcement: Announcement,
    user_id: int,
    institution_id: int,
) -> List[dict]:
    """Per-child confirmation status for a parent viewing a homework.

    Returns one entry per *targeted* child of the calling parent. For
    non-homework announcements returns []. For non-parent callers returns [].
    """
    if announcement.category != AnnouncementCategory.HOMEWORK:
        return []

    parent = await _resolve_parent_for_user(db, user_id, institution_id)
    if not parent:
        return []

    children = await _children_of_parent(db, parent.id)
    targeted = [c for c in children if await _student_is_targeted(announcement, c)]
    if not targeted:
        return []

    confirmed_res = await db.execute(
        select(HomeworkConfirmation).where(
            HomeworkConfirmation.announcement_id == announcement.id,
            HomeworkConfirmation.student_id.in_([c.id for c in targeted]),
        )
    )
    by_student = {row.student_id: row for row in confirmed_res.scalars().all()}

    out: List[dict] = []
    for child in targeted:
        row = by_student.get(child.id)
        out.append(
            {
                "student_id": child.id,
                "student_name": child.name,
                "confirmed": row is not None,
                "confirmed_at": row.confirmed_at if row else None,
                "confirmed_by_parent_id": row.parent_id if row else None,
            }
        )
    return out


homework_service = type("HomeworkServiceNS", (), {
    "confirm_homework": staticmethod(confirm_homework),
    "list_confirmations_for_teacher": staticmethod(list_confirmations_for_teacher),
    "homework_target_count": staticmethod(homework_target_count),
    "get_my_children_status": staticmethod(get_my_children_status),
})()
