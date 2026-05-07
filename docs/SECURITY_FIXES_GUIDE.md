
# 🔧 SECURITY FIXES - IMPLEMENTATION GUIDE

## Priority 1: Password Complexity Validation

### File: `backend/app/schemas/directory.py`

Add to the imports:
```python
from pydantic import BaseModel, Field, validator, EmailStr
import re
```

Update any user creation schemas:
```python
class UserCreateSchema(BaseModel):
    email: EmailStr  # Validates email format
    password: str = Field(
        ..., 
        min_length=10,
        description="Min 10 chars: uppercase, lowercase, digit, special char"
    )
    name: str = Field(..., min_length=2)
    
    @validator('password')
    def validate_password_strength(cls, v):
        """Enforce password complexity requirements"""
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
    
    class Config:
        schema_extra = {
            "example": {
                "email": "user@example.com",
                "password": "SecurePass@123",
                "name": "John Doe"
            }
        }
```

---

## Priority 2: Fix CORS Configuration

### File: `backend/app/main.py`

Replace the CORS middleware setup:

```python
from fastapi.middleware.cors import CORSMiddleware

# ✅ FIXED: Explicit origins, methods, and headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,  # Production domain
        # REMOVE localhost from production!
    ] if settings.ENVIRONMENT == "prod" else [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],  # ✅ Explicit
    allow_headers=[
        "Content-Type", 
        "Authorization",
        "X-Institution-Id",
        "X-Portal-Role"
    ],  # ✅ Explicit
    expose_headers=["Content-Type"],
    max_age=600,  # Cache preflight for 10 min
)
```

Update `backend/app/core/config.py`:
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # ... existing settings ...
    
    FRONTEND_URL: str = Field(
        ...,  # Required
        description="Frontend domain for CORS, e.g., https://yourdomain.com"
    )
    ENVIRONMENT: str = Field(
        default="dev",
        description="Environment: dev, staging, prod"
    )
```

---

## Priority 3: Remove Default SECRET_KEY

### File: `backend/app/core/config.py`

**BEFORE (Vulnerable)**:
```python
SECRET_KEY: str = "edutrack-secret-key-32-bytes-placeholder"
```

**AFTER (Fixed)**:
```python
from pydantic import Field

SECRET_KEY: str = Field(
    ...,  # Makes it REQUIRED - no default!
    min_length=32,
    description="Must be a random string of at least 32 characters. "
                "Generate with: python -c 'import secrets; print(secrets.token_urlsafe(32))'"
)

# Add validation
model_config = ConfigDict(
    case_sensitive=True,
)

def __init__(self, **data):
    super().__init__(**data)
    if len(self.SECRET_KEY) < 32:
        raise ValueError("SECRET_KEY must be at least 32 characters long")
```

Create `.env.example`:
```bash
# .env.example
SECRET_KEY=<generate with: python -c 'import secrets; print(secrets.token_urlsafe(32))'>
DATABASE_URL=postgresql://user:password@localhost/dbname
ENVIRONMENT=prod
FRONTEND_URL=https://yourdomain.com
```

---

## Priority 4: Add Rate Limiting

### Step 1: Install slowapi
```bash
pip install slowapi
```

### Step 2: Create rate limiter

### File: `backend/app/core/limiter.py` (NEW FILE)

```python
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.responses import JSONResponse

limiter = Limiter(key_func=get_remote_address)

@limiter.error_handler
async def rate_limit_error_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Too many requests. Please try again later.",
            "retry_after": exc.detail
        }
    )
```

### File: `backend/app/main.py`

```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.core.limiter import limiter

app = FastAPI()
app.state.limiter = limiter

@app.exception_handler(RateLimitExceeded)
async def custom_rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Too many requests. Please try again later.",
            "retry_after": "60"
        },
    )
```

### File: `backend/app/api/routes/auth.py`

```python
from fastapi import APIRouter, Depends, HTTPException, status
from app.core.limiter import limiter

router = APIRouter()

@router.post("/login", response_model=Token)
@limiter.limit("5/minute")  # ✅ Max 5 login attempts per minute per IP
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    # ... existing login logic ...
    pass

@router.post("/refresh", response_model=AccessToken)  
@limiter.limit("10/minute")  # ✅ Max 10 refresh attempts per minute
async def refresh_token(request: Request, ...):
    # ... existing refresh logic ...
    pass
```

---

## Priority 5: Input Validation

### File: `backend/app/schemas/directory.py`

Add email and date validation:

```python
from pydantic import BaseModel, Field, EmailStr, validator
from datetime import date

