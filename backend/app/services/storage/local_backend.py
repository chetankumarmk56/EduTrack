"""Local-disk storage backend (dev / fallback).

Writes files to ``./static/private_uploads/`` outside the publicly served
``static/uploads`` tree so the operating-system filesystem permissions remain
the only access control. Downloads are streamed through the authenticated
API route — there is no public URL.
"""
from __future__ import annotations

import asyncio
import os
from typing import BinaryIO, Optional

from app.core.logger import logger
from app.services.storage.base import FileStorageBackend

_ROOT = os.path.join(os.getcwd(), "static", "private_uploads")


class LocalStorageBackend(FileStorageBackend):
    name = "local"

    def __init__(self, root: str = _ROOT) -> None:
        self.root = root
        os.makedirs(self.root, exist_ok=True)

    def _resolve(self, key: str) -> str:
        # Defence-in-depth: prevent any '..' / absolute-path injection.
        safe_key = key.lstrip("/\\").replace("..", "_")
        return os.path.join(self.root, safe_key)

    async def upload(self, *, key: str, data: bytes, content_type: str) -> str:
        path = self._resolve(key)
        os.makedirs(os.path.dirname(path), exist_ok=True)

        def _write() -> None:
            with open(path, "wb") as fh:
                fh.write(data)

        await asyncio.to_thread(_write)
        return key

    async def upload_stream(
        self,
        *,
        key: str,
        fileobj: BinaryIO,
        content_type: str,
        content_length: Optional[int] = None,
    ) -> str:
        """Copy ``fileobj`` to disk in chunks, mirroring the S3 backend's
        streaming contract so callers can switch backends without touching
        upload code."""
        path = self._resolve(key)
        os.makedirs(os.path.dirname(path), exist_ok=True)

        try:
            fileobj.seek(0)
        except Exception:  # noqa: BLE001
            pass

        def _copy() -> None:
            # 1 MiB chunks. Big enough that we're not paying per-syscall
            # overhead on a 25 MB upload, small enough that we don't pin
            # huge buffers per concurrent request.
            chunk_size = 1024 * 1024
            with open(path, "wb") as fh:
                while True:
                    buf = fileobj.read(chunk_size)
                    if not buf:
                        return
                    fh.write(buf)

        await asyncio.to_thread(_copy)
        return key

    async def download(self, key: str) -> bytes:
        path = self._resolve(key)

        def _read() -> bytes:
            with open(path, "rb") as fh:
                return fh.read()

        return await asyncio.to_thread(_read)

    async def delete(self, key: str) -> None:
        path = self._resolve(key)
        try:
            await asyncio.to_thread(os.remove, path)
        except FileNotFoundError:
            return
        except Exception as exc:  # noqa: BLE001
            logger.warning("Local delete failed for %s: %s", key, exc)

    async def signed_url(
        self,
        key: str,
        *,
        filename: Optional[str] = None,
        expires_in: int = 900,
    ) -> Optional[str]:
        # Local files are private; callers must stream via the API.
        return None
