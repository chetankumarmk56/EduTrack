from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_faculty, UserContext
from app.schemas import mark as schemas
from app.services.marks_service import marks_service

router = APIRouter(prefix="/api/marks", tags=["Assessment & Marks"])

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
async def record_marks_batch(
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
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    return await marks_service.get_marks(db, user.institution_id, student_id)

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
