from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional, List
from app.schemas.academic import SubjectResponse

class ExamBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200, description="Exam name")
    term: Optional[str] = Field(None, max_length=100, description="Academic term")
    date: Optional[str] = Field(None, description="Exam date in YYYY-MM-DD format")
    
    @field_validator('date')
    @classmethod
    def validate_date(cls, v: Optional[str]) -> Optional[str]:
        """Validate exam date format"""
        if v is None:
            return v
        from datetime import datetime
        try:
            datetime.strptime(v, "%Y-%m-%d")
            return v
        except ValueError:
            raise ValueError("Invalid date format. Use YYYY-MM-DD")

class ExamCreate(ExamBase):
    pass

class ExamResponse(ExamBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class MarkBase(BaseModel):
    score: float = Field(..., ge=0, description="Student score (must be non-negative)")
    max_score: Optional[float] = Field(100, gt=0, description="Maximum possible score (must be positive)")
    subject: Optional[str] = Field(None, max_length=100) # Legacy support

class MarkCreate(MarkBase):
    student_id: int = Field(..., gt=0, description="Student ID")
    exam_id: Optional[int] = Field(None, gt=0, description="Exam ID")
    subject_id: Optional[int] = Field(None, gt=0, description="Subject ID")
    teacher_id: Optional[int] = Field(None, gt=0, description="Teacher ID")
    test_name: Optional[str] = Field(None, max_length=200, description="Test name (legacy)")
    
    @field_validator('score')
    @classmethod
    def validate_score(cls, v: float, info) -> float:
        """Ensure score doesn't exceed max_score"""
        max_score = info.data.get('max_score')
        if max_score is not None and v > max_score:
            raise ValueError(f"Score ({v}) cannot exceed max_score ({max_score})")
        return v

class MarkUpdate(BaseModel):
    score: Optional[float] = Field(None, ge=0, description="Student score")
    max_score: Optional[float] = Field(None, gt=0, description="Maximum possible score")
    
    @field_validator('score')
    @classmethod
    def validate_score(cls, v: Optional[float], info) -> Optional[float]:
        """Ensure score doesn't exceed max_score"""
        if v is None:
            return v
        max_score = info.data.get('max_score')
        if max_score is not None and v > max_score:
            raise ValueError(f"Score ({v}) cannot exceed max_score ({max_score})")
        return v

class MarkResponse(MarkBase):
    id: int
    student_id: int
    exam_id: Optional[int] = None
    test_name: Optional[str] = None
    exam: Optional[ExamResponse] = None
    subject_ref: Optional[SubjectResponse] = None
    model_config = ConfigDict(from_attributes=True)
