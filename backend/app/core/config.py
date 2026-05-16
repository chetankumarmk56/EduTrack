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
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o-mini"

    # Cloudinary (File Storage)
    CLOUDINARY_CLOUD_NAME: Optional[str] = None
    CLOUDINARY_API_KEY: Optional[str] = None
    CLOUDINARY_API_SECRET: Optional[str] = None

    # AWS S3 (private teacher uploads — falls back to local disk if unset)
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_S3_REGION: Optional[str] = None
    AWS_S3_BUCKET: Optional[str] = None
    AWS_S3_PRESIGN_TTL: int = 900  # seconds (15 min)
    
    # Razorpay
    RAZORPAY_KEY_ID: Optional[str] = "rzp_test_placeholder"
    RAZORPAY_KEY_SECRET: Optional[str] = "placeholder_secret"
    RAZORPAY_WEBHOOK_SECRET: Optional[str] = "placeholder_webhook_secret"
    
    # Frontend
    FRONTEND_URL: str = "http://localhost:5173"
    # Optional comma-separated extra origins (e.g. "https://app.example.com,https://admin.example.com")
    ADDITIONAL_CORS_ORIGINS: str = ""
    COOKIE_DOMAIN: str = Field(
        default="",
        description="Cookie domain for production, e.g. '.yourdomain.com' (leading dot for subdomains)"
    )
    
    # Infrastructure
    PORT: int = 8000

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

        # Production hardening: fail fast if critical credentials are placeholders
        if self.ENVIRONMENT == "prod":
            placeholder_values = {
                "RAZORPAY_KEY_ID": ("rzp_test_placeholder", self.RAZORPAY_KEY_ID),
                "RAZORPAY_KEY_SECRET": ("placeholder_secret", self.RAZORPAY_KEY_SECRET),
                "RAZORPAY_WEBHOOK_SECRET": ("placeholder_webhook_secret", self.RAZORPAY_WEBHOOK_SECRET),
            }
            unset = [name for name, (placeholder, value) in placeholder_values.items() if not value or value == placeholder]
            if unset:
                raise ValueError(
                    f"Production startup blocked: the following Razorpay credentials are unset or use placeholder values: {unset}. "
                    "Set them via environment variables before starting in production."
                )

            # Warn (don't block) on conditions that degrade reliability but aren't fatal.
            # Uploads stored on container disk are lost on redeploy and unavailable to
            # other replicas. Required for any multi-replica deploy (e.g. App Runner ≥2).
            import warnings
            if not self.AWS_S3_BUCKET or not self.AWS_S3_REGION:
                warnings.warn(
                    "AWS_S3_BUCKET/AWS_S3_REGION unset in production — uploads will be lost on redeploy "
                    "and inaccessible across replicas. OK for single-instance deploys; required for scale-out."
                )

            if not self.FRONTEND_URL or "localhost" in self.FRONTEND_URL:
                warnings.warn(
                    f"FRONTEND_URL='{self.FRONTEND_URL}' looks wrong for production. "
                    "Browsers will block API calls from the real frontend due to CORS."
                )

            # Force secure cookies in production (overrides any .env override)
            self.COOKIE_SECURE = True

settings = Settings()
