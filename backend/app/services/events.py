from sqlalchemy.orm import Session
from typing import List, Optional
from app.models import Event

class EventsService:
    @staticmethod
    def get_events(db: Session, institution_id: int) -> List[Event]:
        return db.query(Event).filter(
            Event.institution_id == institution_id
        ).order_by(Event.date.asc()).all()

    @staticmethod
    def create_event(db: Session, institution_id: int, event_data: dict) -> Event:
        db_event = Event(**event_data, institution_id=institution_id)
        db.add(db_event)
        db.commit()
        db.refresh(db_event)
        return db_event

    @staticmethod
    def get_event(db: Session, institution_id: int, event_id: int) -> Optional[Event]:
        return db.query(Event).filter(
            Event.id == event_id,
            Event.institution_id == institution_id
        ).first()

    @staticmethod
    def update_event(db: Session, institution_id: int, event_id: int, event_data: dict) -> Optional[Event]:
        db_event = EventsService.get_event(db, institution_id, event_id)
        if not db_event:
            return None
            
        for key, value in event_data.items():
            setattr(db_event, key, value)
            
        db.commit()
        db.refresh(db_event)
        return db_event

    @staticmethod
    def delete_event(db: Session, institution_id: int, event_id: int) -> bool:
        db_event = EventsService.get_event(db, institution_id, event_id)
        if not db_event:
            return False
            
        db.delete(db_event)
        db.commit()
        return True
