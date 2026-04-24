from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List

from app.core.database import get_db
from app.core.dependencies import (
    get_current_user, UserContext, 
    require_institution_admin, require_faculty
)
from app.schemas import directory as schemas
from app.schemas.auth import Token
from app.services.student_service import student_service
from app.services.auth_service import auth_service

router = APIRouter(
    prefix="/api/directory",
    tags=["students"]
)

@router.post("/", response_model=schemas.StudentResponse, dependencies=[Depends(require_faculty)])
async def create_student(
    student: schemas.StudentCreate, 
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    return await student_service.create_student(db, user.institution_id, student)

@router.post("/students/login", response_model=Token)
async def student_login(
    login_data: schemas.StudentLogin,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Secure endpoint for student/parent login generating JWT token structure."""
    institution_id_str = request.headers.get("X-Institution-Id")
    institution_id = int(institution_id_str) if institution_id_str and institution_id_str.isdigit() else 1
    
    # NORMALIZE: Handle "8" vs "Grade 8"
    class_level_norm = login_data.class_level.strip()
    if class_level_norm.isdigit():
        class_level_norm = f"Grade {class_level_norm}"
        
    from app.models.academic import SchoolClass, Grade, Section
    from sqlalchemy import func
    
    stmt = select(SchoolClass).join(
        Grade, SchoolClass.grade_id == Grade.id
    ).join(
        Section, SchoolClass.section_id == Section.id
    ).filter(
        func.lower(Grade.name) == class_level_norm.lower(),
        func.lower(Section.name) == login_data.section.strip().lower(),
        SchoolClass.institution_id == institution_id
    )
    
    result = await db.execute(stmt)
    school_class = result.scalars().first()
    
    if not school_class:
        raise HTTPException(status_code=401, detail="Invalid class/section combination.")

    auth_data = await auth_service.authenticate_portal(
        db, 
        institution_id, 
        name=login_data.name, 
        school_class_id=school_class.id, 
        dob=login_data.dob,
        role=login_data.role or "student"
    )
    if not auth_data:
        raise HTTPException(status_code=401, detail="Invalid student credentials.")
        
    # Set Refresh Token in HttpOnly Cookie
    from app.core.config import settings
    response.set_cookie(
        key="edu_refresh_parent", # Using 'parent' namespace for student/parent group
        value=auth_data.pop("refresh_token"),
        httponly=True,
        secure=settings.ENVIRONMENT == "prod",
        samesite="lax",
        max_age=7 * 24 * 3600
    )
    
    return auth_data

@router.get("/", response_model=List[schemas.StudentResponse], dependencies=[Depends(require_faculty)])
async def read_students(
    skip: int = 0, limit: int = 1000, 
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    return await student_service.get_students(db, user.institution_id, skip=skip, limit=limit)

@router.get("/my-students", response_model=List[schemas.StudentResponse])
async def get_my_students(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    """For teachers: returns all students in their assigned classes."""
    return await student_service.get_teacher_students(db, user.institution_id, user.id)

@router.get("/students/{student_id}", response_model=schemas.StudentResponse)
async def read_student(
    student_id: int, 
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    student = await student_service.get_student(db, user.institution_id, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found or access denied")
    return student

@router.put("/students/{student_id}", response_model=schemas.StudentResponse, dependencies=[Depends(require_faculty)])
async def update_student(
    student_id: int, student: schemas.StudentUpdate, 
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    updated = await student_service.update_student(db, user.institution_id, student_id, student)
    if not updated:
        raise HTTPException(status_code=404, detail="Student not found or access denied")
    return updated

@router.delete("/students/{student_id}", dependencies=[Depends(require_institution_admin)])
async def delete_student(
    student_id: int, 
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    success = await student_service.delete_student(db, user.institution_id, student_id)
    if not success:
        raise HTTPException(status_code=404, detail="Student not found or access denied")
    return {"status": "success", "id": student_id}

@router.put("/students/{student_id}/password", response_model=schemas.StudentResponse, dependencies=[Depends(require_institution_admin)])
async def update_student_password(
    student_id: int, update: schemas.PasswordUpdate,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    updated = await student_service.update_student_password(db, user.institution_id, student_id, update.new_password)
    if not updated:
        raise HTTPException(status_code=404, detail="Student not found or access denied")
    return updated

@router.get("/my-profile")
async def get_my_profile(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    """
    Polymorphic profile retrieval based on authenticated user role.
    """
    if user.role == 'teacher':
        from app.services.teacher_service import teacher_service
        profile = await teacher_service.get_teacher_by_user_id(db, user.institution_id, user.id)
        if not profile:
            raise HTTPException(status_code=404, detail="Teacher profile not found")
        return profile
        
    if user.role == 'parent':
        from app.models.directory import Parent
        result = await db.execute(
            select(Parent)
            .options(selectinload(Parent.students))
            .where(Parent.user_id == user.id, Parent.institution_id == user.institution_id)
        )
        profile = result.scalars().first()
        if not profile:
            # Fallback to student lookup if parent record missing
            return await student_service.get_student_by_user_id(db, user.institution_id, user.id)
        return profile

    # Default to student
    student = await student_service.get_student_by_user_id(db, user.institution_id, user.id)
    if not student:
        raise HTTPException(status_code=404, detail="Profile not found for this user")
    return student
