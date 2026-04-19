from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class AnnouncementBase(BaseModel):
    title: str
    message: Optional[str] = ""
    audience: Optional[str] = "all" # all, teacher, parent, admin, or "class_10"
    expires_at: Optional[datetime] = None

class AnnouncementCreate(AnnouncementBase):
    institution_id: Optional[int] = 1

class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    message: Optional[str] = None
    audience: Optional[str] = None
    expires_at: Optional[datetime] = None

class AnnouncementResponse(AnnouncementBase):
    id: int
    created_at: datetime
    created_by_id: Optional[int]
    model_config = ConfigDict(from_attributes=True)
