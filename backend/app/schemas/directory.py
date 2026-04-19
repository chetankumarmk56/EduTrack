from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional, List
from datetime import date
from app.schemas.academic import SubjectResponse, SchoolClassResponse

# --- Profile Mixins ---
class ProfileBase(BaseModel):
    name: Optional[str] = "Unknown Profile"
    is_active: Optional[bool] = True

# --- Parent Schemas ---
class ParentBase(ProfileBase):
    phone: Optional[str] = None
    relation: Optional[str] = None # e.g. "Guardian"

class ParentCreate(ParentBase):
    email: EmailStr
    password: str

class ParentUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    relation: Optional[str] = None

class ParentResponse(ParentBase):
    id: int
    user_id: Optional[int] = None
    model_config = ConfigDict(from_attributes=True)

# --- Student Schemas ---
class StudentBase(ProfileBase):
    dob: Optional[str] = None
    whatsapp: Optional[str] = None
    parent_name: Optional[str] = None
    parent_email: Optional[str] = None
    parent_phone: Optional[str] = None

class StudentCreate(StudentBase):
    email: Optional[EmailStr] = None
    password: str
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
class TeacherBase(ProfileBase):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None

class TeacherCreate(TeacherBase):
    password: str

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
    name: str
    class_level: str
    section: str
    dob: str
    role: Optional[str] = "student" # Can be "student" or "parent"

class TeacherLogin(BaseModel):
    email: str
    password: str

# --- Password Update ---
class PasswordUpdate(BaseModel):
    old_password: Optional[str] = None  # Optional for admin force-reset
    new_password: str
