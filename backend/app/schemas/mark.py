from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from app.schemas.academic import SubjectResponse

class ExamBase(BaseModel):
    name: str
    term: Optional[str] = None
    date: Optional[str] = None

class ExamCreate(ExamBase):
    pass

class ExamResponse(ExamBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class MarkBase(BaseModel):
    score: int
    max_score: Optional[int] = 100
    subject: Optional[str] = None # Legacy support

class MarkCreate(MarkBase):
    student_id: int
    exam_id: Optional[int] = None
    subject_id: Optional[int] = None
    teacher_id: Optional[int] = None
    # For legacy test name support
    test_name: Optional[str] = None

class MarkUpdate(BaseModel):
    score: Optional[int] = None
    max_score: Optional[int] = None

class MarkResponse(MarkBase):
    id: int
    student_id: int
    exam_id: Optional[int] = None
    test_name: Optional[str] = None
    exam: Optional[ExamResponse] = None
    subject_ref: Optional[SubjectResponse] = None
    model_config = ConfigDict(from_attributes=True)
