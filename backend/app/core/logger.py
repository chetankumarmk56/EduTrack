import logging
import sys
from app.core.config import settings

def setup_logging():
    """
    Centralized logging configuration for EduTrack.
    Uses standard Python logging with structured formatting.
    """
    log_format = "[%(asctime)s] [%(levelname)s] [%(name)s] - %(message)s"
    log_level = logging.INFO if settings.ENVIRONMENT == "prod" else logging.DEBUG
    
    # Configure root logger
    logging.basicConfig(
        level=log_level,
        format=log_format,
        handlers=[
            logging.StreamHandler(sys.stdout)
        ]
    )
    
    # Optional: silence noisy third-party libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

    logger = logging.getLogger("app")
    logger.info(f"Logging initialized in {settings.ENVIRONMENT} mode.")
    return logger

# Singleton logger instance for 'app'
logger = logging.getLogger("app")
