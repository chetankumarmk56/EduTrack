import os
from pydantic_settings import BaseSettings, SettingsConfigDict
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
    SECRET_KEY: str = "edutrack-secret-key-32-bytes-placeholder"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 1 week in minutes
    
    # Auth Aliases for compatibility
    JWT_SECRET: Optional[str] = None
    JWT_ALGORITHM: Optional[str] = None
    
    # AI (Optional)
    GOOGLE_API_KEY: Optional[str] = None
    
    # Frontend
    FRONTEND_URL: str = "http://localhost:3000"
    
    # Infrastructure
    PORT: int = 8000
    
    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"),
        extra="ignore"
    )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Handle aliases manual override if provided in env
        if self.JWT_SECRET:
            self.SECRET_KEY = self.JWT_SECRET
        if self.JWT_ALGORITHM:
            self.ALGORITHM = self.JWT_ALGORITHM

settings = Settings()
