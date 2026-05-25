from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.dependencies import (
    get_current_user, UserContext, 
    require_institution_admin, require_faculty,
    require_teacher
)
from app.schemas import directory as schemas
from app.schemas.auth import Token
from app.services.teacher import teacher_service
from app.services.auth import auth_service
from app.core.config import settings
from app.core.limiter import limiter, RATE_LIMITS

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
@limiter.limit(RATE_LIMITS["teacher_login"])
async def teacher_login(
    request: Request,
    login_data: schemas.TeacherLogin,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """
    Teacher login — email + password only.

    The teacher's `institution_id` is derived from their `users` row after
    the password verifies, never trusted from a request header. We still
    embed it in the issued JWT (and the response body) so every downstream
    API can keep enforcing per-tenant row-level filtering, exactly as
    before.

    If a legacy client still sends `X-Institution-Id`, we ignore it for
    teacher auth — a stale header from a parent-portal session shouldn't
    block a teacher's login.
    """
    auth_data = await auth_service.authenticate_portal(
        db,
        institution_id=None,  # ← derived from User record post-auth
        email=login_data.email,
        password=login_data.password,
        role="teacher",
    )
    if not auth_data:
        raise HTTPException(status_code=401, detail="Invalid educator credentials.")

    # Set BOTH the access and refresh cookies as HttpOnly. The web SPA
    # reads neither directly. Mobile keeps using the `access_token` in
    # the response body via Authorization header.
    from app.services.auth.auth_service import set_auth_cookies
    refresh_token = auth_data.pop("refresh_token")
    user_id = auth_data["user"]["id"]
    set_auth_cookies(
        response,
        role="teacher",
        user_id=user_id,
        access_token=auth_data["access_token"],
        refresh_token=refresh_token,
    )

    return auth_data

@router.get("/teachers/", response_model=List[schemas.TeacherResponse])
async def read_teachers(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),  # see students.read_students for rationale
    search: Optional[str] = Query(
        None, min_length=1, max_length=80,
        description="ILIKE match on name / email.",
    ),
    is_active: Optional[bool] = Query(
        None, description="Filter inactive teachers out of admin lists when true.",
    ),
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_faculty)
):
    return await teacher_service.get_teachers(
        db, user.institution_id,
        skip=skip, limit=limit,
        search=search, is_active=is_active,
    )

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

