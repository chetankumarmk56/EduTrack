from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime

class BusBase(BaseModel):
    bus_number: str
    device_id: Optional[str] = None
    driver_name: str
    driver_phone: str
    capacity: int

class BusCreate(BusBase):
    pass

class BusUpdate(BaseModel):
    bus_number: Optional[str] = None
    device_id: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    capacity: Optional[int] = None

class BusResponse(BusBase):
    id: int
    institution_id: int
    model_config = ConfigDict(from_attributes=True)

class StopBase(BaseModel):
    name: str
    latitude: float
    longitude: float
    stop_order: int

class StopCreate(StopBase):
    route_id: int

class StopResponse(StopBase):
    id: int
    route_id: int
    model_config = ConfigDict(from_attributes=True)

class RouteBase(BaseModel):
    name: str
    bus_id: Optional[int] = None
    polyline: Optional[List[dict]] = None

class RouteCreate(RouteBase):
    pass

class RouteIntegratedCreate(RouteCreate):
    stops: List[StopBase]

class RouteResponse(RouteBase):
    id: int
    institution_id: int
    stops: List[StopResponse] = []
    model_config = ConfigDict(from_attributes=True)

class StudentTransportCreate(BaseModel):
    student_id: int
    bus_id: int
    stop_id: int

class StudentAssignment(StudentTransportCreate):
    pass

class StudentTransportResponse(BaseModel):
    id: int
    student_id: int
    bus_id: int
    stop_id: int
    model_config = ConfigDict(from_attributes=True)

class StudentTransportAssignmentResponse(BaseModel):
    bus: BusResponse
    route: RouteResponse
    stop: StopResponse
    student_id: int

class ClassTransportRosterItem(BaseModel):
    student_id: int
    student_name: str
    bus_number: Optional[str] = None
    driver_name: Optional[str] = None
    stop_name: Optional[str] = None
    bus_id: Optional[int] = None

class BusLocationUpdate(BaseModel):
    latitude: float
    longitude: float

class GPSUpdate(BusLocationUpdate):
    device_id: str

class BusLocationResponse(BusLocationUpdate):
    id: int
    bus_id: int
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)

class NotificationLogResponse(BaseModel):
    id: int
    student_id: int
    bus_id: int
    type: str
    sent_at: datetime
    model_config = ConfigDict(from_attributes=True)
