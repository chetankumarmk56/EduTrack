from sqlalchemy import Column, Integer, String, ForeignKey, Float, DateTime, Index, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
from app.models.core import TimestampMixin

class Bus(Base, TimestampMixin):
    """
    Core vehicle model for transportation.
    """
    __tablename__ = "buses"

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, index=True)
    
    bus_number = Column(String, index=True)
    device_id = Column(String, unique=True, index=True, nullable=True) # IoT Tracking ID
    driver_name = Column(String)
    driver_phone = Column(String)
    capacity = Column(Integer)

    # Relationships
    institution = relationship("Institution")
    routes = relationship("Route", back_populates="bus", cascade="all, delete-orphan")
    location_logs = relationship("BusLocation", back_populates="bus", cascade="all, delete-orphan")
    assignments = relationship("StudentTransport", back_populates="bus")

class Route(Base, TimestampMixin):
    """
    Defined trajectory for a school bus.
    """
    __tablename__ = "routes"

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, index=True)
    bus_id = Column(Integer, ForeignKey("buses.id"), nullable=True)
    
    name = Column(String, index=True) # e.g., "North Gate Route"
    polyline = Column(JSON, nullable=True) # Array of {lat, lng} for the road path

    # Relationships
    institution = relationship("Institution")
    bus = relationship("Bus", back_populates="routes")
    stops = relationship("Stop", back_populates="route", cascade="all, delete-orphan")

class Stop(Base, TimestampMixin):
    """
    Specific pickup/drop-off point on a route.
    """
    __tablename__ = "stops"

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, index=True)
    route_id = Column(Integer, ForeignKey("routes.id"), nullable=False)
    
    name = Column(String, index=True)
    latitude = Column(Float)
    longitude = Column(Float)
    stop_order = Column(Integer) # Sequence in the route

    # Relationships
    institution = relationship("Institution")
    route = relationship("Route", back_populates="stops")
    transport_assignments = relationship("StudentTransport", back_populates="stop")

class StudentTransport(Base, TimestampMixin):
    """
    Junction table linking students to their transport assignments.
    """
    __tablename__ = "student_transport"

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    bus_id = Column(Integer, ForeignKey("buses.id"), nullable=False, index=True)
    stop_id = Column(Integer, ForeignKey("stops.id"), nullable=False, index=True)

    # Relationships
    institution = relationship("Institution")
    student = relationship("Student")
    bus = relationship("Bus", back_populates="assignments")
    stop = relationship("Stop", back_populates="transport_assignments")

class BusLocation(Base):
    """
    Real-time tracking snapshots for buses.
    Note: Independent of TimestampMixin for performance; uses a simple timestamp Column.
    """
    __tablename__ = "bus_locations"

    id = Column(Integer, primary_key=True, index=True)
    bus_id = Column(Integer, ForeignKey("buses.id"), nullable=False, index=True)
    
    latitude = Column(Float)
    longitude = Column(Float)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    bus = relationship("Bus", back_populates="location_logs")

class NotificationLog(Base, TimestampMixin):
    """
    Audit trail for transport-related notifications sent to students/parents.
    """
    __tablename__ = "transport_notification_logs"

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    bus_id = Column(Integer, ForeignKey("buses.id"), nullable=False, index=True)
    
    type = Column(String) # e.g., "BUS_ARRIVING", "DELAY", "STOP_REACHED"
    sent_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    institution = relationship("Institution")
    student = relationship("Student")
    bus = relationship("Bus")

# Index for spatial-temporal queries
Index("ix_bus_location_composite", BusLocation.bus_id, BusLocation.timestamp)
