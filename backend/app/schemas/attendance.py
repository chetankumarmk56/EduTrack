from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from app.schemas.academic import SubjectResponse, SchoolClassResponse

class AttendanceBase(BaseModel):
    date: str # YYYY-MM-DD
    status: str # 'Present', 'Absent', 'Late'

class AttendanceCreate(AttendanceBase):
    student_id: int
    school_class_id: Optional[int] = None
    subject_id: Optional[int] = None
    # Legacy field
    subject: Optional[str] = None

class AttendanceUpdate(BaseModel):
    status: Optional[str] = None

class AttendanceResponse(AttendanceBase):
    id: int
    student_id: int
    school_class: Optional[SchoolClassResponse] = None
    subject_ref: Optional[SubjectResponse] = None
    # Legacy support
    subject: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class AttendanceBatchItem(BaseModel):
    student_id: int
    status: str

class AttendanceBatch(BaseModel):
    date: str
    school_class_id: int
    subject: Optional[str] = None
    subject_id: Optional[int] = None
    records: List[AttendanceBatchItem]
