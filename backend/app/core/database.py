import ssl as _ssl
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

# Raw URL from settings (used as-is for psycopg2 sync engine)
_RAW_DATABASE_URL = settings.DATABASE_URL

# Build the asyncpg-compatible URL
# 1. Swap scheme to postgresql+asyncpg://
_ASYNC_URL = _RAW_DATABASE_URL
if _ASYNC_URL.startswith("postgres://"):
    _ASYNC_URL = _ASYNC_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif _ASYNC_URL.startswith("postgresql://"):
    _ASYNC_URL = _ASYNC_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# 2. asyncpg does NOT accept ?sslmode= — strip it and use connect_args instead
# asyncpg accepts the string "require" (not an ssl.SSLContext) for Neon compatibility
_ssl_required = "sslmode=require" in _ASYNC_URL or "sslmode=prefer" in _ASYNC_URL
for _param in ("?sslmode=require", "&sslmode=require", "?sslmode=prefer", "&sslmode=prefer",
               "?sslmode=disable", "&sslmode=disable", "?sslmode=allow", "&sslmode=allow"):
    _ASYNC_URL = _ASYNC_URL.replace(_param, "")

DATABASE_URL = _ASYNC_URL
_connect_args = {"ssl": "require"} if _ssl_required else {}


# SQLAlchemy async engine
# SQLite uses NullPool and rejects pool_size/max_overflow — only pass those for non-sqlite.
_engine_kwargs = {
    "pool_pre_ping": True,
    "echo": False,
    "connect_args": _connect_args,
}
if not DATABASE_URL.startswith("sqlite"):
    _engine_kwargs["pool_size"] = getattr(settings, "DATABASE_POOL_SIZE", 25)
    _engine_kwargs["max_overflow"] = getattr(settings, "DATABASE_MAX_OVERFLOW", 15)
    _engine_kwargs["pool_recycle"] = 3600

engine = create_async_engine(DATABASE_URL, **_engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# Standard Sync Engine & Session (for seeding/scripts — psycopg2 handles sslmode natively)
sync_engine = create_engine(
    _RAW_DATABASE_URL,
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
