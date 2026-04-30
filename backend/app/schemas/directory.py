from pydantic import BaseModel, EmailStr, ConfigDict, Field, field_validator
from typing import Optional, List
from datetime import date
import re
from app.schemas.academic import SubjectResponse, SchoolClassResponse

# --- Password Validation Mixin ---
def validate_password_strength(v: str) -> str:
    """Enforce password complexity requirements: min 10 chars, uppercase, lowercase, digit, special char"""
    errors = []
    
    if len(v) < 10:
        errors.append("At least 10 characters")
    if not any(c.isupper() for c in v):
        errors.append("At least one uppercase letter")
    if not any(c.islower() for c in v):
        errors.append("At least one lowercase letter")
    if not any(c.isdigit() for c in v):
        errors.append("At least one digit (0-9)")
    if not re.search(r'[!@#$%^&*()_+\-=\[\]{};:\'",.<>?/]', v):
        errors.append("At least one special character (!@#$%^&*)")
    
    if errors:
        raise ValueError(f"Password must contain: {', '.join(errors)}")
    
    return v

# --- Parent Schemas ---
class ParentBase(BaseModel):
    name: Optional[str] = "Unknown Profile"
    is_active: Optional[bool] = True
    phone: Optional[str] = None
    relation: Optional[str] = None # e.g. "Guardian"

class ParentCreate(ParentBase):
    email: EmailStr
    password: str = Field(..., min_length=10, description="Min 10 chars: uppercase, lowercase, digit, special char")
    
    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        return validate_password_strength(v)

class ParentUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    relation: Optional[str] = None

class ParentResponse(ParentBase):
    id: int
    user_id: Optional[int] = None
    model_config = ConfigDict(from_attributes=True)

# --- Student Schemas ---
class StudentBase(BaseModel):
    name: Optional[str] = "Unknown Profile"
    is_active: Optional[bool] = True
    dob: Optional[str] = None
    whatsapp: Optional[str] = None
    parent_name: Optional[str] = None
    parent_email: Optional[str] = None
    parent_phone: Optional[str] = None

class StudentCreate(StudentBase):
    email: Optional[EmailStr] = None
    password: str = Field(..., description="Student/Parent password (usually DOB)")
    parent_id: Optional[int] = None
    school_class_id: Optional[int] = None

class StudentUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    dob: Optional[str] = None
    whatsapp: Optional[str] = None
    school_class_id: Optional[int] = None
    parent_name: Optional[str] = None
    parent_email: Optional[str] = None
    parent_phone: Optional[str] = None

class StudentResponse(StudentBase):
    id: int
    user_id: Optional[int] = None
    plain_password: Optional[str] = None
    parent: Optional[ParentResponse] = None
    school_class: Optional[SchoolClassResponse] = None
    model_config = ConfigDict(from_attributes=True)

# --- Teacher Schemas ---
class TeacherBase(BaseModel):
    name: Optional[str] = "Unknown Profile"
    is_active: Optional[bool] = True
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None

class TeacherCreate(TeacherBase):
    password: str = Field(..., min_length=10, description="Min 10 chars: uppercase, lowercase, digit, special char")
    
    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        return validate_password_strength(v)

class TeacherUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None

class TeacherAssignmentCreate(BaseModel):
    teacher_id: int
    school_class_id: int
    subject_id: int

class TeacherAssignmentResponse(BaseModel):
    id: int
    school_class: SchoolClassResponse
    subject_ref: SubjectResponse
    model_config = ConfigDict(from_attributes=True)

class TeacherResponse(TeacherBase):
    id: int
    user_id: int
    plain_password: Optional[str] = None
    assignments: List[TeacherAssignmentResponse] = []
    model_config = ConfigDict(from_attributes=True)

# --- Auth Support ---
class StudentLogin(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Student name")
    class_level: str = Field(..., min_length=1, max_length=50, description="Class level (e.g., Grade 8, 8)")
    section: str = Field(..., min_length=1, max_length=10, description="Section (e.g., A, B)")
    dob: str = Field(..., description="Date of birth in YYYY-MM-DD format")
    role: Optional[str] = Field("student", pattern="^(student|parent)$", description="Role: student or parent")
    
    @field_validator('dob')
    @classmethod
    def validate_dob(cls, v: str) -> str:
        """Validate DOB is in YYYY-MM-DD format and not in future"""
        from datetime import datetime, date
        try:
            dob_date = datetime.strptime(v, "%Y-%m-%d").date()
            if dob_date > date.today():
                raise ValueError("Date of birth cannot be in the future")
            if dob_date.year < 1900:
                raise ValueError("Invalid year - please use realistic birth year")
            return v
        except ValueError as e:
            raise ValueError(f"Invalid date format. Use YYYY-MM-DD. Details: {str(e)}")

class TeacherLogin(BaseModel):
    email: EmailStr = Field(..., description="Teacher email address")
    password: str = Field(..., min_length=1, description="Teacher password")

# --- Password Update ---
class PasswordUpdate(BaseModel):
    old_password: Optional[str] = None  # Optional for admin force-reset
    new_password: str = Field(..., min_length=10, description="Min 10 chars: uppercase, lowercase, digit, special char")
    
    @field_validator('new_password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        return validate_password_strength(v)
