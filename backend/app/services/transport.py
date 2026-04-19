from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
from sqlalchemy import and_
from app.models.transport import Bus, Route, Stop, StudentTransport, BusLocation, NotificationLog
from app.models.directory import Parent, Student
from app.schemas import transport as schemas
from app.core.websocket import manager
from app.core.geo_math import haversine_distance

class TransportService:

    # --- Bus Management ---

    @staticmethod
    def create_bus(db: Session, institution_id: int, bus_data: schemas.BusCreate) -> Bus:
        db_bus = Bus(**bus_data.model_dump(), institution_id=institution_id)
        db.add(db_bus)
        db.commit()
        db.refresh(db_bus)
        return db_bus

    @staticmethod
    def get_buses(db: Session, institution_id: int) -> List[Bus]:
        return db.query(Bus).filter(Bus.institution_id == institution_id).all()

    @staticmethod
    def get_bus(db: Session, institution_id: int, bus_id: int) -> Optional[Bus]:
        return db.query(Bus).filter(Bus.id == bus_id, Bus.institution_id == institution_id).first()

    @staticmethod
    def update_bus(db: Session, institution_id: int, bus_id: int, bus_data: schemas.BusUpdate) -> Optional[Bus]:
        db_bus = TransportService.get_bus(db, institution_id, bus_id)
        if not db_bus:
            return None
        
        update_data = bus_data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_bus, key, value)
        
        db.commit()
        db.refresh(db_bus)
        return db_bus

    @staticmethod
    def delete_bus(db: Session, institution_id: int, bus_id: int) -> bool:
        db_bus = TransportService.get_bus(db, institution_id, bus_id)
        if not db_bus:
            return False
        
        db.delete(db_bus)
        db.commit()
        return True

    # --- Route & Stop Management ---

    @staticmethod
    def create_route(db: Session, institution_id: int, route_data: schemas.RouteCreate) -> Route:
        db_route = Route(**route_data.model_dump(), institution_id=institution_id)
        db.add(db_route)
        db.commit()
        db.refresh(db_route)
        return db_route

    @staticmethod
    def save_integrated_route(db: Session, institution_id: int, data: schemas.RouteIntegratedCreate) -> Route:
        """
        Atomically saves a route and all its stops in a single transaction.
        """
        try:
            # Create Route
            route_dict = data.model_dump(exclude={'stops'})
            db_route = Route(**route_dict, institution_id=institution_id)
            db.add(db_route)
            db.flush() # Get route_id

            # Create Stops
            for stop_data in data.stops:
                db_stop = Stop(
                    **stop_data.model_dump(),
                    route_id=db_route.id,
                    institution_id=institution_id
                )
                db.add(db_stop)
            
            db.commit()
            db.refresh(db_route)
            return db_route
        except Exception as e:
            db.rollback()
            raise e

    @staticmethod
    def get_routes(db: Session, institution_id: int) -> List[Route]:
        return db.query(Route).filter(Route.institution_id == institution_id).all()

    @staticmethod
    def get_route(db: Session, institution_id: int, route_id: int) -> Optional[Route]:
        return db.query(Route).filter(Route.id == route_id, Route.institution_id == institution_id).first()

    @staticmethod
    def update_route(db: Session, institution_id: int, route_id: int, route_data: dict) -> Optional[Route]:
        db_route = TransportService.get_route(db, institution_id, route_id)
        if not db_route:
            return None
        
        for key, value in route_data.items():
            if hasattr(db_route, key):
                setattr(db_route, key, value)
        
        db.commit()
        db.refresh(db_route)
        return db_route

    @staticmethod
    def create_stop(db: Session, institution_id: int, stop_data: schemas.StopCreate) -> Optional[Stop]:
        # Verify route belongs to institution
        route = db.query(Route).filter(
            Route.id == stop_data.route_id, 
            Route.institution_id == institution_id
        ).first()
        if not route:
            return None
        
        db_stop = Stop(**stop_data.model_dump(), institution_id=institution_id)
        db.add(db_stop)
        db.commit()
        db.refresh(db_stop)
        return db_stop

    @staticmethod
    def get_stops_by_route(db: Session, institution_id: int, route_id: int) -> List[Stop]:
        return db.query(Stop).filter(
            Stop.route_id == route_id, 
            Stop.institution_id == institution_id
        ).order_by(Stop.stop_order).all()

    # --- Student Assignments ---

    @staticmethod
    def assign_student(db: Session, institution_id: int, assignment_data: schemas.StudentAssignment) -> Optional[StudentTransport]:
        # Validate bus and stop belong to institution
        bus = db.query(Bus).filter(Bus.id == assignment_data.bus_id, Bus.institution_id == institution_id).first()
        stop = db.query(Stop).filter(Stop.id == assignment_data.stop_id, Stop.institution_id == institution_id).first()
        
        if not bus or not stop:
            return None
            
        db_assignment = StudentTransport(
            **assignment_data.model_dump(),
            institution_id=institution_id
        )
        db.add(db_assignment)
        db.commit()
        db.refresh(db_assignment)
        return db_assignment

    @staticmethod
    def get_student_transport_for_user(db: Session, user_id: int, role: str) -> Optional[dict]:
        """
        Retrieves the transport context for a parent or student.
        """
        student_id = None
        if role == "parent":
            parent = db.query(Parent).filter(Parent.user_id == user_id).first()
            if not parent or not parent.students:
                return None
            student_id = parent.students[0].id # Default to first student
        elif role == "student":
            student = db.query(Student).filter(Student.user_id == user_id).first()
            if not student:
                return None
            student_id = student.id
        
        if not student_id:
            return None
        
        assignment = db.query(StudentTransport).filter(StudentTransport.student_id == student_id).first()
        if not assignment:
            return None
            
        bus = db.query(Bus).filter(Bus.id == assignment.bus_id).first()
        stop = db.query(Stop).filter(Stop.id == assignment.stop_id).first()
        route = db.query(Route).filter(Route.bus_id == bus.id).first() if bus else None
        
        if not bus or not stop or not route:
            return None
            
        return {
            "bus": bus,
            "route": route,
            "stop": stop,
            "student_id": student_id
        }

    @staticmethod
    def get_class_transport_roster(db: Session, institution_id: int, class_id: int) -> List[dict]:
        """
        Retrieves a comprehensive transport registry for all students in a class.
        """
        # Single efficient query using outer joins to include students WITHOUT transport
        query = db.query(
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
        ).filter(
            Student.school_class_id == class_id,
            Student.institution_id == institution_id
        )

        results = query.all()
        return [r._asdict() for r in results]

    # --- GPS Tracking ---

    @staticmethod
    def update_location_by_device(db: Session, device_id: str, latitude: float, longitude: float) -> Optional[BusLocation]:
        # Find bus by device_id across all institutions (system level update)
        bus = db.query(Bus).filter(Bus.device_id == device_id).first()
        if not bus:
            return None
            
        db_location = BusLocation(
            bus_id=bus.id,
            latitude=latitude,
            longitude=longitude
        )
        db.add(db_location)
        db.commit()
        db.refresh(db_location)
        # Broadcast via WebSockets in the background
        import asyncio
        data = {
            "bus_id": bus.id,
            "latitude": latitude,
            "longitude": longitude,
            "timestamp": db_location.timestamp.isoformat() if db_location.timestamp else None
        }
        asyncio.create_task(manager.broadcast(bus.id, data))
        
        # Evaluate proximity alerts in the background
        asyncio.create_task(TransportService.evaluate_proximity_alerts(db, bus.id, latitude, longitude))

        return db_location

    @staticmethod
    async def evaluate_proximity_alerts(db: Session, bus_id: int, lat: float, lng: float):
        """
        Geospatial proximity engine: detects if a bus is near a student stop.
        """
        # 1. Fetch all students assigned to this bus and their specific stops
        assignments = db.query(StudentTransport, Stop).join(
            Stop, StudentTransport.stop_id == Stop.id
        ).filter(StudentTransport.bus_id == bus_id).all()

        for assignment, stop in assignments:
            # 2. Calculate Distance
            dist_km = haversine_distance(lat, lng, stop.latitude, stop.longitude)

            # 3. Threshold check (1.0 km)
            if dist_km <= 1.0:
                # 4. Deduplication Check (30 min window for same student/bus/stop)
                cooldown_threshold = datetime.utcnow() - timedelta(minutes=30)
                
                recent_notification = db.query(NotificationLog).filter(
                    NotificationLog.student_id == assignment.student_id,
                    NotificationLog.bus_id == bus_id,
                    NotificationLog.type == "PROXIMITY_ALERT",
                    NotificationLog.sent_at >= cooldown_threshold
                ).first()

                if not recent_notification:
                    # 5. Trigger Notification (Create Log)
                    new_log = NotificationLog(
                        institution_id=assignment.institution_id,
                        student_id=assignment.student_id,
                        bus_id=bus_id,
                        type="PROXIMITY_ALERT"
                    )
                    db.add(new_log)
                    db.commit()
                    print(f"DEBUG: Proximity Alert Sent to Student {assignment.student_id} (Distance: {dist_km:.2f}km)")
