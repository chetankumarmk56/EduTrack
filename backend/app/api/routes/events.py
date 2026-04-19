from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_admin, UserContext
from app.services.events_service import events_service
from app.schemas.event import EventCreate, EventUpdate, EventResponse

router = APIRouter(prefix="/api/events", tags=["Events"])

@router.get("/", response_model=List[EventResponse])
async def get_events(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    return await events_service.get_events(db, user.institution_id)

@router.post("/", response_model=EventResponse, dependencies=[Depends(require_admin)])
async def create_event(
    event: EventCreate,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    return await events_service.create_event(db, user.institution_id, event.model_dump())

@router.get("/{event_id}", response_model=EventResponse)
async def get_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    db_event = await events_service.get_event(db, user.institution_id, event_id)
    if not db_event:
        raise HTTPException(status_code=404, detail="Event not found")
    return db_event

@router.put("/{event_id}", response_model=EventResponse, dependencies=[Depends(require_admin)])
async def update_event(
    event_id: int,
    event: EventUpdate,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    db_event = await events_service.update_event(db, user.institution_id, event_id, event.model_dump(exclude_unset=True))
    if not db_event:
        raise HTTPException(status_code=404, detail="Event not found")
    return db_event

@router.delete("/{event_id}", dependencies=[Depends(require_admin)])
async def delete_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    success = await events_service.delete_event(db, user.institution_id, event_id)
    if not success:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"status": "success"}
