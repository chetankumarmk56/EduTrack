from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List

from app.core.database import get_db
from app.core.limiter import limiter  # ✅ NEW: Rate limiter
from app.core.dependencies import (
    get_current_user, UserContext, 
    require_institution_admin, require_faculty
)
from app.schemas import directory as schemas
from app.schemas.auth import Token
from app.services.student import student_service
from app.services.auth import auth_service

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

@router.post("/parents/login", response_model=Token)
async def parent_login(
    login_data: schemas.ParentLogin,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """
    Parent-portal login.

    Credentials are the guardian phone (recorded against the student at
    enrollment) + the student's date of birth. We deliberately do NOT
    accept an X-Institution-Id header on this route — the institution_id
    is derived from the matched `students` row after authentication and
    embedded in the issued JWT, matching the teacher-login behaviour.

    Tenant isolation is unchanged downstream: every authenticated
    request still reads `current_user.institution_id` from the token
    claim and filters its queries by it.
    """
    auth_data = await auth_service.authenticate_parent_by_phone(
        db,
        parent_phone=login_data.parent_phone,
        dob=login_data.dob,
    )
    if not auth_data:
        raise HTTPException(
            status_code=401,
            detail=(
                "We couldn't find a student matching that guardian phone and date of birth. "
                "Check the number you gave the school admin during enrollment, or contact "
                "the school office."
            ),
        )

    # Mirror the cookie convention used by the student endpoint so the
    # refresh-token flow (edu_refresh_parent_*) keeps working.
    from app.core.config import settings
    _user_id = auth_data["user"]["id"]
    response.set_cookie(
        key=f"edu_refresh_parent_{_user_id}",
        value=auth_data.pop("refresh_token"),
        path="/api/auth/refresh",
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="Lax",
        domain=settings.COOKIE_DOMAIN if settings.COOKIE_DOMAIN else None,
        max_age=7 * 24 * 60 * 60,
    )

    return auth_data


@router.post("/students/login", response_model=Token)
async def student_login(
    request: Request,  # ✅ NEW: Required for rate limiter
    login_data: schemas.StudentLogin,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """
    Legacy student/parent login (name + class/section + DOB).

    Kept for backward compatibility with older clients. New clients should
    use POST /api/directory/parents/login, which authenticates by
    (guardian phone, student DOB) and no longer needs an Institution ID.
    """
    from app.services.auth.auth_service import resolve_institution_id
    inst_header = request.headers.get("X-Institution-Id")
    institution_id = await resolve_institution_id(db, inst_header)
    if inst_header and institution_id is None:
        raise HTTPException(status_code=401, detail="Unknown Institution ID. Check with your school admin.")
    if institution_id is None:
        institution_id = 1
    
    # Match by Grade.level (integer) so it works regardless of whether the
    # admin form names the grade "Grade 1" or "Class 1". Extract the first
    # integer from whatever the parent typed ("1", "Grade 1", "Class 1" all OK).
    import re
    from app.models.academic import SchoolClass, Grade, Section
    from sqlalchemy import func

    match = re.search(r'\d+', login_data.class_level or "")
    if not match:
        raise HTTPException(status_code=401, detail="Invalid class/section combination.")
    class_level_int = int(match.group())

    stmt = select(SchoolClass).join(
        Grade, SchoolClass.grade_id == Grade.id
    ).join(
        Section, SchoolClass.section_id == Section.id
    ).filter(
        Grade.level == class_level_int,
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
        
    # ✅ FIXED: Cookie key must use user_id suffix so refresh endpoint pattern
    # edu_refresh_parent_* can find it. Without the suffix refresh always fails.
    from app.core.config import settings
    _user_id = auth_data['user']['id']
    response.set_cookie(
        key=f"edu_refresh_parent_{_user_id}",  # matches pattern edu_refresh_parent_*
        value=auth_data.pop("refresh_token"),
        path="/api/auth/refresh",
        httponly=True,
        secure=False,  # set True in production (HTTPS)
        samesite="Lax",  # Lax allows same-site navigation; Strict can break flows
        domain=settings.COOKIE_DOMAIN if settings.COOKIE_DOMAIN else None,
        max_age=7 * 24 * 60 * 60,  # 7 days so parents don't have to log in daily
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
    return {"message": "Student deleted successfully", "id": student_id}

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
        from app.services.teacher import teacher_service
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
