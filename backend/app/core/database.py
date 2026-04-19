from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

# Database connection URL from settings
DATABASE_URL = settings.DATABASE_URL

# SQLAlchemy 1.4+ expects 'postgresql://' instead of 'postgres://' (common in Render/Heroku)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# SQLAlchemy engine configuration with high-performance Postgres pooling
engine = create_engine(
    DATABASE_URL, 
    pool_pre_ping=True,
    pool_size=settings.DATABASE_POOL_SIZE if hasattr(settings, "DATABASE_POOL_SIZE") else 20,
    max_overflow=settings.DATABASE_MAX_OVERFLOW if hasattr(settings, "DATABASE_MAX_OVERFLOW") else 10,
    pool_recycle=3600
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    """
    FastAPI dependency that provides a local database session.
    Ensures safe rollback on errors and proper session closure.
    """
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
