from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from uuid import UUID

from app.core.database import get_db, AsyncSessionLocal
from app.core.dependencies import (
    get_current_user, RoleChecker, UserContext, 
    require_teacher_strict, require_parent_strict
)
from app.schemas.communication import (
    AnnouncementCreate, 
    AnnouncementUpdate, 
    AnnouncementResponse,
    AnnouncementReadCreate
)
from app.services.announcement_service import announcement_service

router = APIRouter(prefix="/api/announcements", tags=["Announcements"])

# Background Task Wrapper
async def run_notification_task(announcement_id: UUID):
    async with AsyncSessionLocal() as db:
        await announcement_service.trigger_announcement_notifications(db, announcement_id)

@router.get("/teacher/{teacher_id}", response_model=List[AnnouncementResponse])
async def get_announcements_for_teacher(
    teacher_id: int,
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_teacher_strict)
):
    """
    Teachers can fetch their own announcements with engagement metrics.
    """
    # Verify the logged-in teacher matches the requested ID
    from app.models.directory import Teacher
    teacher_result = await db.execute(select(Teacher).where(Teacher.user_id == user.id))
    db_teacher = teacher_result.scalars().first()
    
    if not db_teacher or db_teacher.id != teacher_id:
        raise HTTPException(status_code=403, detail="Unauthorized to access these metrics")

    return await announcement_service.get_announcements_for_teacher(
        db, user.institution_id, teacher_id, limit, offset
    )

@router.get("/my", response_model=List[AnnouncementResponse])
async def get_my_announcements(
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    """
    Unified endpoint for students and parents to fetch relevant announcements.
    """
    if user.role == "teacher":
        from app.models.directory import Teacher
        teacher_result = await db.execute(select(Teacher).where(Teacher.user_id == user.id))
        db_teacher = teacher_result.scalars().first()
        if not db_teacher:
            return []
        return await announcement_service.get_announcements_for_teacher(
            db, user.institution_id, db_teacher.id, limit, offset
        )

    if user.role in ["student", "parent"]:
        from app.models.directory import Parent, Student
        if user.role == "parent":
            parent_result = await db.execute(select(Parent).where(Parent.user_id == user.id))
            db_parent = parent_result.scalars().first()
            if not db_parent:
                return []
            return await announcement_service.get_announcements_for_parent(
                db, user.institution_id, db_parent.id, limit, offset
            )
        else:
            # For students: fetch based on their own student record
            student_result = await db.execute(select(Student).where(Student.user_id == user.id))
            db_student = student_result.scalars().first()
            if not db_student or not db_student.parent_id:
                return []
            return await announcement_service.get_announcements_for_parent(
                db, user.institution_id, db_student.parent_id, limit, offset
            )

    return []

@router.get("/parent/{parent_id}", response_model=List[AnnouncementResponse])
async def get_announcements_for_parent(
    parent_id: int,
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_parent_strict)
):
    """
    Fetch announcements relevant to a parent's children with pagination.
    """
    # Authorization Check: Ensure parent is accessing their own feed
    from app.models.directory import Parent
    parent_result = await db.execute(select(Parent).where(Parent.user_id == user.id))
    db_parent = parent_result.scalars().first()
    
    if not db_parent or db_parent.id != parent_id:
        raise HTTPException(status_code=403, detail="Unauthorized access to parent feed")

    return await announcement_service.get_announcements_for_parent(
        db, user.institution_id, parent_id, limit, offset
    )

@router.post("/", response_model=AnnouncementResponse, status_code=status.HTTP_201_CREATED)
async def create_announcement(
    announcement: AnnouncementCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_teacher_strict)
):
    """
    Only teachers can create announcements, and only for classes/students they are assigned to.
    """
    new_announcement = await announcement_service.create_announcement(db, user.institution_id, user.id, announcement)
    
    # Trigger background notifications
    background_tasks.add_task(run_notification_task, new_announcement.id)
    
    return new_announcement

@router.post("/read", status_code=status.HTTP_200_OK)
async def mark_announcement_as_read(
    read_data: AnnouncementReadCreate,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_parent_strict)
):
    """
    Mark an announcement as read (Parent role only).
    """
    # Verify the logged-in user is the parent specified or an admin
    from app.models.directory import Parent
    parent_result = await db.execute(select(Parent).where(Parent.user_id == user.id))
    db_parent = parent_result.scalars().first()
    
    if not db_parent or db_parent.id != read_data.parent_id:
         raise HTTPException(status_code=403, detail="Unauthorized to mark as read for this parent")

    success = await announcement_service.mark_as_read(db, read_data.announcement_id, read_data.parent_id)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to mark as read")
    return {"status": "success"}

@router.delete("/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_announcement(
    announcement_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_teacher_strict)
):
    """
    Only the creating teacher can delete an announcement.
    """
    success = await announcement_service.delete_announcement(db, announcement_id, user.id)
    if not success:
        raise HTTPException(status_code=403, detail="Access denied or announcement not found")
