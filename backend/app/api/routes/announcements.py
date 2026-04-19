from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_admin, UserContext
from app.schemas.communication import AnnouncementCreate, AnnouncementUpdate, AnnouncementResponse
from app.services.announcement_service import announcement_service

router = APIRouter(prefix="/api/announcements", tags=["Announcements"])

@router.get("/", response_model=List[AnnouncementResponse])
async def get_announcements(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    return await announcement_service.get_announcements(db, user.institution_id, user.role)

@router.post("/", response_model=AnnouncementResponse, status_code=status.HTTP_201_CREATED)
async def create_announcement(
    announcement: AnnouncementCreate,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin)
):
    return await announcement_service.create_announcement(db, admin.id, announcement)

@router.put("/{announcement_id}", response_model=AnnouncementResponse)
async def update_announcement(
    announcement_id: int,
    announcement_update: AnnouncementUpdate,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin)
):
    updated = await announcement_service.update_announcement(db, announcement_id, announcement_update)
    if not updated:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return updated

@router.delete("/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_announcement(
    announcement_id: int,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin)
):
    success = await announcement_service.delete_announcement(db, announcement_id)
    if not success:
        raise HTTPException(status_code=404, detail="Announcement not found")
