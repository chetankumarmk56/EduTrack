from fastapi import APIRouter, Depends, HTTPException, status, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.core.dependencies import get_current_user, UserContext
from app.services.transport import TransportService
from app.core.websocket import manager
from app.schemas.transport import (
    BusCreate, BusUpdate, BusResponse, 
    RouteCreate, RouteIntegratedCreate, RouteResponse, 
    StopCreate, StopResponse, 
    StudentAssignment, StudentTransportResponse, StudentTransportAssignmentResponse, ClassTransportRosterItem,
    GPSUpdate, BusLocationResponse
)

router = APIRouter(
    prefix="/api/transport",
    tags=["transport"]
)

# --- Bus Management ---

@router.post("/buses", response_model=BusResponse, status_code=status.HTTP_201_CREATED)
async def create_bus(
    bus: BusCreate, 
    current_user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return TransportService.create_bus(db, current_user.institution_id, bus)

@router.get("/buses", response_model=List[BusResponse])
async def list_buses(
    current_user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return TransportService.get_buses(db, current_user.institution_id)

@router.put("/buses/{id}", response_model=BusResponse)
async def update_bus(
    id: int,
    bus: BusUpdate,
    current_user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    updated_bus = TransportService.update_bus(db, current_user.institution_id, id, bus)
    if not updated_bus:
        raise HTTPException(status_code=404, detail="Bus not found")
    return updated_bus

@router.delete("/buses/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bus(
    id: int,
    current_user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    success = TransportService.delete_bus(db, current_user.institution_id, id)
    if not success:
        raise HTTPException(status_code=404, detail="Bus not found")
    return None

# --- Route & Stop Management ---

@router.post("/routes", response_model=RouteResponse, status_code=status.HTTP_201_CREATED)
async def create_route(
    route: RouteCreate,
    current_user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return TransportService.create_route(db, current_user.institution_id, route)

@router.post("/routes/integrated", response_model=RouteResponse, status_code=status.HTTP_201_CREATED)
async def create_integrated_route(
    data: RouteIntegratedCreate,
    current_user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Experimental high-fidelity endpoint for atomic route and stop mapping.
    """
    return TransportService.save_integrated_route(db, current_user.institution_id, data)

@router.get("/routes", response_model=List[RouteResponse])
async def list_routes(
    current_user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return TransportService.get_routes(db, current_user.institution_id)

@router.put("/routes/{id}", response_model=RouteResponse)
async def update_route(
    id: int,
    route: RouteCreate, # Use RouteCreate as it has optional fields
    current_user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    updated_route = TransportService.update_route(db, current_user.institution_id, id, route.model_dump(exclude_unset=True))
    if not updated_route:
        raise HTTPException(status_code=404, detail="Route not found")
    return updated_route

@router.post("/stops", response_model=StopResponse, status_code=status.HTTP_201_CREATED)
async def create_stop(
    stop: StopCreate,
    current_user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_stop = TransportService.create_stop(db, current_user.institution_id, stop)
    if not db_stop:
        raise HTTPException(status_code=404, detail="Route not found")
    return db_stop

@router.get("/stops", response_model=List[StopResponse])
async def get_stops(
    route_id: int = Query(...),
    current_user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return TransportService.get_stops_by_route(db, current_user.institution_id, route_id)

# --- Student Assignment ---

@router.post("/assign-student", response_model=StudentTransportResponse)
async def assign_student(
    assignment: StudentAssignment,
    current_user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_assignment = TransportService.assign_student(db, current_user.institution_id, assignment)
    if not db_assignment:
        raise HTTPException(status_code=400, detail="Invalid Bus or Stop ID provided for your institution")
    return db_assignment

@router.get("/my-assignment", response_model=StudentTransportAssignmentResponse)
async def get_my_assignment(
    current_user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns the personalized transport context for the current user.
    """
    assignment = TransportService.get_student_transport_for_user(db, current_user.user_id, current_user.role)
    if not assignment:
        raise HTTPException(status_code=404, detail="No transport assignment found for your profile")
    return assignment

@router.get("/class-roster", response_model=List[ClassTransportRosterItem])
async def get_class_transport_roster(
    class_id: int = Query(...),
    current_user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns a transport-focused registry of all students in a specific class section. village
    """
    return TransportService.get_class_transport_roster(db, current_user.institution_id, class_id)

# --- Real-time GPS Tracking ---

@router.post("/bus/location", response_model=BusLocationResponse)
async def update_gps_location(
    data: GPSUpdate,
    db: Session = Depends(get_db)
):
    # Public endpoint specifically for IoT devices using device_id
    db_location = TransportService.update_location_by_device(db, data.device_id, data.latitude, data.longitude)
    if not db_location:
        raise HTTPException(status_code=404, detail="Bus with provided device_id not found")
    return db_location

@router.websocket("/ws/transport/{bus_id}")
async def transport_websocket(
    websocket: WebSocket,
    bus_id: int
):
    """
    Real-time telemetry stream for a specific bus.
    """
    await manager.connect(websocket, bus_id)
    try:
        while True:
            # Keep the connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, bus_id)
