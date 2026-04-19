from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.dependencies import get_current_user, UserContext, require_institution_admin
from app.schemas import event as schemas
from app.services.events import EventsService

router = APIRouter(
    prefix="/api/events",
    tags=["events"]
)

@router.get("/", response_model=List[schemas.EventResponse])
async def get_events(
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    return EventsService.get_events(db, user.institution_id)

@router.post("/", response_model=schemas.EventResponse, dependencies=[Depends(require_institution_admin)])
async def create_event(
    event: schemas.EventCreate, 
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    return EventsService.create_event(db, user.institution_id, event.model_dump())

@router.put("/{event_id}", response_model=schemas.EventResponse, dependencies=[Depends(require_institution_admin)])
async def update_event(
    event_id: int, 
    event: schemas.EventUpdate, 
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    updated = EventsService.update_event(db, user.institution_id, event_id, event.model_dump())
    if not updated:
        raise HTTPException(status_code=404, detail="Event not found or access denied")
    return updated

@router.delete("/{event_id}", dependencies=[Depends(require_institution_admin)])
async def delete_event(
    event_id: int, 
    db: Session = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    success = EventsService.delete_event(db, user.institution_id, event_id)
    if not success:
        raise HTTPException(status_code=404, detail="Event not found or access denied")
    return {"message": "Event deleted successfully"}
