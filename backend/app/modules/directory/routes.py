from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.dependencies import (
    get_current_user, UserContext, 
    require_institution_admin, require_faculty,
    require_admin, require_teacher, require_student, require_parent
)
from app.schemas import directory as schemas
from app.schemas.auth import Token
from app.services.directory import DirectoryService

router = APIRouter(
    prefix="/api/directory",
    tags=["directory"]
)

# --- Student Routes ---

@router.post("/", response_model=schemas.StudentResponse, dependencies=[Depends(require_faculty)])
async def create_student(
    student: schemas.StudentCreate, 
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    return DirectoryService.create_student(db, user.institution_id, student)

@router.post("/students/login", response_model=Token)
async def student_login(
    login_data: schemas.StudentLogin,
    request: Request,
    db: Session = Depends(get_db)
):
    """Secure endpoint for student/parent login generating JWT token structure."""
    institution_id_str = request.headers.get("X-Institution-Id")
    institution_id = int(institution_id_str) if institution_id_str and institution_id_str.isdigit() else 1
    
    # NORMALIZE: Handle "8" vs "Grade 8" and case-sensitivity
    class_level_norm = login_data.class_level.strip()
    if class_level_norm.isdigit():
        class_level_norm = f"Grade {class_level_norm}"
        
    from app.models import SchoolClass, Grade, Section
    from sqlalchemy import func
    
    school_class = db.query(SchoolClass).join(
        Grade, SchoolClass.grade_id == Grade.id
    ).join(
        Section, SchoolClass.section_id == Section.id
    ).filter(
        func.lower(Grade.name) == class_level_norm.lower(),
        func.lower(Section.name) == login_data.section.strip().lower(),
        SchoolClass.institution_id == institution_id
    ).first()
    
    if not school_class:
        raise HTTPException(status_code=401, detail="Invalid class/section combination.")

    auth_data = DirectoryService.authenticate_student_portal(
        db, institution_id, 
        login_data.name, school_class.id, login_data.dob,
        role=login_data.role or "student"
    )
    if not auth_data:
        raise HTTPException(status_code=401, detail="Invalid student credentials.")
        
    return auth_data

@router.get("/", response_model=List[schemas.StudentResponse], dependencies=[Depends(require_admin)])
async def read_directory(
    skip: int = 0, limit: int = 100, 
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    return DirectoryService.get_students(db, user.institution_id, skip=skip, limit=limit)

@router.get("/my-students", response_model=List[schemas.StudentResponse])
async def get_my_students(
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    """For teachers: returns all students in their assigned classes."""
    from app.models.directory import Teacher, TeacherAssignment, Student
    teacher = db.query(Teacher).filter(
        Teacher.user_id == user.id,
        Teacher.institution_id == user.institution_id
    ).first()
    if not teacher:
        return []
    
    assignments = db.query(TeacherAssignment).filter(
        TeacherAssignment.teacher_id == teacher.id
    ).all()
    if not assignments:
        return []
    
    class_ids = [a.school_class_id for a in assignments]
    students = db.query(Student).filter(
        Student.institution_id == user.institution_id,
        Student.school_class_id.in_(class_ids)
    ).all()
    return students

@router.get("/my-teachers", response_model=List[schemas.TeacherResponse])
async def get_my_teachers(
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    """For students/parents: returns teachers assigned to the logged-in student's classroom."""
    from app.models.directory import Teacher, TeacherAssignment, Student
    student = db.query(Student).filter(
        Student.user_id == user.id,
        Student.institution_id == user.institution_id
    ).first()
    if not student or not student.school_class_id:
        return []
        
    assignments = db.query(TeacherAssignment).filter(
        TeacherAssignment.school_class_id == student.school_class_id,
        TeacherAssignment.institution_id == user.institution_id,
    ).all()
    
    teacher_ids = [a.teacher_id for a in assignments]
    teachers = db.query(Teacher).filter(Teacher.id.in_(teacher_ids)).all()
    return teachers


@router.get("/students/{student_id}", response_model=schemas.StudentResponse)
async def read_student(
    student_id: int, 
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    student = DirectoryService.get_student(db, user.institution_id, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found or access denied")
    return student

@router.put("/students/{student_id}", response_model=schemas.StudentResponse, dependencies=[Depends(require_faculty)])
async def update_student(
    student_id: int, student: schemas.StudentUpdate, 
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    updated = DirectoryService.update_student(db, user.institution_id, student_id, student)
    if not updated:
        raise HTTPException(status_code=404, detail="Student not found or access denied")
    return updated

@router.delete("/students/{student_id}", dependencies=[Depends(require_institution_admin)])
async def delete_student(
    student_id: int, 
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    success = DirectoryService.delete_student(db, user.institution_id, student_id)
    if not success:
        raise HTTPException(status_code=404, detail="Student not found or access denied")
    return {"status": "success", "id": student_id}

@router.put("/students/{student_id}/password", response_model=schemas.StudentResponse, dependencies=[Depends(require_institution_admin)])
async def update_student_password(
    student_id: int, update: schemas.PasswordUpdate,
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    """Admin endpoint to reset a student's login password."""
    updated = DirectoryService.update_student_password(db, user.institution_id, student_id, update.new_password)
    if not updated:
        raise HTTPException(status_code=404, detail="Student not found or access denied")
    return updated

@router.get("/my-profile", response_model=schemas.StudentResponse)
async def get_my_profile(
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    """Returns the student record for the currently logged-in student/parent user.
    Used by the parent portal to resolve student.id from JWT user.id."""
    student = DirectoryService.get_student_by_user_id(db, user.institution_id, user.id)
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found for this user")
    return student

# --- Teacher Assignment Routes ---

@router.post("/teachers/assignments/", response_model=schemas.TeacherAssignmentResponse, dependencies=[Depends(require_institution_admin)])
async def create_assignment(
    assignment: schemas.TeacherAssignmentCreate, 
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    result = DirectoryService.create_assignment(
        db, 
        user.institution_id, 
        assignment.teacher_id, 
        assignment.school_class_id, 
        assignment.subject_id
    )
    if not result:
        raise HTTPException(status_code=404, detail="Teacher or Class/Subject not found")
    return result

@router.delete("/teachers/assignments/{assignment_id}", dependencies=[Depends(require_institution_admin)])
async def delete_assignment(
    assignment_id: int, 
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    success = DirectoryService.delete_assignment(db, user.institution_id, assignment_id)
    if not success:
        raise HTTPException(status_code=404, detail="Assignment not found or access denied")
    return {"status": "success", "id": assignment_id}

# --- Teacher Routes ---

@router.post("/teachers/login", response_model=Token)
async def teacher_login(
    login_data: schemas.TeacherLogin,
    request: Request,
    db: Session = Depends(get_db)
):
    """Secure endpoint for faculty login generating JWT token structure."""
    institution_id_str = request.headers.get("X-Institution-Id")
    institution_id = int(institution_id_str) if institution_id_str and institution_id_str.isdigit() else 1
    
    auth_data = DirectoryService.authenticate_teacher_portal(db, institution_id, login_data.email, login_data.password)
    if not auth_data:
        raise HTTPException(status_code=401, detail="Invalid educator credentials.")
        
    return auth_data

@router.get("/teachers/", response_model=List[schemas.TeacherResponse])
async def read_teachers(
    skip: int = 0, limit: int = 100, 
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    return DirectoryService.get_teachers(db, user.institution_id, skip=skip, limit=limit)

@router.get("/teachers/{teacher_id}", response_model=schemas.TeacherResponse)
async def read_teacher(
    teacher_id: int, 
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    teacher = DirectoryService.get_teacher(db, user.institution_id, teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found or access denied")
    return teacher

@router.post("/teachers/", response_model=schemas.TeacherResponse, dependencies=[Depends(require_institution_admin)])
async def create_teacher(
    teacher: schemas.TeacherCreate, 
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    return DirectoryService.create_teacher(db, user.institution_id, teacher=teacher)

@router.put("/teachers/{teacher_id}", response_model=schemas.TeacherResponse, dependencies=[Depends(require_institution_admin)])
async def update_teacher(
    teacher_id: int, teacher: schemas.TeacherUpdate, 
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    updated = DirectoryService.update_teacher(db, user.institution_id, teacher_id, teacher)
    if not updated:
        raise HTTPException(status_code=404, detail="Teacher not found or access denied")
    return updated

@router.put("/teachers/{teacher_id}/password", response_model=schemas.TeacherResponse, dependencies=[Depends(require_institution_admin)])
async def update_teacher_password(
    teacher_id: int, update: schemas.PasswordUpdate, 
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    updated = DirectoryService.update_teacher_password(db, user.institution_id, teacher_id, update.new_password)
    if not updated:
        raise HTTPException(status_code=404, detail="Teacher not found or access denied")
    return updated

@router.delete("/teachers/{teacher_id}", dependencies=[Depends(require_institution_admin)])
async def delete_teacher(
    teacher_id: int, 
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    success = DirectoryService.delete_teacher(db, user.institution_id, teacher_id)
    if not success:
        raise HTTPException(status_code=404, detail="Teacher not found or access denied")
    return {"status": "success", "id": teacher_id}

@router.get("/teacher/dashboard/stats")
async def get_teacher_dashboard_stats(
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    """Returns analytics and summary metrics for the logged-in teacher."""
    from app.services.statistics import StatisticsService
    return StatisticsService.get_teacher_stats(db, user.institution_id, user.id)