class StudentLogin(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    dob: date  # ✅ Auto-validates date format
    school_class_id: int = Field(..., gt=0)
    role: str = Field(..., pattern="^(student|parent|teacher)$")
    
    @validator('dob')
    def validate_dob(cls, v):
        """Ensure DOB is reasonable"""
        if v.year < 1900:
            raise ValueError("Invalid year")
        if v > date.today():
            raise ValueError("DOB cannot be in future")
        return v

class MarkSchema(BaseModel):
    student_id: int = Field(..., gt=0)
    exam_id: int = Field(..., gt=0)
    score: float = Field(..., ge=0)
    max_score: float = Field(..., gt=0)
    
    @validator('score')
    def validate_score(cls, v, values):
        """Ensure score doesn't exceed max"""
        max_score = values.get('max_score')
        if max_score is not None and v > max_score:
            raise ValueError(f"Score cannot exceed {max_score}")
        return v

class AnnouncementSchema(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    content: str = Field(..., min_length=1, max_length=5000)
    
    @validator('content')
    def sanitize_content(cls, v):
        """Prevent XSS by removing potentially dangerous HTML"""
        # Basic XSS prevention - don't allow script tags
        if "<script" in v.lower() or "javascript:" in v.lower():
            raise ValueError("HTML script tags not allowed")
        return v
```

---

## Priority 6: Improve Cookie Security

### File: `backend/app/api/routes/auth.py`

Update the login endpoint:

```python
from fastapi import Response, status
from backend.app.core.config import settings

@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), ...):
    # ... validate credentials ...
    
    # Create tokens
    access_token = create_access_token(...)
    refresh_token = create_refresh_token(...)
    
    # ✅ IMPROVED: Better cookie security
    response = JSONResponse(
        content={"access_token": access_token, "token_type": "bearer"},
        status_code=status.HTTP_200_OK
    )
    
    response.set_cookie(
        key=f"edu_refresh_{user.role}_{user.id}",
        value=refresh_token,
        path="/api/auth/refresh",
        httponly=True,           # ✅ Not accessible to JavaScript
        secure=True,             # ✅ HTTPS only (no HTTP)
        samesite="Strict",       # ✅ CSRF prevention
        domain=settings.COOKIE_DOMAIN if settings.ENVIRONMENT == "prod" else None,
        max_age=30 * 60,         # ✅ 30 minutes (was 7 days!)
    )
    
    return response
```

Add to `backend/app/core/config.py`:
```python
COOKIE_DOMAIN: str = Field(
    default="",
    description="Production cookie domain, e.g., 'yourdomain.com'"
)
```

---

## Priority 7: Add Two-Factor Authentication (2FA)

### File: `backend/requirements.txt`

Add:
```
pyotp>=2.9.0
qrcode>=7.4.2
Pillow>=10.0.0
```

### File: `backend/app/models/core.py`

```python
from sqlalchemy import Column, String, Boolean
from sqlalchemy.orm import relationship

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id"))
    is_active = Column(Boolean, default=True, index=True)
    
    # ✅ NEW: 2FA fields
    two_factor_enabled = Column(Boolean, default=False)
    two_factor_secret = Column(String(32), nullable=True)  # Base32 encoded
    backup_codes = Column(JSON, nullable=True)  # List of one-time codes
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

### File: `backend/app/schemas/auth.py`

```python
class TwoFactorSetup(BaseModel):
    secret: str  # Base32 encoded secret
    qr_code: str  # Base64 encoded QR code image

class TwoFactorVerify(BaseModel):
    totp_code: str = Field(..., regex="^[0-9]{6}$")

class TwoFactorLogin(BaseModel):
    email: EmailStr
    password: str
    totp_code: str = Field(..., regex="^[0-9]{6}$")
```

### File: `backend/app/services/auth_service.py` (NEW)

```python
import pyotp
import qrcode
from io import BytesIO
import base64

class TwoFactorAuthService:
    
    @staticmethod
    def generate_secret() -> str:
        """Generate a random secret for TOTP"""
        return pyotp.random_base32()
    
    @staticmethod
    def generate_qr_code(email: str, secret: str) -> str:
        """Generate QR code for authenticator app"""
        totp = pyotp.TOTP(secret)
        uri = totp.provisioning_uri(
            name=email,
            issuer_name="EduTrack"
        )
        
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(uri)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        buf = BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)
        
        return base64.b64encode(buf.getvalue()).decode()
    
    @staticmethod
    def verify_totp(secret: str, code: str) -> bool:
        """Verify TOTP code"""
        totp = pyotp.TOTP(secret)
        return totp.verify(code, valid_window=1)
    
    @staticmethod
    def generate_backup_codes(count: int = 10) -> list:
        """Generate one-time backup codes"""
        codes = [pyotp.random_base32()[:8].upper() for _ in range(count)]
        return codes
```

---

## Priority 8: Account Lockout Implementation

### File: `backend/app/models/core.py`

Add to User model:
```python
class User(Base):
    # ... existing fields ...
    
    failed_login_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime, nullable=True)  # Timestamp when unlock happens
```

### File: `backend/app/services/auth_service.py`

