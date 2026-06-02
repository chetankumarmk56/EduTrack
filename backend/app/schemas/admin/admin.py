from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from typing import Optional, List
from datetime import datetime
import re

# --- Password Validation ---
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

# --- Institution Schemas ---
class InstitutionBase(BaseModel):
    name: str
    slug: str
    is_active: Optional[bool] = True

class InstitutionCreate(InstitutionBase):
    pass

class InstitutionUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    is_active: Optional[bool] = None
    logo_url: Optional[str] = None

class InstitutionResponse(InstitutionBase):
    id: int
    created_at: datetime
    # Resolved (presigned / passthrough) URL — null when no logo uploaded.
    logo_url: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class TrashedInstitutionResponse(InstitutionResponse):
    deleted_at: datetime
    days_until_purge: int

# --- Schools Overview Schemas ---
# Powers the Super-Admin "Schools Overview" page: a paginated grid of every
# school plus platform-wide rollup totals. Student / teacher counts are
# aggregated at the database level (see admin_service.get_schools_overview)
# so this stays N+1-free regardless of how many schools exist.

class SchoolOverviewRow(BaseModel):
    """One row in the schools data grid."""
    id: int
    name: str
    # School Code — we surface the institution slug as the human-facing code.
    code: Optional[str] = None
    principal_name: Optional[str] = None
    total_students: int = 0
    total_teachers: int = 0
    is_active: bool = True
    created_at: Optional[datetime] = None

class SchoolsOverviewSummary(BaseModel):
    """Dashboard summary cards across all (non-trashed) schools."""
    total_schools: int = 0
    total_students: int = 0
    total_teachers: int = 0
    active_schools: int = 0
    inactive_schools: int = 0

class SchoolsOverviewResponse(BaseModel):
    """Paginated grid payload + the always-global summary block."""
    items: List[SchoolOverviewRow]
    summary: SchoolsOverviewSummary
    total: int          # total rows matching the current filters (pre-pagination)
    skip: int
    limit: int

class SchoolAdminInfo(BaseModel):
    id: int
    name: str
    email: Optional[str] = None
    is_active: bool = True

class SchoolDetailResponse(BaseModel):
    """Expanded profile shown in the 'View Details' drawer."""
    id: int
    name: str
    code: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None
    logo_url: Optional[str] = None
    total_students: int = 0
    total_teachers: int = 0
    admins: List[SchoolAdminInfo] = []

# --- Admin User Schemas ---
class UserBase(BaseModel):
    email: EmailStr
    name: str
    role: str
    is_active: Optional[bool] = True
    institution_id: Optional[int] = None

class UserCreate(UserBase):
    password: str = Field(..., min_length=10, description="Min 10 chars: uppercase, lowercase, digit, special char")
    
    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        return validate_password_strength(v)

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    password: Optional[str] = Field(None, min_length=10, description="Min 10 chars: uppercase, lowercase, digit, special char")
    is_active: Optional[bool] = None
    
    @field_validator('password')
    @classmethod
    def validate_password(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return validate_password_strength(v)
        return v

class UserResponse(UserBase):
    id: int
    model_config = ConfigDict(from_attributes=True)
