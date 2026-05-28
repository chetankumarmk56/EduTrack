from pydantic import BaseModel, EmailStr, ConfigDict, Field, field_validator, model_validator
from typing import Optional

class Token(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str
    role: str
    institution_id: Optional[int] = None
    # Human-readable school name, surfaced in the response so the client can
    # render "St. Mary's High School" in the dashboard header instead of
    # falling back to "Institution 1" (which is what the UI displayed when
    # only institution_id was available).
    institution_name: Optional[str] = None
    # Resolved (presigned / passthrough) URL to the school logo when
    # uploaded by super-admin. Null when unset — the UI falls back to a
    # generic building glyph.
    institution_logo_url: Optional[str] = None
    user: Optional[dict] = None

class TokenPayload(BaseModel):
    sub: Optional[str] = None
    role: Optional[str] = None
    institution_id: Optional[int] = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=256)
    new_password: str = Field(..., min_length=8, max_length=256)

    @field_validator("new_password")
    @classmethod
    def _new_password_complexity(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("New password must be at least 8 characters long.")
        if not any(c.isalpha() for c in v):
            raise ValueError("New password must include at least one letter.")
        if not any(c.isdigit() for c in v):
            raise ValueError("New password must include at least one number.")
        return v

    @model_validator(mode="after")
    def _new_must_differ_from_current(self) -> "ChangePasswordRequest":
        if self.current_password == self.new_password:
            raise ValueError("New password must be different from the current password.")
        return self


class ChangePasswordResponse(BaseModel):
    message: str
