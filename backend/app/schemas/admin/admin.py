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

class InstitutionResponse(InstitutionBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class TrashedInstitutionResponse(InstitutionResponse):
    deleted_at: datetime
    days_until_purge: int

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
