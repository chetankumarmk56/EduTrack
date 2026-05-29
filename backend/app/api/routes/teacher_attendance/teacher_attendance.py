from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from app.core.database import get_db
from app.core.dependencies import (
    get_current_user, UserContext,
    require_teacher, require_institution_admin,
    require_teacher_strict,
)
from app.models.directory import Teacher
from app.schemas.teacher_attendance import (
    TeacherCheckInRequest, TeacherCheckOutRequest, TeacherAttendanceEditRequest,
    TeacherLeaveCreateRequest, LeaveActionRequest,
    TeacherAttendanceResponse, TeacherLeaveResponse, AuditLogResponse,
    PaginatedAttendanceResponse, PaginatedLeaveResponse,
)
import app.services.teacher_attendance as svc

router = APIRouter(prefix="/api/teacher-attendance", tags=["teacher-attendance"])


async def _resolve_teacher_id(db: AsyncSession, user: UserContext) -> int:
    """Resolve the teacher profile id from the logged-in user."""
    result = await db.execute(
        select(Teacher).where(
            Teacher.user_id == user.id,
            Teacher.institution_id == user.institution_id,
        )
    )
    teacher = result.scalars().first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher profile not found for this user")
    return teacher.id


# ── Teacher-facing: Today's status & attendance ───────────────────────────────

@router.get("/my/today", response_model=Optional[TeacherAttendanceResponse])
async def my_today_status(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_teacher_strict),
):
    teacher_id = await _resolve_teacher_id(db, user)
    return await svc.get_today_status(db, institution_id=user.institution_id, teacher_id=teacher_id)


@router.post("/my/check-in", response_model=TeacherAttendanceResponse)
async def my_check_in(
    body: TeacherCheckInRequest,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_teacher_strict),
):
    teacher_id = await _resolve_teacher_id(db, user)
    try:
        return await svc.teacher_check_in(
            db,
            institution_id=user.institution_id,
            teacher_id=teacher_id,
            user_id=user.id,
            remarks=body.remarks,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/my/check-out", response_model=TeacherAttendanceResponse)
async def my_check_out(
    body: TeacherCheckOutRequest,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_teacher_strict),
):
    teacher_id = await _resolve_teacher_id(db, user)
    try:
        return await svc.teacher_check_out(
            db,
            institution_id=user.institution_id,
            teacher_id=teacher_id,
            user_id=user.id,
            remarks=body.remarks,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/my/history", response_model=PaginatedAttendanceResponse)
async def my_attendance_history(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_teacher_strict),
):
    teacher_id = await _resolve_teacher_id(db, user)
    total, items = await svc.get_my_attendance_history(
        db,
        institution_id=user.institution_id,
        teacher_id=teacher_id,
        date_from=date_from,
        date_to=date_to,
        skip=skip,
        limit=limit,
    )
    return {"total": total, "items": items}


# ── Teacher-facing: Leave ─────────────────────────────────────────────────────

@router.post("/my/leave", response_model=TeacherLeaveResponse)
async def apply_leave(
    body: TeacherLeaveCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_teacher_strict),
):
    teacher_id = await _resolve_teacher_id(db, user)
    try:
        return await svc.apply_leave(
            db,
            institution_id=user.institution_id,
            teacher_id=teacher_id,
            user_id=user.id,
            leave_type=body.leave_type,
            start_date=body.start_date,
            end_date=body.end_date,
            reason=body.reason,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/my/leave", response_model=PaginatedLeaveResponse)
async def my_leaves(
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_teacher_strict),
):
    teacher_id = await _resolve_teacher_id(db, user)
    total, items = await svc.get_my_leaves(
        db,
        institution_id=user.institution_id,
        teacher_id=teacher_id,
        status=status,
        skip=skip,
        limit=limit,
    )
    return {"total": total, "items": items}


@router.post("/my/leave/{leave_id}/cancel", response_model=TeacherLeaveResponse)
async def cancel_leave(
    leave_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_teacher_strict),
):
    teacher_id = await _resolve_teacher_id(db, user)
    try:
        return await svc.cancel_leave(
            db,
            institution_id=user.institution_id,
            teacher_id=teacher_id,
            user_id=user.id,
            leave_id=leave_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Admin-facing ──────────────────────────────────────────────────────────────

@router.get("/admin/attendance", response_model=PaginatedAttendanceResponse,
            dependencies=[Depends(require_institution_admin)])
async def admin_list_attendance(
    teacher_id: Optional[int] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    include_absent: bool = Query(
        True,
        description=(
            "Synthesize ABSENT rows for teachers without a stored record on "
            "working days in the requested range. Excludes Sundays and days "
            "covered by approved leave. Capped to a 366-day window."
        ),
    ),
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
):
    total, items = await svc.admin_list_attendance(
        db,
        institution_id=user.institution_id,
        teacher_id=teacher_id,
        date_from=date_from,
        date_to=date_to,
        status=status,
        skip=skip,
        limit=limit,
        include_absent=include_absent,
    )
    return {"total": total, "items": items}


@router.put("/admin/attendance/{teacher_id}", response_model=TeacherAttendanceResponse,
            dependencies=[Depends(require_institution_admin)])
async def admin_edit_attendance(
    teacher_id: int,
    body: TeacherAttendanceEditRequest,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
):
    try:
        return await svc.admin_edit_attendance(
            db,
            institution_id=user.institution_id,
            teacher_id=teacher_id,
            date=body.date,
            admin_user_id=user.id,
            status=body.status,
            check_in_time=body.check_in_time,
            check_out_time=body.check_out_time,
            remarks=body.remarks,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/admin/leave", response_model=PaginatedLeaveResponse,
            dependencies=[Depends(require_institution_admin)])
async def admin_list_leaves(
    teacher_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
):
    total, items = await svc.admin_list_leaves(
        db,
        institution_id=user.institution_id,
        teacher_id=teacher_id,
        status=status,
        date_from=date_from,
        date_to=date_to,
        skip=skip,
        limit=limit,
    )
    return {"total": total, "items": items}


@router.post("/admin/leave/{leave_id}/approve", response_model=TeacherLeaveResponse,
             dependencies=[Depends(require_institution_admin)])
async def approve_leave(
    leave_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
):
    try:
        return await svc.admin_action_leave(
            db,
            institution_id=user.institution_id,
            leave_id=leave_id,
            admin_user_id=user.id,
            action="APPROVE",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/admin/leave/{leave_id}/reject", response_model=TeacherLeaveResponse,
             dependencies=[Depends(require_institution_admin)])
async def reject_leave(
    leave_id: int,
    body: LeaveActionRequest,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
):
    try:
        return await svc.admin_action_leave(
            db,
            institution_id=user.institution_id,
            leave_id=leave_id,
            admin_user_id=user.id,
            action="REJECT",
            rejection_reason=body.rejection_reason,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/admin/audit-logs", dependencies=[Depends(require_institution_admin)])
async def admin_audit_logs(
    teacher_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
):
    total, items = await svc.get_audit_logs(
        db,
        institution_id=user.institution_id,
        teacher_id=teacher_id,
        skip=skip,
        limit=limit,
    )
    return {"total": total, "items": items}


@router.get("/admin/summary", dependencies=[Depends(require_institution_admin)])
async def admin_summary(
    teacher_id: Optional[int] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
):
    data = await svc.get_attendance_summary(
        db,
        institution_id=user.institution_id,
        teacher_id=teacher_id,
        date_from=date_from,
        date_to=date_to,
    )
    return data
