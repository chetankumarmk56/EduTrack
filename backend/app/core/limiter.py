"""
Rate limiting configuration for EduTrack API.
Prevents brute-force/credential-stuffing on auth endpoints.

Storage
-------
Backed by Redis when ``REDIS_URL`` is configured so the counter is shared
across uvicorn workers and replicas (the only safe configuration in
production). Falls back to in-memory when Redis is absent (dev only) —
with a warning logged at import time so misconfigured prod deploys are
obvious in the logs.
"""
import logging

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

logger = logging.getLogger(__name__)

# Per-endpoint limits. Tuned for the auth surface; mutations and reads use
# their own caps (or none) so we don't break legitimate batch flows.
RATE_LIMITS = {
    "auth_login": "5/minute",        # admin login
    "auth_refresh": "30/minute",     # SPA refresh on tab focus etc. — be a bit loose
    "auth_change_password": "3/minute",
    "teacher_login": "5/minute",
    "parent_login": "5/minute",
    "student_login": "5/minute",
}


def _build_limiter() -> Limiter:
    """
    Build the shared Limiter. Uses Redis when configured (multi-replica
    safe); falls back to in-memory and logs a warning otherwise.
    """
    redis_url = getattr(settings, "REDIS_URL", None)
    if redis_url:
        try:
            return Limiter(
                key_func=get_remote_address,
                storage_uri=redis_url,
                # If Redis goes down mid-flight, keep enforcing limits per
                # worker rather than disabling them entirely.
                in_memory_fallback_enabled=True,
                in_memory_fallback=[RATE_LIMITS["auth_login"]],
                headers_enabled=True,  # adds X-RateLimit-* response headers
            )
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "[limiter] failed to initialise Redis-backed limiter (%s); "
                "falling back to in-memory. Bruteforce protection will NOT "
                "be shared across workers/replicas.", exc,
            )

    if settings.ENVIRONMENT == "prod":
        logger.warning(
            "[limiter] REDIS_URL is not configured in production. "
            "Rate limits are per-worker only — set REDIS_URL to share counters across replicas."
        )
    return Limiter(key_func=get_remote_address, headers_enabled=True)


limiter = _build_limiter()
