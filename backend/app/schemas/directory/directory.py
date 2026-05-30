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
    email: Optional[str] = None
    # primary_phone is the main contact + parent-login credential.
    # secondary_phone is the fallback / emergency number.
    primary_phone: Optional[str] = None
    secondary_phone: Optional[str] = None
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
    email: Optional[str] = None
    primary_phone: Optional[str] = None
    secondary_phone: Optional[str] = None
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
    # Optional student profile details.
    address: Optional[str] = None
    blood_group: Optional[str] = None

class StudentCreate(StudentBase):
    email: Optional[EmailStr] = None
    password: str = Field(..., description="Student/Parent password (usually DOB)")
    # Link to an existing parent directly, or omit to find-or-create one from
    # the guardian inputs below.
    parent_id: Optional[int] = None
    school_class_id: Optional[int] = None

    # ── Guardian inputs ────────────────────────────────────────────────────
    # These are NOT stored on the student. The service uses them to
    # find-or-create the Parent record (keyed on the normalized primary
    # phone within the institution) and stores only parent_id on the student.
    #
    # parent_phone is REQUIRED: parent-portal login uses (guardian_phone,
    # student_dob), so a student enrolled without a phone has no way to log
    # in. Existing rows are intentionally not backfilled.
    parent_name: Optional[str] = None
    parent_email: Optional[str] = None
    parent_phone: str = Field(
        ...,
        min_length=4,
        max_length=24,
        description="Guardian primary phone — required for parent-portal login",
    )
    parent_secondary_phone: Optional[str] = Field(
        None,
        max_length=24,
        description="Optional fallback / emergency guardian number",
    )
    parent_relation: Optional[str] = None

    @field_validator("parent_phone")
    @classmethod
    def _validate_parent_phone_digits(cls, v: str) -> str:
        digits = "".join(ch for ch in v if ch.isdigit())
        if len(digits) < 10:
            raise ValueError(
                "Parent phone must contain at least 10 digits "
                "(parent-portal login uses this number)."
            )
        return v.strip()

class StudentUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    dob: Optional[str] = None
    whatsapp: Optional[str] = None
    school_class_id: Optional[int] = None
    address: Optional[str] = None
    blood_group: Optional[str] = None
    # Guardian fields patch the linked parent record (creating one if the
    # student has none and a primary phone is supplied).
    parent_name: Optional[str] = None
    parent_email: Optional[str] = None
    parent_phone: Optional[str] = None
    parent_secondary_phone: Optional[str] = None
    parent_relation: Optional[str] = None

class StudentResponse(StudentBase):
    id: int
    user_id: Optional[int] = None
    plain_password: Optional[str] = None
    roll_number: Optional[int] = None
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
    # Email + active flag are admin-editable from the Teacher Directory.
    # Both are optional so the same payload can patch any subset of fields.
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = None

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


class ParentLogin(BaseModel):
    """
    Parent-portal login. Credentials are the guardian phone the admin
    recorded on the student's profile + the student's date of birth.

    The pair `(parent_phone, dob)` is unique in practice — siblings share
    the phone but not DOB; twins of the same family are the only realistic
    ambiguity case, in which the admin must record distinct guardian
    contacts. The backend rejects ambiguous matches with a clear error.
    """
    parent_phone: str = Field(
        ...,
        min_length=4,
        max_length=24,
        description="Guardian phone number as given to the school admin during enrollment",
    )
    dob: str = Field(..., description="Student date of birth in YYYY-MM-DD format")

    @field_validator("dob")
    @classmethod
    def validate_dob(cls, v: str) -> str:
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

    @field_validator("parent_phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        # Strip all non-digit characters and require at least 4 remaining.
        # We don't enforce a 10-digit rule here so international formats work;
        # the service normalizes both sides of the comparison.
        digits = "".join(ch for ch in v if ch.isdigit())
        if len(digits) < 4:
            raise ValueError("Phone number must contain at least 4 digits")
        return v

# --- Password Update ---
class PasswordUpdate(BaseModel):
    old_password: Optional[str] = None  # Optional for admin force-reset
    new_password: str = Field(..., min_length=10, description="Min 10 chars: uppercase, lowercase, digit, special char")
    
    @field_validator('new_password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        return validate_password_strength(v)
