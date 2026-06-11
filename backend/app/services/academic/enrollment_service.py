"""
Enrollment upsert helpers.

`Enrollment` is the per-year roster of record. It must stay complete for any
historical "who was in class X in year Y" query, so it is written not only by
the promotion job but also whenever a student is created or moved during the
year (via `ensure_active_enrollment`). Snapshots of the grade/section/class
names are captured at write time and never rewritten on a later rename.
"""
from __future__ import annotations

from typing import Optional, Tuple

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.academic import (
    SchoolClass, Enrollment, ENROLLMENT_ACTIVE,
)
from app.services.academic.academic_year_service import academic_year_service


async def class_snapshot(
    db: AsyncSession, school_class_id: Optional[int]
) -> Tuple[Optional[int], Optional[str], Optional[str], Optional[str]]:
    """Return (grade_id, grade_name, section_name, class_name) for a class.

    class_name prefers the class's display_name, falling back to
    "<grade>-<section>". All-None when the class is missing/unassigned.
    """
    if not school_class_id:
        return None, None, None, None
    res = await db.execute(
        select(SchoolClass)
        .options(selectinload(SchoolClass.grade), selectinload(SchoolClass.section))
        .where(SchoolClass.id == school_class_id)
    )
    sc = res.scalars().first()
    if not sc:
        return None, None, None, None
    grade_name = sc.grade.name if sc.grade else None
    section_name = sc.section.name if sc.section else None
    class_name = sc.display_name or (
        f"{grade_name}-{section_name}" if grade_name and section_name else grade_name
    )
    return sc.grade_id, grade_name, section_name, class_name


async def upsert_enrollment(
    db: AsyncSession,
    *,
    institution_id: int,
    student_id: int,
    school_class_id: Optional[int],
    academic_year_id: int,
    status: str = ENROLLMENT_ACTIVE,
    roll_number: Optional[int] = None,
) -> Enrollment:
    """Create or update the (student, year) enrollment with fresh snapshots.

    Flushes within the caller's transaction; never commits.
    """
    grade_id, grade_name, section_name, class_name = await class_snapshot(db, school_class_id)

    existing = (await db.execute(
        select(Enrollment).where(
            Enrollment.student_id == student_id,
            Enrollment.academic_year_id == academic_year_id,
        ).limit(1)
    )).scalars().first()

    if existing:
        existing.school_class_id = school_class_id
        existing.grade_id = grade_id
        existing.grade_name_snapshot = grade_name
        existing.section_name_snapshot = section_name
        existing.class_name_snapshot = class_name
        existing.status = status
        if roll_number is not None:
            existing.roll_number = roll_number
        await db.flush()
        return existing

    enrollment = Enrollment(
        student_id=student_id,
        school_class_id=school_class_id,
        grade_id=grade_id,
        academic_year_id=academic_year_id,
        status=status,
        roll_number=roll_number,
        grade_name_snapshot=grade_name,
        section_name_snapshot=section_name,
        class_name_snapshot=class_name,
        institution_id=institution_id,
    )
    db.add(enrollment)
    await db.flush()
    return enrollment


async def ensure_active_enrollment(
    db: AsyncSession, institution_id: int, student
) -> Optional[Enrollment]:
    """Upsert the active-year enrollment for a just-created/moved student.

    No-op (returns None) when the student has no class assigned or the
    institution has no active year. Called from the student create/update
    flow so the per-year roster stays complete for mid-year joiners.
    """
    if not getattr(student, "school_class_id", None):
        return None
    year_id = await academic_year_service.resolve_active_year_id(db, institution_id)
    if not year_id:
        return None
    return await upsert_enrollment(
        db,
        institution_id=institution_id,
        student_id=student.id,
        school_class_id=student.school_class_id,
        academic_year_id=year_id,
        status=ENROLLMENT_ACTIVE,
        roll_number=getattr(student, "roll_number", None),
    )
