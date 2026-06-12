from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_faculty, UserContext
from app.core.limiter import limiter, RATE_LIMITS
from app.models.directory import Student, Parent
from app.schemas import attendance as schemas
from app.services.attendance import attendance_service

router = APIRouter(prefix="/api/attendance", tags=["Attendance Tracking"])


async def _check_student_access(user: UserContext, student_id: int, db: AsyncSession) -> None:
    """Raise 403 unless the caller may view this student's attendance."""
    if user.role in ("super_admin", "admin", "teacher"):
        return
    if user.role == "student":
        res = await db.execute(
            select(Student).where(Student.user_id == user.id, Student.id == student_id,
                                  Student.institution_id == user.institution_id)
        )
        if res.scalars().first():
            return
    if user.role == "parent":
        p_res = await db.execute(
            select(Parent).where(Parent.user_id == user.id, Parent.institution_id == user.institution_id)
        )
        parent = p_res.scalars().first()
        if parent:
            ch_res = await db.execute(
                select(Student).where(Student.id == student_id, Student.parent_id == parent.id,
                                      Student.institution_id == user.institution_id)
            )
            if ch_res.scalars().first():
                return
        fb_res = await db.execute(
            select(Student).where(Student.user_id == user.id, Student.id == student_id,
                                  Student.institution_id == user.institution_id)
        )
        if fb_res.scalars().first():
            return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied. You may only view attendance for your own child.",
    )

# Default attendance window. A student over 3 years can accumulate
# 600+ records per subject; the eager-loaded student/class/grade/section
# joins blow that up into multi-MB JSON. Callers that genuinely need the
# full history must pass an explicit ``date_from`` (e.g. report-card
# generators) — the default keeps the parent dashboard fast.
_DEFAULT_WINDOW_DAYS = 90

@router.post("/", response_model=schemas.AttendanceResponse)
async def mark_attendance(
    att: schemas.AttendanceCreate, 
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_faculty)
):
    teacher_id = user.id if user.role == "teacher" else None
    result = await attendance_service.mark_attendance(db, user.institution_id, att, teacher_user_id=teacher_id)
    if not result:
        raise HTTPException(status_code=403, detail="Unauthorized to mark attendance for this student/class")
    return result

@router.post("/batch", response_model=List[schemas.AttendanceResponse])
@limiter.limit(RATE_LIMITS["attendance_batch"])
async def mark_attendance_batch(
    request: Request,
    response: Response,
    batch: schemas.AttendanceBatch,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_faculty)
):
    # `response: Response` is REQUIRED here: the limiter runs with
    # headers_enabled=True, so slowapi injects X-RateLimit-* headers after the
    # handler and raises "parameter `response` must be an instance of
    # starlette.responses.Response" if there's no Response param — which 500s
    # the request *after* attendance has already been committed.
    teacher_id = user.id if user.role == "teacher" else None
    return await attendance_service.mark_attendance_batch(db, user.institution_id, batch, teacher_user_id=teacher_id)

@router.get("/{student_id}", response_model=List[schemas.AttendanceResponse])
async def get_student_attendance(
    student_id: int,
    subject: Optional[str] = None,
    date_from: Optional[str] = Query(
        None,
        description="ISO date (YYYY-MM-DD). Defaults to today - 90 days when omitted.",
    ),
    date_to: Optional[str] = Query(
        None,
        description="ISO date (YYYY-MM-DD). Defaults to today when omitted.",
    ),
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
):
    await _check_student_access(user, student_id, db)
    if date_from is None:
        date_from = (date.today() - timedelta(days=_DEFAULT_WINDOW_DAYS)).isoformat()
    if date_to is None:
        date_to = date.today().isoformat()
    return await attendance_service.get_attendance(
        db, user.institution_id, student_id, subject,
        date_from=date_from, date_to=date_to,
    )

@router.get("/class/{school_class_id}/{date}", response_model=List[schemas.AttendanceResponse])
async def get_class_attendance(
    school_class_id: int, 
    date: str, 
    subject: str = None, 
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    return await attendance_service.get_class_attendance(db, user.institution_id, school_class_id, date, subject)
