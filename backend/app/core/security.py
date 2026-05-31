import asyncio
import bcrypt
from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone
from typing import Optional
from app.core.config import settings


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Synchronous bcrypt verify. Kept for scripts (seed.py) and for
    callers outside an async context. Inside FastAPI request handlers
    use ``verify_password_async`` so the GIL-bound ~100ms compute is
    pushed off the event loop.
    """
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except ValueError:
        return False


def get_password_hash(password: str) -> str:
    """
    Synchronous bcrypt hash. See ``verify_password`` for the async/sync
    rule of thumb.
    """
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


async def verify_password_async(plain_password: str, hashed_password: str) -> bool:
    """
    Async-safe wrapper around ``verify_password``.

    Why: bcrypt's checkpw is a CPU-bound C extension that holds the GIL
    for ~100ms at the default cost factor. Inside an async handler that
    stalls the event loop — every other concurrent request (login,
    health check, websocket ping) waits behind it. ``asyncio.to_thread``
    runs the work on a worker thread so the loop stays responsive.
    """
    return await asyncio.to_thread(verify_password, plain_password, hashed_password)


async def get_password_hash_async(password: str) -> str:
    """Async-safe wrapper around ``get_password_hash`` — same rationale."""
    return await asyncio.to_thread(get_password_hash, password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def create_refresh_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str):
    """
    Decodes the JWT token and returns the payload data.
    Raises jose.JWTError on signature failure (wrong key or algorithm).
    """
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


def assert_jwt_roundtrip() -> None:
    """
    Smoke-test that the currently loaded SECRET_KEY can round-trip a JWT.
    Call once at startup to catch key misconfiguration before the first
    real request fails with a cryptic "Invalid authentication token".

    Raises RuntimeError with an actionable message on failure.
    """
    probe = {"sub": "startup-probe", "role": "test"}
    try:
        token = create_access_token(probe)
        decoded = decode_access_token(token)
        assert decoded["sub"] == probe["sub"]
    except Exception as exc:
        raise RuntimeError(
            f"JWT round-trip failed — SECRET_KEY is inconsistent or invalid. "
            f"Check that SECRET_KEY is identical across all workers and has no "
            f"trailing whitespace or newline characters. "
            f"Inner error: {type(exc).__name__}: {exc}"
        ) from exc
