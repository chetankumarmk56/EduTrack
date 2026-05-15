from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_admin, require_faculty, UserContext
from app.schemas import transport as schemas
from app.services.transport import transport_service

router = APIRouter(prefix="/api/transport", tags=["Transport Management"])

# --- Bus Management ---

@router.get("/buses", response_model=List[schemas.BusResponse])
async def get_buses(
    db: AsyncSession = Depends(get_db), 
    user: UserContext = Depends(get_current_user)
):
    return await transport_service.get_buses(db, user.institution_id)

@router.get("/buses/{bus_id}", response_model=schemas.BusResponse)
async def get_bus(
    bus_id: int, 
    db: AsyncSession = Depends(get_db), 
    user: UserContext = Depends(get_current_user)
):
    bus = await transport_service.get_bus(db, user.institution_id, bus_id)
    if not bus:
        raise HTTPException(status_code=404, detail="Bus not found")
    return bus

@router.post("/buses", response_model=schemas.BusResponse, dependencies=[Depends(require_admin)])
async def create_bus(
    bus: schemas.BusCreate, 
    db: AsyncSession = Depends(get_db), 
    user: UserContext = Depends(get_current_user)
):
    return await transport_service.create_bus(db, user.institution_id, bus)

@router.put("/buses/{bus_id}", response_model=schemas.BusResponse, dependencies=[Depends(require_admin)])
async def update_bus(
    bus_id: int, 
    bus: schemas.BusUpdate, 
    db: AsyncSession = Depends(get_db), 
    user: UserContext = Depends(get_current_user)
):
    updated = await transport_service.update_bus(db, user.institution_id, bus_id, bus)
    if not updated:
        raise HTTPException(status_code=404, detail="Bus not found")
    return updated

@router.delete("/buses/{bus_id}", dependencies=[Depends(require_admin)])
async def delete_bus(
    bus_id: int, 
    db: AsyncSession = Depends(get_db), 
    user: UserContext = Depends(get_current_user)
):
    success = await transport_service.delete_bus(db, user.institution_id, bus_id)
    if not success:
        raise HTTPException(status_code=404, detail="Bus not found")
    return {"status": "success"}

# --- Route Management ---

@router.get("/routes", response_model=List[schemas.RouteResponse])
async def get_routes(
    db: AsyncSession = Depends(get_db), 
    user: UserContext = Depends(get_current_user)
):
    return await transport_service.get_routes(db, user.institution_id)

@router.post("/routes/integrated", response_model=schemas.RouteResponse, dependencies=[Depends(require_admin)])
async def create_integrated_route(
    data: schemas.RouteIntegratedCreate, 
    db: AsyncSession = Depends(get_db), 
    user: UserContext = Depends(get_current_user)
):
    return await transport_service.save_integrated_route(db, user.institution_id, data)

@router.get("/stops", response_model=List[schemas.StopResponse])
async def get_stops_by_route(
    route_id: int, 
    db: AsyncSession = Depends(get_db), 
    user: UserContext = Depends(get_current_user)
):
    return await transport_service.get_stops_by_route(db, user.institution_id, route_id)

# --- Student Transport Assignments ---

@router.post("/assignments", response_model=schemas.StudentTransportResponse, dependencies=[Depends(require_admin)])
async def assign_student(
    assignment: schemas.StudentAssignment, 
    db: AsyncSession = Depends(get_db), 
    user: UserContext = Depends(get_current_user)
):
    result = await transport_service.assign_student(db, user.institution_id, assignment)
    if not result:
        raise HTTPException(status_code=404, detail="Bus or Stop not found")
    return result

@router.get("/my-assignment")
async def get_my_transport(
    db: AsyncSession = Depends(get_db), 
    user: UserContext = Depends(get_current_user)
):
    """Contextual endpoint for parents and students to get their assigned bus details."""
    result = await transport_service.get_student_transport_for_user(db, user.id, user.role)
    if not result:
        raise HTTPException(status_code=404, detail="No transport assignment found")
    return result

@router.get("/class-roster", response_model=List[dict], dependencies=[Depends(require_faculty)])
async def get_class_transport_roster(
    class_id: int, 
    db: AsyncSession = Depends(get_db), 
    user: UserContext = Depends(get_current_user)
):
    return await transport_service.get_class_transport_roster(db, user.institution_id, class_id)

# --- GPS Data Ingest ---

@router.post("/gps/update")
async def update_gps_location(
    data: schemas.GPSUpdate, 
    db: AsyncSession = Depends(get_db)
):
    """System-level endpoint for GPS hardware to push location updates."""
    location = await transport_service.update_location_by_device(db, data.device_id, data.latitude, data.longitude)
    if not location:
        raise HTTPException(status_code=404, detail="Device not registered")
    return {"status": "success", "timestamp": location.timestamp}
