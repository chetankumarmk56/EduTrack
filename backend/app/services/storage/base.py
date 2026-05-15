"""Storage backend interface.

A backend is the *physical* place a file lives. The application code never
deals with S3 / local-disk specifics — it asks for upload/download/delete via
this interface and gets back an opaque ``storage_key``. The DB stores
``storage_backend`` + ``storage_key`` so we can recover the right adapter
even when the active default changes later.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional


class FileStorageBackend(ABC):
    """Abstract base class for binary blob storage."""

    name: str  # short identifier, persisted in ``UploadedFile.storage_backend``

    @abstractmethod
    async def upload(
        self,
        *,
        key: str,
        data: bytes,
        content_type: str,
    ) -> str:
        """Store ``data`` under ``key`` and return the canonical key used."""

    @abstractmethod
    async def download(self, key: str) -> bytes:
        """Fetch the bytes for ``key``."""

    @abstractmethod
    async def delete(self, key: str) -> None:
        """Best-effort delete. Must not raise on a missing key."""

    @abstractmethod
    async def signed_url(
        self,
        key: str,
        *,
        filename: Optional[str] = None,
        expires_in: int = 900,
    ) -> Optional[str]:
        """Return a time-limited download URL, or ``None`` if the backend
        cannot produce one (callers must then stream via the API)."""
