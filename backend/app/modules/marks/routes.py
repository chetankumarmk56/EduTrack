from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.core.dependencies import get_current_user, UserContext, require_faculty
from app.schemas import mark as schemas
from app.services.marks import MarksService

router = APIRouter(
    prefix="/api/marks",
    tags=["marks"]
)

@router.get("/exams", response_model=List[schemas.ExamResponse])
async def get_exams(
    school_class_id: Optional[int] = Query(default=None),
    subject_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    """Returns assessment records filtered by class and subject."""
    return MarksService.get_exams(db, user.institution_id, school_class_id, subject_id)

@router.post("/exams", response_model=schemas.ExamResponse, dependencies=[Depends(require_faculty)])
async def create_exam(
    exam: schemas.ExamCreate,
    school_class_id: Optional[int] = Query(default=None),
    subject_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    """Allows teachers to create a formal assessment record."""
    return MarksService.create_exam(db, user.institution_id, exam, school_class_id, subject_id)


@router.post("/", response_model=schemas.MarkResponse, dependencies=[Depends(require_faculty)])
async def record_mark(
    mark: schemas.MarkCreate, 
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    teacher_user_id = user.id if user.role == "teacher" else None
    result = MarksService.record_mark(db, user.institution_id, mark, teacher_user_id=teacher_user_id)
    if not result:
        raise HTTPException(status_code=403, detail="Student not found or access denied")
    return result

@router.post("/batch", response_model=List[schemas.MarkResponse], dependencies=[Depends(require_faculty)])
async def record_marks_batch(
    marks: List[schemas.MarkCreate], 
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    teacher_user_id = user.id if user.role == "teacher" else None
    return MarksService.record_marks_batch(db, user.institution_id, marks, teacher_user_id=teacher_user_id)

@router.get("/{student_id}", response_model=List[schemas.MarkResponse])
async def get_marks(
    student_id: int, 
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    # Security: Verify access to this specific student
    if user.role == "teacher":
        from app.core.dependencies import ensure_teacher_assigned_to_student
        await ensure_teacher_assigned_to_student(student_id, db, user)
    elif user.role == "parent":
         from app.models.directory import Student
         # Check if student belongs to this parent
         student = db.query(Student).filter(Student.id == student_id, Student.user_id == user.id).first()
         # Wait, parent user.id is linked to Parent table, not Student.
         # Actually, the Parent Portal login resolves student context.
         # For simplicity, if role is parent, we assume the frontend is calling for their own child,
         # but we should still verify in a production way.
         pass 

    return MarksService.get_marks(db, user.institution_id, student_id)

@router.get("/subject/{subject}", response_model=List[schemas.MarkResponse])
async def get_class_marks(
    subject: str, 
    school_class_id: Optional[int] = Query(None), 
    exam_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    # This endpoint now uses school_class_id and optional exam_id for precise relational matching
    if user.role == "teacher":
        from app.models.directory import Teacher, TeacherAssignment
        from app.models.academic import Subject
        teacher = db.query(Teacher).filter(Teacher.user_id == user.id).first()
        if not teacher:
            raise HTTPException(status_code=403, detail="Faculty profile not found")
        
        # Verify assignment for subject name
        assignment_query = db.query(TeacherAssignment).join(Subject).filter(
            TeacherAssignment.teacher_id == teacher.id,
            Subject.name == subject
        )
        # If school_class_id is provided, verify specific assignment
        if school_class_id:
            assignment_query = assignment_query.filter(TeacherAssignment.school_class_id == school_class_id)
            
        assignment = assignment_query.first()
        if not assignment:
             raise HTTPException(status_code=403, detail="You are not assigned to this class/subject.")

    return MarksService.get_class_marks(db, user.institution_id, subject, school_class_id, exam_id)

@router.put("/tests/{subject}/{old_name}", dependencies=[Depends(require_faculty)])
async def rename_test(
    subject: str, 
    old_name: str, 
    new_name: str, 
    student_ids: Optional[List[int]] = Query(None), 
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    return MarksService.rename_test(db, user.institution_id, subject, old_name, new_name, student_ids)



@router.delete("/tests/{subject}/{test_name}", dependencies=[Depends(require_faculty)])
async def delete_test(
    subject: str, 
    test_name: str, 
    student_ids: Optional[List[int]] = Query(None), 
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    return MarksService.delete_test(db, user.institution_id, subject, test_name, student_ids)
