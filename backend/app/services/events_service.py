from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from app.models import Event

class EventsService:
    @staticmethod
    async def get_events(db: AsyncSession, institution_id: int) -> List[Event]:
        result = await db.execute(
            select(Event).where(Event.institution_id == institution_id).order_by(Event.date.asc())
        )
        return result.scalars().all()

    @staticmethod
    async def create_event(db: AsyncSession, institution_id: int, event_data: dict) -> Event:
        db_event = Event(**event_data, institution_id=institution_id)
        db.add(db_event)
        await db.commit()
        await db.refresh(db_event)
        return db_event

    @staticmethod
    async def get_event(db: AsyncSession, institution_id: int, event_id: int) -> Optional[Event]:
        result = await db.execute(
            select(Event).where(Event.id == event_id, Event.institution_id == institution_id)
        )
        return result.scalars().first()

    @staticmethod
    async def update_event(db: AsyncSession, institution_id: int, event_id: int, event_data: dict) -> Optional[Event]:
        db_event = await EventsService.get_event(db, institution_id, event_id)
        if not db_event:
            return None
            
        for key, value in event_data.items():
            setattr(db_event, key, value)
            
        await db.commit()
        await db.refresh(db_event)
        return db_event

    @staticmethod
    async def delete_event(db: AsyncSession, institution_id: int, event_id: int) -> bool:
        db_event = await EventsService.get_event(db, institution_id, event_id)
        if not db_event:
            return False
            
        await db.delete(db_event)
        await db.commit()
        return True

events_service = EventsService()
