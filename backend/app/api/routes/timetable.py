from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_admin, UserContext
from app.models.directory import Teacher, Parent, Student
from app.models.academic import SchoolClass
from app.schemas.timetable import (
    SchedulePeriodCreate,
    SchedulePeriodUpdate,
    SchedulePeriodResponse,
    TimetableSlotCreate,
    TimetableSlotUpdate,
    TimetableSlotResponse,
    ClassTimetableResponse,
    TeacherTimetableResponse,
)
from app.services.timetable_service import timetable_service

router = APIRouter(prefix="/api/timetable", tags=["Timetable"])


# ---------------- Schedule Periods (bell schedule) ----------------

@router.get("/periods", response_model=List[SchedulePeriodResponse])
async def list_periods(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
):
    return await timetable_service.get_periods(db, user.institution_id)


@router.post(
    "/periods",
    response_model=SchedulePeriodResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_period(
    period_in: SchedulePeriodCreate,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin),
):
    return await timetable_service.create_period(db, admin.institution_id, period_in)


@router.put("/periods/{period_id}", response_model=SchedulePeriodResponse)
async def update_period(
    period_id: int,
    period_in: SchedulePeriodUpdate,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin),
):
    updated = await timetable_service.update_period(
        db, admin.institution_id, period_id, period_in
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Schedule period not found")
    return updated


@router.delete("/periods/{period_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_period(
    period_id: int,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin),
):
    success = await timetable_service.delete_period(
        db, admin.institution_id, period_id
    )
    if not success:
        raise HTTPException(status_code=404, detail="Schedule period not found")


# ---------------- Class Timetable ----------------

@router.get("/class/{class_id}", response_model=ClassTimetableResponse)
async def get_class_timetable(
    class_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
):
    """
    Returns the full week timetable for a class, plus the institution-wide
    bell schedule. Access:
      - admin / super_admin: any class in their institution
      - teacher: any class they are assigned to (via TeacherAssignment)
      - parent: only their own child's class
      - student: only their own class
    """
    # Look up the class scoped to institution.
    sc_res = await db.execute(
        select(SchoolClass).where(
            SchoolClass.id == class_id,
            SchoolClass.institution_id == user.institution_id,
        )
    )
    school_class = sc_res.scalars().first()
    if not school_class:
        raise HTTPException(status_code=404, detail="Class not found")

    # Authorize non-admin roles.
    if user.role in ("parent", "student"):
        # In this app, parents share the student's login — there's no separate
        # Parent record for many users. Authorize if any student linked to this
        # user (directly via Student.user_id, or indirectly via Parent.id) is
        # enrolled in the requested class.
        owned_class_ids: set[int] = set()

        # Direct student-as-self lookup
        direct_res = await db.execute(
            select(Student.school_class_id).where(
                Student.user_id == user.id,
                Student.institution_id == user.institution_id,
            )
        )
        owned_class_ids.update(cid for cid in direct_res.scalars().all() if cid)

        # Indirect parent → children lookup (only if a Parent record exists)
        parent_res = await db.execute(
            select(Parent).where(
                Parent.user_id == user.id,
                Parent.institution_id == user.institution_id,
            )
        )
        parent = parent_res.scalars().first()
        if parent:
            child_res = await db.execute(
                select(Student.school_class_id).where(Student.parent_id == parent.id)
            )
            owned_class_ids.update(cid for cid in child_res.scalars().all() if cid)

        if class_id not in owned_class_ids:
            raise HTTPException(
                status_code=403,
                detail="You can only view your own class timetable",
            )

    elif user.role == "teacher":
        from app.models.directory import TeacherAssignment

        teacher_res = await db.execute(
            select(Teacher).where(Teacher.user_id == user.id)
        )
        teacher = teacher_res.scalars().first()
        if not teacher:
            raise HTTPException(status_code=403, detail="Teacher profile not found")

        ta_res = await db.execute(
            select(TeacherAssignment).where(
                TeacherAssignment.teacher_id == teacher.id,
                TeacherAssignment.school_class_id == class_id,
            )
        )
        if not ta_res.scalars().first():
            raise HTTPException(
                status_code=403, detail="You are not assigned to this class"
            )

    periods = await timetable_service.get_periods(db, user.institution_id)
    slots = await timetable_service.get_slots_for_class(
        db, user.institution_id, class_id
    )

    return ClassTimetableResponse(
        school_class_id=class_id,
        school_class=school_class,
        periods=periods,
        slots=slots,
    )


# ---------------- Teacher Timetable (self) ----------------

@router.get("/me", response_model=TeacherTimetableResponse)
async def get_my_timetable(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
):
    """Currently logged-in teacher's weekly timetable across all classes."""
    if user.role not in ("teacher", "admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Teacher access required")

    teacher = await timetable_service.get_teacher_by_user_id(db, user.id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher profile not found")

    periods = await timetable_service.get_periods(db, user.institution_id)
    slots = await timetable_service.get_slots_for_teacher(
        db, user.institution_id, teacher.id
    )

    return TeacherTimetableResponse(
        teacher_id=teacher.id, periods=periods, slots=slots
    )


@router.get("/teacher/{teacher_id}", response_model=TeacherTimetableResponse)
async def get_teacher_timetable(
    teacher_id: int,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin),
):
    """Admin-only: view any teacher's weekly timetable."""
    periods = await timetable_service.get_periods(db, admin.institution_id)
    slots = await timetable_service.get_slots_for_teacher(
        db, admin.institution_id, teacher_id
    )
    return TeacherTimetableResponse(
        teacher_id=teacher_id, periods=periods, slots=slots
    )


# ---------------- Slot Management (admin only) ----------------

@router.post(
    "/slots",
    response_model=TimetableSlotResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upsert_slot(
    slot_in: TimetableSlotCreate,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin),
):
    """
    Create or overwrite a timetable slot for (class, period, day).
    If a slot already exists at that coordinate, it is updated in place.
    """
    try:
        return await timetable_service.upsert_slot(db, admin.institution_id, slot_in)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/slots/{slot_id}", response_model=TimetableSlotResponse)
async def update_slot(
    slot_id: int,
    slot_in: TimetableSlotUpdate,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin),
):
    try:
        updated = await timetable_service.update_slot(
            db, admin.institution_id, slot_id, slot_in
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not updated:
        raise HTTPException(status_code=404, detail="Timetable slot not found")
    return updated


@router.delete("/slots/{slot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_slot(
    slot_id: int,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin),
):
    success = await timetable_service.delete_slot(
        db, admin.institution_id, slot_id
    )
    if not success:
        raise HTTPException(status_code=404, detail="Timetable slot not found")
