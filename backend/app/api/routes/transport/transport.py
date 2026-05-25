from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, exists
from typing import List

from app.core.database import get_db, AsyncSessionLocal
from app.core.dependencies import get_current_user, require_admin, require_faculty, UserContext
from app.core.security import decode_access_token
from app.core.websocket import manager, broadcaster
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


# --- Realtime location broadcast ---


async def _user_can_view_bus(
    db: AsyncSession,
    *,
    user_id: int,
    role: str,
    institution_id: int,
    bus_id: int,
) -> bool:
    """
    Tenant-scoped ACL for the bus-tracking websocket.

    * super_admin / admin / finance: any bus inside the matched institution.
    * teacher: any bus inside the matched institution (they may chaperone
      multiple routes; we don't model that granularly).
    * parent / student: must have a StudentTransport row tying a child of
      theirs to this bus.
    """
    from app.models.transport import Bus, StudentTransport
    from app.models.directory import Student, Parent

    bus_row = (await db.execute(
        select(Bus.institution_id).where(Bus.id == bus_id)
    )).first()
    if not bus_row:
        return False
    if bus_row[0] != institution_id:
        return False  # cross-tenant peek attempt

    if role in ("super_admin", "admin", "finance", "teacher"):
        return True

    if role == "student":
        # Direct student: assignment via their own student row.
        return bool((await db.execute(
            select(StudentTransport.id)
            .join(Student, Student.id == StudentTransport.student_id)
            .where(
                StudentTransport.bus_id == bus_id,
                Student.user_id == user_id,
                StudentTransport.institution_id == institution_id,
            )
            .limit(1)
        )).first())

    if role == "parent":
        # Parent: either Parent.user_id linkage or shared-login on Student.user_id.
        parent_assignment = (await db.execute(
            select(StudentTransport.id)
            .join(Student, Student.id == StudentTransport.student_id)
            .join(Parent, Parent.id == Student.parent_id)
            .where(
                StudentTransport.bus_id == bus_id,
                Parent.user_id == user_id,
                StudentTransport.institution_id == institution_id,
            )
            .limit(1)
        )).first()
        if parent_assignment:
            return True
        # Shared-login: a parent without a Parent record but sharing the
        # student's user_id. Match memory: many parent users have no Parent row.
        shared = (await db.execute(
            select(StudentTransport.id)
            .join(Student, Student.id == StudentTransport.student_id)
            .where(
                StudentTransport.bus_id == bus_id,
                Student.user_id == user_id,
                StudentTransport.institution_id == institution_id,
            )
            .limit(1)
        )).first()
        return bool(shared)

    return False


@router.websocket("/ws/transport/{bus_id}")
async def ws_transport(
    ws: WebSocket,
    bus_id: int,
    token: str = Query(..., description="JWT access token (query because the WS API has no headers)"),
):
    """
    Realtime bus-location stream.

    Client connects with ``ws://…/api/transport/ws/transport/{bus_id}?token=<JWT>``.
    The token is the same access token used for HTTP auth (query param is
    the only practical way — browser WebSocket APIs can't set custom headers).

    Authorization happens once at connect time. Long-lived connections
    don't re-check; the JWT TTL bounds exposure. The frontend reconnects
    on expiry (the 401 inside its 401-retry chain triggers a token
    refresh, which mints a new token for the next connect).
    """
    # 1. Decode the token. Closing with code 1008 (policy violation)
    #    matches the WebSocket spec for auth failure.
    try:
        payload = decode_access_token(token)
        user_id = int(payload.get("sub") or 0)
        role = payload.get("role")
        institution_id = int(payload.get("institution_id") or 0)
        if not user_id or not role or not institution_id:
            raise ValueError("missing claims")
    except Exception:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # 2. Authorize. Open a short-lived session per connect — long-lived
    #    DB connections held by idle websockets would starve the pool.
    async with AsyncSessionLocal() as db:
        try:
            allowed = await _user_can_view_bus(
                db,
                user_id=user_id,
                role=role,
                institution_id=institution_id,
                bus_id=bus_id,
            )
        except Exception:
            await ws.close(code=status.WS_1011_INTERNAL_ERROR)
            return
    if not allowed:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # 3. Accept and wire to the channel. Tenant-scoped channel name so a
    #    bus_id collision across schools can never bleed messages.
    channel = f"bus:{institution_id}:{bus_id}"
    await ws.accept()
    first_local = await manager.connect(ws, channel)
    if first_local:
        await broadcaster.subscribe(channel)

    try:
        # The protocol is server→client only. We still need to await
        # something so the handler doesn't return; receive_text() will
        # raise WebSocketDisconnect when the client hangs up.
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        last_local = await manager.disconnect(ws, channel)
        if last_local:
            await broadcaster.unsubscribe(channel)
