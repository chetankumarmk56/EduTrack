from pydantic import BaseModel, ConfigDict, Field, model_validator, field_validator
from typing import Optional, List, Any
from datetime import datetime
from uuid import UUID
from enum import Enum

class AnnouncementType(str, Enum):
    CLASS = "CLASS"
    STUDENT = "STUDENT"

class AnnouncementPriority(str, Enum):
    NORMAL = "NORMAL"
    IMPORTANT = "IMPORTANT"


class AnnouncementBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200, description="Announcement title")
    message: str = Field(..., min_length=1, max_length=5000, description="Announcement message")
    type: AnnouncementType
    priority: AnnouncementPriority = AnnouncementPriority.NORMAL
    class_id: Optional[int] = None
    student_id: Optional[int] = None
    attachment_url: Optional[str] = None
    
    @field_validator('message', 'title')
    @classmethod
    def prevent_xss(cls, v: str) -> str:
        """Prevent XSS by blocking dangerous HTML/JavaScript"""
        if v is None:
            return v
        dangerous_patterns = [
            '<script', 'javascript:', 'onerror=', 'onload=', 
            'onclick=', 'onmouseover=', '<iframe', 'eval('
        ]
        v_lower = v.lower()
        for pattern in dangerous_patterns:
            if pattern in v_lower:
                raise ValueError(f"HTML/JavaScript content not allowed")
        return v

class AnnouncementCreate(AnnouncementBase):
    @model_validator(mode='after')
    def validate_targets(self) -> 'AnnouncementCreate':
        if self.type == AnnouncementType.CLASS and not self.class_id:
            raise ValueError("class_id is required for announcements of type 'class'")
        if self.type == AnnouncementType.STUDENT and not self.student_id:
            raise ValueError("student_id is required for announcements of type 'student'")
        return self

class AnnouncementUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    message: Optional[str] = Field(None, min_length=1, max_length=5000)
    type: Optional[AnnouncementType] = None
    priority: Optional[AnnouncementPriority] = None
    class_id: Optional[int] = None
    student_id: Optional[int] = None
    attachment_url: Optional[str] = None
    
    @field_validator('message', 'title')
    @classmethod
    def prevent_xss(cls, v: Optional[str]) -> Optional[str]:
        """Prevent XSS by blocking dangerous HTML/JavaScript"""
        if v is None:
            return v
        dangerous_patterns = [
            '<script', 'javascript:', 'onerror=', 'onload=', 
            'onclick=', 'onmouseover=', '<iframe', 'eval('
        ]
        v_lower = v.lower()
        for pattern in dangerous_patterns:
            if pattern in v_lower:
                raise ValueError(f"HTML/JavaScript content not allowed")
        return v

class AnnouncementResponse(AnnouncementBase):
    id: UUID
    teacher_id: int
    institution_id: int
    created_at: datetime
    read_count: Optional[int] = 0
    target_count: Optional[int] = 0
    is_read: Optional[bool] = False
    teacher_name: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)

class AnnouncementReadCreate(BaseModel):
    announcement_id: UUID
    parent_id: int

class AnnouncementReadResponse(BaseModel):
    id: UUID
    announcement_id: UUID
    parent_id: int
    read_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