```python
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

class AuthService:
    
    @staticmethod
    async def check_and_update_login_attempts(
        db: Session,
        user: User,
        success: bool
    ) -> None:
        """Track login attempts and lock account if needed"""
        
        # Check if currently locked
        if user.locked_until and datetime.utcnow() < user.locked_until:
            minutes_left = (user.locked_until - datetime.utcnow()).total_seconds() / 60
            raise HTTPException(
                status_code=429,
                detail=f"Account locked. Try again in {int(minutes_left)} minutes"
            )
        
        if success:
            # Reset on successful login
            user.failed_login_attempts = 0
            user.locked_until = None
        else:
            # Increment failed attempts
            user.failed_login_attempts += 1
            
            # Lock after 5 failed attempts
            if user.failed_login_attempts >= 5:
                user.locked_until = datetime.utcnow() + timedelta(minutes=15)
                raise HTTPException(
                    status_code=429,
                    detail="Account locked due to too many failed login attempts. Try again in 15 minutes"
                )
        
        db.commit()
```

---

## Priority 9: Add Audit Logging

### File: `backend/app/models/core.py`

```python
class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(100), index=True)  # "LOGIN", "CREATE_USER", "UPDATE_GRADE"
    resource_type = Column(String(50))  # "User", "Mark", "Announcement"
    resource_id = Column(Integer)
    changes = Column(JSON)  # {'old': {...}, 'new': {...}}
    ip_address = Column(String(45))  # IPv4 or IPv6
    status = Column(String(20))  # SUCCESS, FAILURE
    timestamp = Column(DateTime, index=True, default=datetime.utcnow)
    
    user = relationship("User", back_populates="audit_logs")
```

### File: `backend/app/services/audit_service.py` (NEW)

```python
from sqlalchemy.orm import Session
from backend.app.models.core import AuditLog
from fastapi import Request

class AuditService:
    
    @staticmethod
    async def log_action(
        db: Session,
        user_id: int,
        action: str,
        resource_type: str,
        resource_id: int,
        status: str,
        request: Request,
        changes: dict = None
    ):
        """Log user actions for audit trail"""
        
        # Get IP address
        ip = request.client.host if request.client else "unknown"
        
        audit = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            status=status,
            ip_address=ip,
            changes=changes or {}
        )
        
        db.add(audit)
        db.commit()
```

---

## .env.example Template

```bash
# Security
SECRET_KEY=<generate: python -c 'import secrets; print(secrets.token_urlsafe(32))'>
ENVIRONMENT=prod
FRONTEND_URL=https://yourdomain.com
COOKIE_DOMAIN=yourdomain.com

# Database
DATABASE_URL=postgresql://user:password@host:5432/dbname

# API Keys
RAZORPAY_KEY_ID=your_key
RAZORPAY_KEY_SECRET=your_secret

# Email (for password reset, 2FA)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
SUPPORT_EMAIL=support@yourdomain.com

# Azure Storage (optional)
AZURE_STORAGE_ACCOUNT_NAME=
AZURE_STORAGE_ACCOUNT_KEY=
AZURE_CONTAINER_NAME=

# Logging
LOG_LEVEL=INFO
```

---

## Testing Security Fixes

```python
# backend/tests/test_security.py

import pytest
from fastapi.testclient import TestClient

def test_weak_password_rejected(client: TestClient):
    """Test that weak passwords are rejected"""
    response = client.post("/api/auth/register", json={
        "email": "test@example.com",
        "password": "weak",  # Too weak
        "name": "Test User"
    })
    assert response.status_code == 422
    assert "password" in response.json()["detail"][0]["loc"]

def test_rate_limiting(client: TestClient):
    """Test login rate limiting"""
    for i in range(6):  # Try 6 times
        response = client.post("/api/auth/login", json={
            "username": "admin@example.com",
            "password": "wrong"
        })
    
    # 6th attempt should be rate limited
    assert response.status_code == 429

def test_secret_key_required(monkeypatch):
    """Test that SECRET_KEY is required"""
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(ValueError):
        from app.core.config import Settings
        Settings()

def test_cors_wildcard_removed(client: TestClient):
    """Test CORS is properly configured"""
    response = client.options(
        "/api/marks",
        origin="http://evil.com"
    )
    # Should not allow arbitrary origins
    assert "evil.com" not in response.headers.get("Access-Control-Allow-Origin", "")
```

---

## Deployment Checklist

- [ ] Generate new SECRET_KEY and set in production
- [ ] Set ENVIRONMENT=prod
- [ ] Set FRONTEND_URL to actual domain
- [ ] Set COOKIE_DOMAIN to actual domain
- [ ] Ensure HTTPS is enforced
- [ ] Run all security tests
- [ ] Update password policy in documentation
- [ ] Set up SMTP for password resets
- [ ] Configure rate limiting thresholds
- [ ] Set up monitoring for failed login attempts
- [ ] Enable audit logging
- [ ] Configure backups with encryption
- [ ] Set up security event alerts

