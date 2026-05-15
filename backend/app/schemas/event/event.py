from pydantic import BaseModel, ConfigDict
from typing import Optional, Dict, Any

class EventBase(BaseModel):
    title: str
    description: Optional[str] = None
    type: str # 'meeting', 'holiday', 'exam', 'sports'
    category: Optional[str] = "General"
    date: str
    end_date: Optional[str] = None
    time: str
    location: Optional[str] = None
    visibility: Optional[Dict[str, bool]] = {"parents": True, "teachers": True, "students": True}

class EventCreate(EventBase):
    pass

class EventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    category: Optional[str] = None
    date: Optional[str] = None
    end_date: Optional[str] = None
    time: Optional[str] = None
    location: Optional[str] = None
    visibility: Optional[Dict[str, bool]] = None

class EventResponse(EventBase):
    id: int
    model_config = ConfigDict(from_attributes=True)
