from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_faculty, UserContext
from app.schemas import attendance as schemas
from app.services.attendance_service import attendance_service

router = APIRouter(prefix="/api/attendance", tags=["Attendance Tracking"])

@router.post("/", response_model=schemas.AttendanceResponse)
async def mark_attendance(
    att: schemas.AttendanceCreate, 
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    teacher_id = user.id if user.role == "teacher" else None
    result = await attendance_service.mark_attendance(db, user.institution_id, att, teacher_user_id=teacher_id)
    if not result:
        raise HTTPException(status_code=403, detail="Unauthorized to mark attendance for this student/class")
    return result

@router.post("/batch", response_model=List[schemas.AttendanceResponse])
async def mark_attendance_batch(
    batch: schemas.AttendanceBatch, 
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    teacher_id = user.id if user.role == "teacher" else None
    return await attendance_service.mark_attendance_batch(db, user.institution_id, batch, teacher_user_id=teacher_id)

@router.get("/{student_id}", response_model=List[schemas.AttendanceResponse])
async def get_student_attendance(
    student_id: int, 
    subject: str = None, 
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    return await attendance_service.get_attendance(db, user.institution_id, student_id, subject)

@router.get("/class/{school_class_id}/{date}", response_model=List[schemas.AttendanceResponse])
async def get_class_attendance(
    school_class_id: int, 
    date: str, 
    subject: str = None, 
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    return await attendance_service.get_class_attendance(db, user.institution_id, school_class_id, date, subject)
