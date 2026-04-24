from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_db
from app.core.dependencies import get_current_user, UserContext
from app.services.notification_service import notification_service

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])

@router.get("/")
async def get_my_notifications(
    unread_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    """Fetch notifications for the logged-in user."""
    return await notification_service.get_user_notifications(db, user.id, unread_only)

@router.patch("/{notification_id}/read")
async def mark_notification_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    """Mark a specific notification as read."""
    await notification_service.mark_as_read(db, notification_id, user.id)
    return {"status": "ok"}

@router.post("/read-all")
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    """Mark all notifications for the current user as read."""
    await notification_service.mark_all_as_read(db, user.id)
    return {"status": "ok"}
