import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from typing import Optional

class Settings(BaseSettings):
    """
    Centralized configuration management for EduTrack.
    Uses pydantic-settings for robust environment variable handling.
    """
    # General
    APP_NAME: str = "EduTrack SaaS"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    ENVIRONMENT: str = "dev" # dev, prod, test
    
    # Database
    # Must be provided via environment (e.g. postgresql://user:pass@host:port/db)
    DATABASE_URL: str
    
    # Security (using standard field names with env aliases)
    # ✅ CRITICAL FIX: No default SECRET_KEY - must be provided via environment variable
    SECRET_KEY: str = Field(
        ...,  # Makes it REQUIRED - no default!
        min_length=32,
        description="Must be set via SECRET_KEY environment variable. Generate with: python -c 'import secrets; print(secrets.token_urlsafe(32))'"
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours in dev (was 60 min)
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30      # 30 days
    COOKIE_SECURE: bool = False              # False for HTTP (localhost dev), True for HTTPS prod
    
    # Auth Aliases for compatibility
    JWT_SECRET: Optional[str] = None
    JWT_ALGORITHM: Optional[str] = None
    
    # AI (Optional)
    GOOGLE_API_KEY: Optional[str] = None

    # Cloudinary (File Storage)
    CLOUDINARY_CLOUD_NAME: Optional[str] = None
    CLOUDINARY_API_KEY: Optional[str] = None
    CLOUDINARY_API_SECRET: Optional[str] = None
    
    # Razorpay
    RAZORPAY_KEY_ID: Optional[str] = "rzp_test_placeholder"
    RAZORPAY_KEY_SECRET: Optional[str] = "placeholder_secret"
    RAZORPAY_WEBHOOK_SECRET: Optional[str] = "placeholder_webhook_secret"
    
    # Frontend
    FRONTEND_URL: str = "http://localhost:5173"
    COOKIE_DOMAIN: str = Field(
        default="",
        description="Cookie domain for production, e.g. 'yourdomain.com'"
    )
    
    # Infrastructure
    PORT: int = 8000
    REDIS_URL: str = "redis://localhost:6379/0"

    # Exotel Configuration
    EXOTEL_SID: Optional[str] = None
    EXOTEL_API_KEY: Optional[str] = None
    EXOTEL_API_TOKEN: Optional[str] = None
    EXOTEL_FROM_NUMBER: Optional[str] = None

    # Azure Storage
    AZURE_STORAGE_CONNECTION_STRING: Optional[str] = None
    AZURE_CONTAINER_NAME: str = "announcements"
    
    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"),
        extra="ignore"
    )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Validate SECRET_KEY length at runtime
        if len(self.SECRET_KEY) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long. Generate with: python -c 'import secrets; print(secrets.token_urlsafe(32))'")
        
        # Handle aliases manual override if provided in env
        if self.JWT_SECRET:
            self.SECRET_KEY = self.JWT_SECRET
        if self.JWT_ALGORITHM:
            self.ALGORITHM = self.JWT_ALGORITHM

settings = Settings()
