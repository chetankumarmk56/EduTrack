from pydantic import BaseModel, ConfigDict, EmailStr
from typing import Optional, List
from datetime import datetime

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

# --- Admin User Schemas ---
class UserBase(BaseModel):
    email: EmailStr
    name: str
    role: str
    is_active: Optional[bool] = True
    institution_id: Optional[int] = None

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None

class UserResponse(UserBase):
    id: int
    model_config = ConfigDict(from_attributes=True)
