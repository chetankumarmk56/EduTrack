from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.core.database import get_db
from app.core.dependencies import (
    get_current_user, UserContext, 
    require_institution_admin, require_faculty,
    require_teacher
)
from app.schemas import directory as schemas
from app.schemas.auth import Token
from app.services.teacher_service import teacher_service
from app.services.auth_service import auth_service
from app.core.config import settings

router = APIRouter(
    prefix="/api/directory",
    tags=["teachers"]
)

# --- Teacher Assignment Routes ---

@router.post("/teachers/assignments/", response_model=schemas.TeacherAssignmentResponse, dependencies=[Depends(require_institution_admin)])
async def create_assignment(
    assignment: schemas.TeacherAssignmentCreate, 
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    result = await teacher_service.create_assignment(
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
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    success = await teacher_service.delete_assignment(db, user.institution_id, assignment_id)
    if not success:
        raise HTTPException(status_code=404, detail="Assignment not found or access denied")
    return {"status": "success", "id": assignment_id}

# --- Teacher Routes ---

@router.post("/teachers/login", response_model=Token)
async def teacher_login(
    login_data: schemas.TeacherLogin,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Secure endpoint for faculty login generating JWT token structure."""
    institution_id_str = request.headers.get("X-Institution-Id")
    institution_id = int(institution_id_str) if institution_id_str and institution_id_str.isdigit() else 1
    
    auth_data = await auth_service.authenticate_portal(
        db, 
        institution_id, 
        email=login_data.email, 
        password=login_data.password,
        role="teacher"
    )
    if not auth_data:
        raise HTTPException(status_code=401, detail="Invalid educator credentials.")
        
    # Set Refresh Token in HttpOnly Cookie
    response.set_cookie(
        key="edu_refresh_teacher",
        value=auth_data.pop("refresh_token"),
        httponly=True,
        secure=settings.ENVIRONMENT == "prod",
        samesite="lax",
        max_age=7 * 24 * 3600
    )
    
    return auth_data

@router.get("/teachers/", response_model=List[schemas.TeacherResponse])
async def read_teachers(
    skip: int = 0, limit: int = 1000, 
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_faculty)
):
    return await teacher_service.get_teachers(db, user.institution_id, skip=skip, limit=limit)

@router.get("/teachers/{teacher_id}", response_model=schemas.TeacherResponse)
async def read_teacher(
    teacher_id: int, 
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_faculty)
):
    teacher = await teacher_service.get_teacher(db, user.institution_id, teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found or access denied")
    return teacher

@router.post("/teachers/", response_model=schemas.TeacherResponse, dependencies=[Depends(require_institution_admin)])
async def create_teacher(
    teacher: schemas.TeacherCreate, 
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    return await teacher_service.create_teacher(db, user.institution_id, teacher=teacher)

@router.put("/teachers/{teacher_id}", response_model=schemas.TeacherResponse, dependencies=[Depends(require_institution_admin)])
async def update_teacher(
    teacher_id: int, teacher: schemas.TeacherUpdate, 
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    updated = await teacher_service.update_teacher(db, user.institution_id, teacher_id, teacher)
    if not updated:
        raise HTTPException(status_code=404, detail="Teacher not found or access denied")
    return updated

@router.put("/teachers/{teacher_id}/password", response_model=schemas.TeacherResponse, dependencies=[Depends(require_institution_admin)])
async def update_teacher_password(
    teacher_id: int, update: schemas.PasswordUpdate, 
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    updated = await teacher_service.update_teacher_password(db, user.institution_id, teacher_id, update.new_password)
    if not updated:
        raise HTTPException(status_code=404, detail="Teacher not found or access denied")
    return updated

@router.delete("/teachers/{teacher_id}", dependencies=[Depends(require_institution_admin)])
async def delete_teacher(
    teacher_id: int, 
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    success = await teacher_service.delete_teacher(db, user.institution_id, teacher_id)
    if not success:
        raise HTTPException(status_code=404, detail="Teacher not found or access denied")
    return {"status": "success", "id": teacher_id}

@router.get("/my-teachers", response_model=List[schemas.TeacherResponse])
async def get_my_teachers(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    """For students/parents: returns teachers assigned to the logged-in student's classroom."""
    return await teacher_service.get_student_teachers(db, user.institution_id, user.id)

@router.get("/teacher/dashboard/stats")
async def get_teacher_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_teacher)
):
    """Returns analytics and summary metrics for the logged-in teacher."""
    from app.services.statistics import StatisticsService
    return await StatisticsService.get_teacher_stats(db, user.institution_id, user.id)

