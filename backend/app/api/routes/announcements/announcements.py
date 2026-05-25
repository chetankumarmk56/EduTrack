from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
import os

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional

from app.core.database import get_db, AsyncSessionLocal
from app.core.dependencies import get_current_active_user, UserContext
from app.schemas.communication import (
    AnnouncementResponse,
    AnnouncementCreate,
    AnnouncementUpdate,
    AnnouncementCategory,
    HomeworkConfirmRequest,
    HomeworkConfirmationResponse,
    HomeworkConfirmationsBreakdown,
)
from app.services.announcement import announcement_service
from app.services.announcement.homework_service import homework_service
from app.models import User, Teacher

router = APIRouter(
    prefix="/api/announcements",
    tags=["announcements"]
)

@router.get("/download")
async def download_announcement_file(file_path: str):
    """
    Public-by-design download handler. Mirrors the existing /static/uploads/
    route, which is also unauthenticated; gating only this URL would not
    improve security since the same files are reachable via /static.
    Path traversal is blocked via the abspath check below. Filenames are
    server-generated (UUID-like), so unguessable in practice. A signed-URL
    or move to Cloudinary is the proper hardening path; that is out of scope.
    """
    from urllib.parse import urlparse

    # If it's a full URL, extract just the path component
    if file_path.startswith("http://") or file_path.startswith("https://"):
        parsed = urlparse(file_path)
        file_path = parsed.path  # e.g. /static/uploads/filename.jpg

    # Sanitize and resolve path
    relative_path = file_path.lstrip("/")
    if not relative_path.startswith("static/uploads/"):
        raise HTTPException(status_code=400, detail="Invalid path")

    full_path = os.path.abspath(relative_path)
    if not full_path.startswith(os.path.abspath("static/uploads")):
        raise HTTPException(status_code=403, detail="Forbidden")

    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Not Found")

    return FileResponse(
        full_path,
        filename=os.path.basename(full_path),
        media_type='application/octet-stream'
    )



@router.get("/teacher/{teacher_id}", response_model=List[AnnouncementResponse])
async def get_announcements_for_teacher(
    teacher_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_active_user),
    limit: int = 20,
    offset: int = 0,
    category: Optional[AnnouncementCategory] = None,
):
    """Fetch announcements created by a specific teacher."""
    return await announcement_service.get_announcements_for_teacher(
        db, user.institution_id, teacher_id, limit, offset, category=category
    )

@router.get("/my", response_model=List[AnnouncementResponse])
async def get_my_announcements(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_active_user),
    limit: int = 20,
    offset: int = 0,
    category: Optional[AnnouncementCategory] = None,
):
    """
    Unified endpoint for students and parents to fetch relevant announcements.
    """
    if user.role == "teacher":
        teacher_result = await db.execute(select(Teacher).where(Teacher.user_id == user.id))
        db_teacher = teacher_result.scalars().first()
        if not db_teacher:
            return []
        return await announcement_service.get_announcements_for_teacher(
            db, user.institution_id, db_teacher.id, limit, offset, category=category
        )

    if user.role in ["student", "parent"]:
        from app.models.directory import Parent, Student

        # 1. Try resolving as parent profile
        parent_result = await db.execute(select(Parent).where(Parent.user_id == user.id))
        db_parent = parent_result.scalars().first()

        if db_parent:
            return await announcement_service.get_announcements_for_parent(
                db, user.institution_id,
                parent_id=db_parent.id,
                limit=limit, offset=offset,
                category=category,
                viewer_user_id=user.id,
            )

        # 2. Try resolving as student profile
        student_result = await db.execute(select(Student).where(Student.user_id == user.id))
        db_student = student_result.scalars().first()

        if db_student:
            return await announcement_service.get_announcements_for_parent(
                db, user.institution_id,
                parent_id=db_student.parent_id,
                student_id=db_student.id,
                limit=limit, offset=offset,
                category=category,
                viewer_user_id=user.id,
            )

        return []



    return []

@router.get("/parent/{parent_id}", response_model=List[AnnouncementResponse])
async def get_announcements_for_parent(
    parent_id: int,
    limit: int = 20,
    offset: int = 0,
    category: Optional[AnnouncementCategory] = None,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_active_user)
):
    """Fetch announcements relevant to a parent and their children."""
    return await announcement_service.get_announcements_for_parent(
        db, user.institution_id,
        parent_id=parent_id, limit=limit, offset=offset,
        category=category, viewer_user_id=user.id,
    )

