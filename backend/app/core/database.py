from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

# Database connection URL from settings
DATABASE_URL = settings.DATABASE_URL

# SQLAlchemy 1.4+ Async expects 'postgresql+asyncpg://'
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)

# SQLAlchemy async engine configuration
engine = create_async_engine(
    DATABASE_URL, 
    pool_pre_ping=True,
    pool_size=settings.DATABASE_POOL_SIZE if hasattr(settings, "DATABASE_POOL_SIZE") else 20,
    max_overflow=settings.DATABASE_MAX_OVERFLOW if hasattr(settings, "DATABASE_MAX_OVERFLOW") else 10,
    pool_recycle=3600
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# Standard Sync Engine & Session (for seeding/scripts)
sync_engine = create_engine(
    settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1) if "asyncpg" in settings.DATABASE_URL else settings.DATABASE_URL,
    pool_pre_ping=True
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=sync_engine)

Base = declarative_base()

async def get_db():
    """
    FastAPI dependency that provides an async local database session.
    Ensures safe rollback on errors and proper session closure.
    """
    async with AsyncSessionLocal() as db:
        try:
            yield db
        except Exception:
            await db.rollback()
            raise
        finally:
            await db.close()
