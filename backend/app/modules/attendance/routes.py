from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.core.dependencies import get_current_user, UserContext, require_faculty
from app.schemas import attendance as schemas
from app.services.attendance import AttendanceService

router = APIRouter(
    prefix="/api/attendance",
    tags=["attendance"]
)

@router.post("/", response_model=schemas.AttendanceResponse, dependencies=[Depends(require_faculty)])
async def mark_attendance(
    att: schemas.AttendanceCreate, 
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    teacher_user_id = user.id if user.role == "teacher" else None
    result = AttendanceService.mark_attendance(db, user.institution_id, att, teacher_user_id=teacher_user_id)
    if not result:
        raise HTTPException(status_code=403, detail="Student not found or access denied")
    return result

@router.post("/batch", response_model=List[schemas.AttendanceResponse], dependencies=[Depends(require_faculty)])
async def mark_attendance_batch(
    batch: schemas.AttendanceBatch, 
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    teacher_user_id = user.id if user.role == "teacher" else None
    return AttendanceService.mark_attendance_batch(db, user.institution_id, batch, teacher_user_id=teacher_user_id)

@router.get("/{student_id}", response_model=List[schemas.AttendanceResponse])
async def get_attendance(
    student_id: int, 
    subject: Optional[str] = None, 
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    # Security: Verify access
    if user.role == "teacher":
        from app.core.dependencies import ensure_teacher_assigned_to_student
        await ensure_teacher_assigned_to_student(student_id, db, user)

    return AttendanceService.get_attendance(db, user.institution_id, student_id, subject)
@router.get("/class/{school_class_id}/{date}", response_model=List[schemas.AttendanceResponse])
async def get_class_attendance(
    school_class_id: int,
    date: str,
    subject: Optional[str] = None,
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    # STRICT ACCESS CHECK
    if user.role == "teacher":
        from app.models.directory import Teacher, TeacherAssignment
        teacher = db.query(Teacher).filter(Teacher.user_id == user.id).first()
        if not teacher:
            raise HTTPException(status_code=403, detail="Faculty profile not found")
        
        assignment = db.query(TeacherAssignment).filter(
            TeacherAssignment.teacher_id == teacher.id,
            TeacherAssignment.school_class_id == school_class_id
        ).first()
        if not assignment:
             raise HTTPException(status_code=403, detail="You are not assigned to this class.")

    return AttendanceService.get_class_attendance(db, user.institution_id, school_class_id, date, subject)
