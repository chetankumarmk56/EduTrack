"""Storage backend interface.

A backend is the *physical* place a file lives. The application code never
deals with S3 / local-disk specifics — it asks for upload/download/delete via
this interface and gets back an opaque ``storage_key``. The DB stores
``storage_backend`` + ``storage_key`` so we can recover the right adapter
even when the active default changes later.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import BinaryIO, Optional


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
        """Store ``data`` under ``key`` and return the canonical key used.

        Prefer ``upload_stream`` for user-uploaded content — it avoids
        materialising the whole payload in memory.
        """

    @abstractmethod
    async def upload_stream(
        self,
        *,
        key: str,
        fileobj: BinaryIO,
        content_type: str,
        content_length: Optional[int] = None,
    ) -> str:
        """
        Stream ``fileobj`` to storage under ``key`` without ever holding
        the full payload in memory.

        ``fileobj`` must be a seekable, blocking binary file (S3's
        ``upload_fileobj`` requires it). FastAPI's ``UploadFile.file`` is
        a ``SpooledTemporaryFile`` which qualifies.

        ``content_length`` is optional; backends may use it to pick an
        appropriate multipart chunk size or skip multipart for small files.
        """

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
