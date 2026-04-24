from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from app.models.communication import Notification

class NotificationService:
    async def create_notification(
        self, 
        db: AsyncSession, 
        institution_id: int, 
        user_id: int, 
        title: str, 
        message: str, 
        n_type: str = "INFO"
    ):
        notification = Notification(
            institution_id=institution_id,
            user_id=user_id,
            title=title,
            message=message,
            type=n_type
        )
        db.add(notification)
        await db.commit()
        await db.refresh(notification)
        return notification

    async def get_user_notifications(
        self, 
        db: AsyncSession, 
        user_id: int, 
        unread_only: bool = False
    ) -> List[Notification]:
        stmt = select(Notification).where(Notification.user_id == user_id)
        if unread_only:
            stmt = stmt.where(Notification.is_read == False)
        stmt = stmt.order_by(Notification.created_at.desc())
        
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def mark_as_read(self, db: AsyncSession, notification_id: int, user_id: int):
        stmt = update(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id
        ).values(is_read=True)
        await db.execute(stmt)
        await db.commit()

    async def mark_all_as_read(self, db: AsyncSession, user_id: int):
        stmt = update(Notification).where(
            Notification.user_id == user_id,
            Notification.is_read == False
        ).values(is_read=True)
        await db.execute(stmt)
        await db.commit()

notification_service = NotificationService()