@router.post("/", response_model=AnnouncementResponse)
async def create_announcement(
    data: AnnouncementCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_active_user)
):
    """Create a new announcement (Teachers only)."""
    if user.role != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can create announcements")

    teacher_result = await db.execute(select(Teacher).where(Teacher.user_id == user.id))
    teacher = teacher_result.scalars().first()
    if not teacher:
        raise HTTPException(status_code=403, detail="Teacher profile not found")

    result = await announcement_service.create_announcement(
        db, user.institution_id, user.id, data
    )

    # Notify target parents in the background so the response is instant
    announcement_id = result.id
    async def _notify():
        async with AsyncSessionLocal() as session:
            await announcement_service.trigger_announcement_notifications(session, announcement_id)

    background_tasks.add_task(_notify)
    return result

@router.post("/read")
async def mark_announcement_as_read(
    data: dict,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_active_user)
):
    """Mark an announcement as read for a specific parent/student."""
    announcement_id = data.get("announcement_id")
    parent_id = data.get("parent_id")
    
    if not announcement_id:
        raise HTTPException(status_code=400, detail="Missing announcement_id")

    # Auto-resolve parent_id from token if not provided (Performance optimization)
    if not parent_id and user.role in ["student", "parent"]:
        from app.models.directory import Parent, Student
        # 1. Try resolving as parent
        parent_result = await db.execute(select(Parent).where(Parent.user_id == user.id))
        db_parent = parent_result.scalars().first()
        if db_parent:
            parent_id = db_parent.id
        else:
            # 2. Try resolving via student's parent link
            student_result = await db.execute(select(Student).where(Student.user_id == user.id))
            db_student = student_result.scalars().first()
            if db_student:
                parent_id = db_student.parent_id

    if not parent_id:
        # Student-only logins (no Parent table record and no Student.parent_id)
        # can't have their reads written into AnnouncementRead since the FK
        # requires a real parent. Treat as a successful no-op so the client
        # doesn't have to special-case this branch and the log stays clean.
        # Parents and parent-linked students still get their reads tracked.
        return {"message": "Acknowledged (no parent record to track read)"}

    await announcement_service.mark_as_read(db, announcement_id, parent_id)
    return {"message": "Marked as read"}


@router.delete("/{announcement_id}")
async def delete_announcement(
    announcement_id: str,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_active_user)
):
    """Delete an announcement (Teacher only)."""
    if user.role != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can delete announcements")

    success = await announcement_service.delete_announcement(
        db, announcement_id, user.id
    )
    if not success:
        raise HTTPException(status_code=404, detail="Announcement not found or access denied")

    return {"message": "Announcement deleted"}


# ---------------------------------------------------------------------------
# Homework category — per-child confirmation endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/{announcement_id}/homework/confirm",
    response_model=HomeworkConfirmationResponse,
)
async def confirm_homework(
    announcement_id: str,
    payload: HomeworkConfirmRequest,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_active_user),
):
    """
    Parent marks a homework as completed for one of their children.

    The service enforces:
      - the announcement is a HOMEWORK category
      - the calling user is a parent (or parent-linked student)
      - the student belongs to that parent and is in the announcement audience
      - duplicate confirmations are no-ops (idempotent)
    """
    if user.role not in ("parent", "student"):
        raise HTTPException(
            status_code=403, detail="Only parents can confirm homework"
        )

    from uuid import UUID as _UUID
    try:
        ann_uuid = _UUID(announcement_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid announcement id")

    row = await homework_service.confirm_homework(
        db,
        announcement_id=ann_uuid,
        user_id=user.id,
        institution_id=user.institution_id,
        student_id=payload.student_id,
    )
    return HomeworkConfirmationResponse(
        id=row.id,
        announcement_id=row.announcement_id,
        student_id=row.student_id,
        parent_id=row.parent_id,
        confirmed_at=row.confirmed_at,
    )


@router.get(
    "/{announcement_id}/homework/confirmations",
    response_model=HomeworkConfirmationsBreakdown,
)
async def list_homework_confirmations(
    announcement_id: str,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_active_user),
):
    """Teacher view: who has confirmed this homework, and when."""
    if user.role != "teacher":
        raise HTTPException(
            status_code=403, detail="Only teachers can view homework confirmations"
        )

    from uuid import UUID as _UUID
    try:
        ann_uuid = _UUID(announcement_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid announcement id")

    return await homework_service.list_confirmations_for_teacher(
        db,
        announcement_id=ann_uuid,
        user_id=user.id,
        institution_id=user.institution_id,
    )
