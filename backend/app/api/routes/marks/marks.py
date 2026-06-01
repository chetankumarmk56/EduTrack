from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_faculty, UserContext
from app.core.limiter import limiter, RATE_LIMITS
from app.models.directory import Student, Parent
from app.schemas import mark as schemas
from app.services.marks import marks_service

router = APIRouter(prefix="/api/marks", tags=["Assessment & Marks"])


async def _check_student_access(user: UserContext, student_id: int, db: AsyncSession) -> None:
    """Raise 403 unless the caller may view this student's academic data."""
    if user.role in ("super_admin", "admin", "teacher", "finance"):
        return
    # Student viewing own record
    if user.role == "student":
        res = await db.execute(
            select(Student).where(Student.user_id == user.id, Student.id == student_id,
                                  Student.institution_id == user.institution_id)
        )
        if res.scalars().first():
            return
    # Parent viewing their child — or shared student-as-parent account
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
        # Fallback: shared login where the User row IS the student row
        fb_res = await db.execute(
            select(Student).where(Student.user_id == user.id, Student.id == student_id,
                                  Student.institution_id == user.institution_id)
        )
        if fb_res.scalars().first():
            return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied. You may only view marks for your own child.",
    )

# Default look-back for marks. An academic year is ~10 months; 365 days
# covers the whole year and a buffer for late entries. Set explicit
# date_from for report-card generators that need full history.
_DEFAULT_MARKS_WINDOW_DAYS = 365

@router.post("/", response_model=schemas.MarkResponse)
async def record_mark(
    mark: schemas.MarkCreate, 
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_faculty)
):
    teacher_id = user.id if user.role == "teacher" else None
    result = await marks_service.record_mark(db, user.institution_id, mark, teacher_user_id=teacher_id)
    if not result:
        raise HTTPException(status_code=403, detail="Unauthorized to record marks for this student")
    return result

@router.post("/batch", response_model=List[schemas.MarkResponse])
@limiter.limit(RATE_LIMITS["marks_batch"])
async def record_marks_batch(
    request: Request,
    marks: List[schemas.MarkCreate],
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_faculty)
):
    teacher_id = user.id if user.role == "teacher" else None
    return await marks_service.record_marks_batch(db, user.institution_id, marks, teacher_user_id=teacher_id)

@router.get("/subject/{subject}/summary")
async def get_subject_summary(
    subject: str,
    school_class_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    return await marks_service.get_subject_summary(db, user.institution_id, subject, school_class_id)

@router.get("/subject/{subject}", response_model=List[schemas.MarkResponse])
async def get_class_marks(
    subject: str,
    school_class_id: Optional[int] = None, 
    exam_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_faculty)
):
    return await marks_service.get_class_marks(db, user.institution_id, subject, school_class_id, exam_id)

@router.get("/exams", response_model=List[schemas.ExamResponse])
async def get_exams(
    school_class_id: Optional[int] = None,
    subject_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    return await marks_service.get_exams(db, user.institution_id, school_class_id, subject_id)

@router.get("/{student_id}", response_model=List[schemas.MarkResponse])
async def get_student_marks(
    student_id: int,
    date_from: Optional[str] = Query(
        None,
        description=(
            "ISO date (YYYY-MM-DD). Defaults to today - 365 days when omitted. "
            "Filter applies to Mark.created_at."
        ),
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
        date_from = (date.today() - timedelta(days=_DEFAULT_MARKS_WINDOW_DAYS)).isoformat()
    if date_to is None:
        date_to = date.today().isoformat()
    return await marks_service.get_marks(
        db, user.institution_id, student_id,
        date_from=date_from, date_to=date_to,
    )

@router.get("/{student_id}/rankings")
async def get_student_rankings(
    student_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    await _check_student_access(user, student_id, db)
    return await marks_service.get_student_rankings(db, user.institution_id, student_id)

@router.post("/exams", response_model=schemas.ExamResponse)
async def create_exam(
    exam: schemas.ExamCreate,
    school_class_id: Optional[int] = None,
    subject_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_faculty)
):
    return await marks_service.create_exam(db, user.institution_id, exam, school_class_id, subject_id)

@router.put("/exams/{exam_id}", response_model=schemas.ExamResponse)
async def update_exam(
    exam_id: int,
    name: str,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_faculty)
):
    result = await marks_service.update_exam(db, user.institution_id, exam_id, name)
    if not result:
        raise HTTPException(status_code=404, detail="Exam not found")
    return result

@router.delete("/exams/{exam_id}", status_code=200)
async def delete_exam_object(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_faculty)
):
    success = await marks_service.delete_exam_object(db, user.institution_id, exam_id)
    if not success:
        raise HTTPException(status_code=404, detail="Exam not found")
    return {"status": "success"}

@router.delete("/test", status_code=200)
async def delete_test(
    subject: str = None, 
    test_name: str = None, 
    exam_id: int = None,
    student_ids: Optional[List[int]] = None,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_faculty)
):
    """
    Delete marks for a test.
    Supports deletion by:
    - exam_id (for exam-based marks)
    - subject + test_name (for legacy marks)
    """
    return await marks_service.delete_test(db, user.institution_id, subject, test_name, exam_id, student_ids)
