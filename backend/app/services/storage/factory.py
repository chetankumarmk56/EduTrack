"""Storage backend factory.

Picks the right adapter at runtime:

* When AWS S3 credentials + bucket are present in env, S3 is the default.
* Otherwise the local-disk backend is used (dev convenience).

For an *already stored* file, ``get_backend_for(name)`` looks up the adapter
that owns that record so we keep working even if the default changes later.
"""
from __future__ import annotations

from functools import lru_cache

from app.core.config import settings
from app.core.logger import logger
from app.services.storage.base import FileStorageBackend
from app.services.storage.local_backend import LocalStorageBackend
from app.services.storage.s3_backend import S3StorageBackend


def _s3_configured() -> bool:
    return bool(
        settings.AWS_S3_BUCKET
        and settings.AWS_S3_REGION
        and settings.AWS_ACCESS_KEY_ID
        and settings.AWS_SECRET_ACCESS_KEY
    )


@lru_cache(maxsize=1)
def get_default_backend() -> FileStorageBackend:
    """
    Return the backend new uploads should land in.

    Production hardening: refuse to hand back the local-disk backend when
    ``ENVIRONMENT == "prod"`` even though config.py already blocks startup
    in that case. Two reasons:

      * Defense-in-depth — a future config drift (e.g. a runtime setting
        flip) can't sneak a local write past us.
      * Tests that mock settings with `ENVIRONMENT=prod` exercise the same
        guard, so the regression is impossible to ship.
    """
    if _s3_configured():
        logger.info("File library: using AWS S3 backend (bucket=%s).", settings.AWS_S3_BUCKET)
        return S3StorageBackend()
    if settings.ENVIRONMENT == "prod":
        raise RuntimeError(
            "File library has no remote backend configured in production. "
            "Set AWS_S3_BUCKET + AWS_S3_REGION + AWS_ACCESS_KEY_ID + "
            "AWS_SECRET_ACCESS_KEY. Local-disk fallback is disabled in prod "
            "because container disks are ephemeral and not shared across replicas."
        )
    logger.info("File library: using local-disk backend (dev only).")
    return LocalStorageBackend()


@lru_cache(maxsize=4)
def get_backend_for(name: str) -> FileStorageBackend:
    """Return the adapter that owns a previously-stored record."""
    if name == "s3":
        return S3StorageBackend()
    if name == "local":
        return LocalStorageBackend()
    raise ValueError(f"Unknown storage backend '{name}'.")
