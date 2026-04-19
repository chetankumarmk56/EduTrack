from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from typing import List, Optional
from datetime import datetime
from app.models.communication import Announcement
from app.schemas.communication import AnnouncementCreate, AnnouncementUpdate

class AnnouncementService:
    @staticmethod
    async def get_announcements(db: AsyncSession, institution_id: int, user_role: str) -> List[Announcement]:
        stmt = select(Announcement).where(
            or_(Announcement.expires_at == None, Announcement.expires_at > datetime.now())
        )
        
        if user_role.lower() not in ["admin", "super_admin"]:
            targets = ["all", user_role.lower()]
            stmt = stmt.where(Announcement.audience.in_(targets))
            
        result = await db.execute(stmt.order_by(Announcement.created_at.desc()))
        return result.scalars().all()

    @staticmethod
    async def create_announcement(db: AsyncSession, admin_id: int, announcement: AnnouncementCreate) -> Announcement:
        db_announcement = Announcement(
            **announcement.model_dump(),
            created_by_id=admin_id
        )
        db.add(db_announcement)
        await db.commit()
        await db.refresh(db_announcement)
        return db_announcement

    @staticmethod
    async def update_announcement(db: AsyncSession, announcement_id: int, announcement_update: AnnouncementUpdate) -> Optional[Announcement]:
        result = await db.execute(select(Announcement).where(Announcement.id == announcement_id))
        db_announcement = result.scalars().first()
        if not db_announcement:
            return None
        
        update_data = announcement_update.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_announcement, key, value)
        
        await db.commit()
        await db.refresh(db_announcement)
        return db_announcement

    @staticmethod
    async def delete_announcement(db: AsyncSession, announcement_id: int) -> bool:
        result = await db.execute(select(Announcement).where(Announcement.id == announcement_id))
        db_announcement = result.scalars().first()
        if not db_announcement:
            return False
        
        await db.delete(db_announcement)
        await db.commit()
        return True

announcement_service = AnnouncementService()
