from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime


# ── Attendance ──────────────────────────────────────────────────────────────

class TeacherCheckInRequest(BaseModel):
    remarks: Optional[str] = None


class TeacherCheckOutRequest(BaseModel):
    remarks: Optional[str] = None


class TeacherAttendanceEditRequest(BaseModel):
    date: str  # YYYY-MM-DD
    status: str
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None
    remarks: Optional[str] = None


class TeacherAttendanceResponse(BaseModel):
    id: int
    teacher_id: int
    teacher_name: Optional[str] = None
    date: str
    check_in_time: Optional[str]
    check_out_time: Optional[str]
    status: str
    remarks: Optional[str]
    is_edited: int
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class TeacherAttendanceSummary(BaseModel):
    teacher_id: int
    teacher_name: str
    present: int
    absent: int
    half_day: int
    on_leave: int
    total_days: int


# ── Leave ────────────────────────────────────────────────────────────────────

class TeacherLeaveCreateRequest(BaseModel):
    leave_type: str
    start_date: str   # YYYY-MM-DD
    end_date: str     # YYYY-MM-DD
    reason: str

    @field_validator("leave_type")
    @classmethod
    def validate_leave_type(cls, v: str) -> str:
        allowed = {"CASUAL", "SICK", "EARNED", "MATERNITY", "PATERNITY", "OTHER"}
        if v.upper() not in allowed:
            raise ValueError(f"leave_type must be one of {allowed}")
        return v.upper()


class LeaveActionRequest(BaseModel):
    rejection_reason: Optional[str] = None


class TeacherLeaveResponse(BaseModel):
    id: int
    teacher_id: int
    teacher_name: Optional[str] = None
    leave_type: str
    start_date: str
    end_date: str
    days_count: int
    reason: str
    status: str
    approved_by_id: Optional[int]
    approved_by_name: Optional[str] = None
    approved_at: Optional[datetime]
    rejection_reason: Optional[str]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ── Audit Log ────────────────────────────────────────────────────────────────

class AuditLogResponse(BaseModel):
    id: int
    teacher_id: int
    entity_type: str
    entity_id: Optional[int]
    changed_by_id: int
    changed_by_name: Optional[str] = None
    action: str
    old_value: Optional[str]
    new_value: Optional[str]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ── Admin list filters ───────────────────────────────────────────────────────

class AdminAttendanceListParams(BaseModel):
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    teacher_id: Optional[int] = None
    status: Optional[str] = None
    skip: int = 0
    limit: int = 100


class PaginatedAttendanceResponse(BaseModel):
    total: int
    items: List[TeacherAttendanceResponse]


class PaginatedLeaveResponse(BaseModel):
    total: int
    items: List[TeacherLeaveResponse]
