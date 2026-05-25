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


class AnnouncementCategory(str, Enum):
    """Mirror of app.models.communication.AnnouncementCategory."""
    NORMAL = "NORMAL"
    HOMEWORK = "HOMEWORK"


class AnnouncementBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200, description="Announcement title")
    message: str = Field(..., min_length=1, max_length=5000, description="Announcement message")
    type: AnnouncementType
    priority: AnnouncementPriority = AnnouncementPriority.NORMAL
    category: AnnouncementCategory = AnnouncementCategory.NORMAL
    class_id: Optional[int] = None
    student_id: Optional[int] = None
    attachment_url: Optional[str] = None

    # Homework-only optional fields. Always accepted on the base model so
    # responses can carry them uniformly; required-ness is enforced per
    # category in AnnouncementCreate's validator.
    due_date: Optional[datetime] = None
    subject: Optional[str] = Field(None, max_length=120)
    instructions: Optional[str] = Field(None, max_length=5000)
    
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
        if self.category == AnnouncementCategory.HOMEWORK:
            # due_date is the one piece of homework metadata we insist on —
            # without it parents can't tell when the task is owed and the
            # confirmation flow loses its anchor. Subject + instructions
            # stay optional so a teacher can post quick homework.
            if self.due_date is None:
                raise ValueError("due_date is required for homework announcements")
        return self

class AnnouncementUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    message: Optional[str] = Field(None, min_length=1, max_length=5000)
    type: Optional[AnnouncementType] = None
    priority: Optional[AnnouncementPriority] = None
    category: Optional[AnnouncementCategory] = None
    class_id: Optional[int] = None
    student_id: Optional[int] = None
    attachment_url: Optional[str] = None
    due_date: Optional[datetime] = None
    subject: Optional[str] = Field(None, max_length=120)
    instructions: Optional[str] = Field(None, max_length=5000)
    
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

class HomeworkConfirmationStudent(BaseModel):
    """Lightweight per-student confirmation view embedded in responses."""
    student_id: int
    student_name: Optional[str] = None
    confirmed: bool = False
    confirmed_at: Optional[datetime] = None
    confirmed_by_parent_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class AnnouncementResponse(AnnouncementBase):
    id: UUID
    teacher_id: int
    institution_id: int
    created_at: datetime
    read_count: Optional[int] = 0
    target_count: Optional[int] = 0
    is_read: Optional[bool] = False
    teacher_name: Optional[str] = None

    # Homework-only response fields. Populated by the service for HOMEWORK
    # announcements only; absent / empty for NORMAL announcements so old
    # clients ignore them transparently.
    homework_confirmed_count: Optional[int] = 0
    homework_target_count: Optional[int] = 0
    # Per-child confirmation status from the viewer's perspective. Only
    # populated for parent / student callers; empty for teacher feed.
    homework_my_children: List[HomeworkConfirmationStudent] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class HomeworkConfirmRequest(BaseModel):
    """Parent submits one confirmation per child."""
    student_id: int


class HomeworkConfirmationResponse(BaseModel):
    id: UUID
    announcement_id: UUID
    student_id: int
    parent_id: Optional[int] = None
    confirmed_at: datetime
    student_name: Optional[str] = None
    parent_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class HomeworkPendingStudent(BaseModel):
    """An audience member who hasn't confirmed the homework yet."""
    student_id: int
    student_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class HomeworkConfirmationsBreakdown(BaseModel):
    """Teacher-facing split of confirmed vs. still-pending students."""
    confirmed: List[HomeworkConfirmationResponse] = Field(default_factory=list)
    pending: List[HomeworkPendingStudent] = Field(default_factory=list)

class DevicePlatform(str, Enum):
    IOS = "ios"
    ANDROID = "android"
    WEB = "web"


class DeviceTokenRegister(BaseModel):
    """
    Payload from the mobile app when it asks the backend to remember the
    device's Expo push token. We deliberately accept any well-formed
    Expo token string here — the format check (must start with ExponentPushToken[)
    happens server-side in the service so we can fail loudly if a stray
    FCM/APNs token sneaks in.
    """
    expo_push_token: str = Field(..., min_length=10, max_length=200)
    platform: DevicePlatform = DevicePlatform.ANDROID
    device_name: Optional[str] = Field(None, max_length=120)


class DeviceTokenResponse(BaseModel):
    id: int
    expo_push_token: str
    platform: str
    device_name: Optional[str] = None
    is_active: bool

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
