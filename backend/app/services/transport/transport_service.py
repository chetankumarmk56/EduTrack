from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime, timedelta
from app.models.transport import Bus, Route, Stop, StudentTransport, BusLocation, NotificationLog
from app.models.directory import Parent, Student
from app.schemas import transport as schemas
from app.core.websocket import broadcaster
from app.core.geo_math import haversine_distance
import asyncio

class TransportService:

    # --- Bus Management ---
    @staticmethod
    async def create_bus(db: AsyncSession, institution_id: int, bus_data: schemas.BusCreate) -> Bus:
        db_bus = Bus(**bus_data.model_dump(), institution_id=institution_id)
        db.add(db_bus)
        await db.commit()
        await db.refresh(db_bus)
        return db_bus

    @staticmethod
    async def get_buses(db: AsyncSession, institution_id: int) -> List[Bus]:
        result = await db.execute(select(Bus).where(Bus.institution_id == institution_id))
        return result.scalars().all()

    @staticmethod
    async def get_bus(db: AsyncSession, institution_id: int, bus_id: int) -> Optional[Bus]:
        result = await db.execute(select(Bus).where(Bus.id == bus_id, Bus.institution_id == institution_id))
        return result.scalars().first()

    @staticmethod
    async def update_bus(db: AsyncSession, institution_id: int, bus_id: int, bus_data: schemas.BusUpdate) -> Optional[Bus]:
        db_bus = await TransportService.get_bus(db, institution_id, bus_id)
        if not db_bus:
            return None
        
        update_data = bus_data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_bus, key, value)
        
        await db.commit()
        await db.refresh(db_bus)
        return db_bus

    @staticmethod
    async def delete_bus(db: AsyncSession, institution_id: int, bus_id: int) -> bool:
        db_bus = await TransportService.get_bus(db, institution_id, bus_id)
        if not db_bus:
            return False
        
        await db.delete(db_bus)
        await db.commit()
        return True

    # --- Route & Stop Management ---
    @staticmethod
    async def create_route(db: AsyncSession, institution_id: int, route_data: schemas.RouteCreate) -> Route:
        db_route = Route(**route_data.model_dump(), institution_id=institution_id)
        db.add(db_route)
        await db.commit()
        await db.refresh(db_route)
        return db_route

    @staticmethod
    async def save_integrated_route(db: AsyncSession, institution_id: int, data: schemas.RouteIntegratedCreate) -> Route:
        try:
            route_dict = data.model_dump(exclude={'stops'})
            db_route = Route(**route_dict, institution_id=institution_id)
            db.add(db_route)
            await db.flush() 

            for stop_data in data.stops:
                db_stop = Stop(
                    **stop_data.model_dump(),
                    route_id=db_route.id,
                    institution_id=institution_id
                )
                db.add(db_stop)
            
            await db.commit()
            await db.refresh(db_route)
            return db_route
        except Exception as e:
            await db.rollback()
            raise e

    @staticmethod
    async def get_routes(db: AsyncSession, institution_id: int) -> List[Route]:
        result = await db.execute(
            select(Route)
            .options(selectinload(Route.stops))
            .where(Route.institution_id == institution_id)
        )
        return result.scalars().all()

    @staticmethod
    async def get_route(db: AsyncSession, institution_id: int, route_id: int) -> Optional[Route]:
        result = await db.execute(
            select(Route)
            .options(selectinload(Route.stops))
            .where(Route.id == route_id, Route.institution_id == institution_id)
        )
        return result.scalars().first()

    @staticmethod
    async def update_route(db: AsyncSession, institution_id: int, route_id: int, route_data: dict) -> Optional[Route]:
        db_route = await TransportService.get_route(db, institution_id, route_id)
        if not db_route:
            return None
        
        for key, value in route_data.items():
            if hasattr(db_route, key):
                setattr(db_route, key, value)
        
        await db.commit()
        await db.refresh(db_route)
        return db_route

    @staticmethod
    async def create_stop(db: AsyncSession, institution_id: int, stop_data: schemas.StopCreate) -> Optional[Stop]:
        result = await db.execute(select(Route).where(
            Route.id == stop_data.route_id, 
            Route.institution_id == institution_id
        ))
        if not result.scalars().first():
            return None
        
        db_stop = Stop(**stop_data.model_dump(), institution_id=institution_id)
        db.add(db_stop)
        await db.commit()
        await db.refresh(db_stop)
        return db_stop

    @staticmethod
    async def get_stops_by_route(db: AsyncSession, institution_id: int, route_id: int) -> List[Stop]:
        result = await db.execute(
            select(Stop).where(
                Stop.route_id == route_id, 
                Stop.institution_id == institution_id
            ).order_by(Stop.stop_order)
        )
        return result.scalars().all()

    # --- Student Assignments ---
    @staticmethod
    async def assign_student(db: AsyncSession, institution_id: int, assignment_data: schemas.StudentAssignment) -> Optional[StudentTransport]:
        b_res = await db.execute(select(Bus).where(Bus.id == assignment_data.bus_id, Bus.institution_id == institution_id))
        s_res = await db.execute(select(Stop).where(Stop.id == assignment_data.stop_id, Stop.institution_id == institution_id))
        
        if not b_res.scalars().first() or not s_res.scalars().first():
            return None
            
        db_assignment = StudentTransport(
            **assignment_data.model_dump(),
            institution_id=institution_id
        )
        db.add(db_assignment)
        await db.commit()
        await db.refresh(db_assignment)
        return db_assignment

    @staticmethod
    async def get_student_transport_for_user(db: AsyncSession, user_id: int, role: str) -> Optional[dict]:
        student_id = None
        if role == "parent":
            p_res = await db.execute(select(Parent).where(Parent.user_id == user_id))
            parent = p_res.scalars().first()
            if not parent or not parent.students:
                return None
            student_id = parent.students[0].id 
        elif role == "student":
            s_res = await db.execute(select(Student).where(Student.user_id == user_id))
            student = s_res.scalars().first()
            if not student:
                return None
            student_id = student.id
        
        if not student_id:
            return None
        
        assign_res = await db.execute(select(StudentTransport).where(StudentTransport.student_id == student_id))
        assignment = assign_res.scalars().first()
        if not assignment:
            return None
            
        b_res = await db.execute(select(Bus).where(Bus.id == assignment.bus_id))
        bus = b_res.scalars().first()
        
        stp_res = await db.execute(select(Stop).where(Stop.id == assignment.stop_id))
        stop = stp_res.scalars().first()
        
        r_res = await db.execute(
            select(Route).options(selectinload(Route.stops)).where(Route.bus_id == bus.id)
        ) if bus else None
        route = r_res.scalars().first() if r_res else None
        
        if not bus or not stop or not route:
            return None
            
        return {
            "bus": bus,
            "route": route,
            "stop": stop,
            "student_id": student_id
        }

    @staticmethod
    async def get_class_transport_roster(db: AsyncSession, institution_id: int, class_id: int) -> List[dict]:
        stmt = select(
            Student.id.label("student_id"),
            Student.name.label("student_name"),
            Bus.bus_number,
            Bus.driver_name,
            Stop.name.label("stop_name"),
            Bus.id.label("bus_id")
        ).outerjoin(
            StudentTransport, Student.id == StudentTransport.student_id
        ).outerjoin(
            Bus, StudentTransport.bus_id == Bus.id
        ).outerjoin(
            Stop, StudentTransport.stop_id == Stop.id
        ).where(
            Student.school_class_id == class_id,
            Student.institution_id == institution_id
        )

        result = await db.execute(stmt)
        return [dict(r._mapping) for r in result.all()]

    # --- GPS Tracking ---
    @staticmethod
    async def update_location_by_device(db: AsyncSession, device_id: str, latitude: float, longitude: float) -> Optional[BusLocation]:
        b_res = await db.execute(select(Bus).where(Bus.device_id == device_id))
        bus = b_res.scalars().first()
        if not bus:
            return None
            
        db_location = BusLocation(
            bus_id=bus.id,
            latitude=latitude,
            longitude=longitude
        )
        db.add(db_location)
        await db.commit()
        await db.refresh(db_location)
        
        data = {
            "bus_id": bus.id,
            "latitude": latitude,
            "longitude": longitude,
            "timestamp": db_location.timestamp.isoformat() if db_location.timestamp else None
        }
        # Channel name is tenant-scoped — see app/core/websocket.py and the
        # /ws/transport/{bus_id} handler. Fire-and-forget so a slow Redis
        # publish can't stall the GPS ingest HTTP request.
        channel = f"bus:{bus.institution_id}:{bus.id}"
        asyncio.create_task(broadcaster.publish(channel, data))
        return db_location

transport_service = TransportService()
