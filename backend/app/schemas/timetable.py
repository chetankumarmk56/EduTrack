from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import time


# ---------- Schedule Periods (institution-wide bell schedule) ----------

class SchedulePeriodBase(BaseModel):
    name: str
    period_type: str = Field(..., description="class_period | break | lunch | assembly")
    order: int = 0
    start_time: time
    end_time: time


class SchedulePeriodCreate(SchedulePeriodBase):
    pass


class SchedulePeriodUpdate(BaseModel):
    name: Optional[str] = None
    period_type: Optional[str] = None
    order: Optional[int] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None


class SchedulePeriodResponse(SchedulePeriodBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


# ---------- Timetable Slots (per class/day/period) ----------

class TimetableSlotBase(BaseModel):
    school_class_id: int
    schedule_period_id: int
    day_of_week: int = Field(..., ge=0, le=6, description="0=Mon ... 6=Sun")
    subject_id: Optional[int] = None
    teacher_id: Optional[int] = None
    room: Optional[str] = None


class TimetableSlotCreate(TimetableSlotBase):
    pass


class TimetableSlotUpdate(BaseModel):
    subject_id: Optional[int] = None
    teacher_id: Optional[int] = None
    room: Optional[str] = None


# Lightweight nested previews (avoid heavy schema imports)
class _SubjectPreview(BaseModel):
    id: int
    name: str
    code: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class _TeacherPreview(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class _SchoolClassPreview(BaseModel):
    id: int
    display_name: Optional[str] = None
    room_number: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class TimetableSlotResponse(BaseModel):
    id: int
    school_class_id: int
    schedule_period_id: int
    day_of_week: int
    subject_id: Optional[int] = None
    teacher_id: Optional[int] = None
    room: Optional[str] = None

    subject: Optional[_SubjectPreview] = None
    teacher: Optional[_TeacherPreview] = None
    school_class: Optional[_SchoolClassPreview] = None

    model_config = ConfigDict(from_attributes=True)


# ---------- Composite views ----------

class ClassTimetableResponse(BaseModel):
    """Full week view for one class — periods + slots bundled together."""
    school_class_id: int
    school_class: Optional[_SchoolClassPreview] = None
    periods: List[SchedulePeriodResponse]
    slots: List[TimetableSlotResponse]


class TeacherTimetableResponse(BaseModel):
    """Full week view for a teacher across all the classes they teach."""
    teacher_id: int
    periods: List[SchedulePeriodResponse]
    slots: List[TimetableSlotResponse]
