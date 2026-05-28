"""
Shared upload service for announcement attachments, payment QR images,
parent payment screenshots, and generated receipt PDFs.

Production path: AWS S3 (private bucket). ``upload_file`` returns the
**S3 key** — callers persist that key in the DB and call
``resolve_url`` at read time to mint a short-lived presigned URL.

Dev fallback: ``static/uploads/<filename>`` on the local disk, returned
as the path string ``/static/uploads/<filename>``. Only allowed when
``ENVIRONMENT != "prod"`` — config.py blocks startup in prod without S3,
and we double-guard here so a runtime config drift can't sneak a local
write past us.

Legacy compatibility: rows written before this refactor still contain
full Cloudinary URLs (``https://res.cloudinary.com/...``). ``resolve_url``
passes any ``http(s)://`` value through unchanged so those keep working
until the rows age out / are deleted.
"""
import datetime
import os
import uuid
from typing import Optional

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings
from app.core.logger import logger
from app.services.storage.s3_backend import S3StorageBackend


def _s3_configured() -> bool:
    return bool(
        settings.AWS_S3_BUCKET
        and settings.AWS_S3_REGION
        and settings.AWS_ACCESS_KEY_ID
        and settings.AWS_SECRET_ACCESS_KEY
    )


class StorageService:
    # All common file types teachers / parents / admins might share
    ALLOWED_EXTENSIONS = {
        # Images
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg",
        # Documents
        ".pdf", ".doc", ".docx", ".xls", ".xlsx",
        ".ppt", ".pptx", ".txt", ".csv", ".rtf",
        # Video / Audio (short clips)
        ".mp4", ".mov", ".avi", ".mp3", ".m4a",
    }
    MAX_SIZE = 25 * 1024 * 1024  # 25 MB
    # Prefix every key with this so S3 lifecycle rules / IAM policies can
    # scope cleanly to shared uploads vs the teacher file library.
    KEY_PREFIX = "shared-uploads"

    def __init__(self):
        self.upload_dir = os.path.join(os.getcwd(), "static", "uploads")
        if settings.ENVIRONMENT != "prod":
            os.makedirs(self.upload_dir, exist_ok=True)

        self._s3: Optional[S3StorageBackend] = None
        if _s3_configured():
            try:
                self._s3 = S3StorageBackend()
                logger.info(
                    "Shared upload storage: AWS S3 (bucket=%s, prefix=%s/).",
                    settings.AWS_S3_BUCKET, self.KEY_PREFIX,
                )
            except Exception as e:
                logger.error(f"S3 init error for shared uploads: {e}")
                self._s3 = None

    # ──────────────────────────────────────────────────────────────────────
    def _safe_unique_name(self, filename: Optional[str]) -> str:
        """
        Build a server-controlled, collision-free object name.

        Prepending a random UUID prevents a parent from guessing another
        parent's payment-screenshot URL by knowing the upload time —
        important now that all four flows are private+presigned.
        """
        base = os.path.basename(filename or "upload")
        return f"{int(datetime.datetime.now().timestamp())}_{uuid.uuid4().hex[:12]}_{base}"

    async def upload_file(self, file: UploadFile) -> str:
        """
        Upload a file and return a persistable identifier.

        Returns:
          * prod / S3 configured: the S3 key (e.g. ``shared-uploads/...``)
          * dev fallback: the local path ``/static/uploads/<filename>``

        Callers store the returned string in the DB. Use ``resolve_url``
        when rendering responses to the client.
        """
        # 1. Validate extension
        ext = os.path.splitext(file.filename or "")[1].lower()
        if ext not in self.ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file type '{ext}'. "
                       f"Allowed: images, PDF, Word, Excel, PowerPoint, text, video/audio files.",
            )

        # 2. Read & size-check
        try:
            contents = await file.read()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"File read error: {e}")

        if len(contents) > self.MAX_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File too large. Maximum size is 25 MB.",
            )

        unique_name = self._safe_unique_name(file.filename)

        # 3. Production path: S3 required.
        if settings.ENVIRONMENT == "prod":
            if self._s3 is None:
                # Defense-in-depth: config startup check should have caught this.
                logger.error(
                    "S3 not initialised in production. "
                    "Refusing to write upload to ephemeral local disk."
                )
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=(
                        "File storage is not available right now. "
                        "Please try again or contact support."
                    ),
                )
            key = f"{self.KEY_PREFIX}/{unique_name}"
            try:
                await self._s3.upload(
                    key=key,
                    data=contents,
                    content_type=file.content_type or "application/octet-stream",
                )
                logger.info("S3 upload success: key=%s size=%d", key, len(contents))
                return key
            except Exception as e:
                logger.exception("S3 upload failed in production: %s", e)
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="The file storage provider rejected the upload. Please try again.",
                )

        # 4. Dev / test path. Prefer S3 if configured, else local disk.
        if self._s3 is not None:
            key = f"{self.KEY_PREFIX}/{unique_name}"
            try:
                await self._s3.upload(
                    key=key,
                    data=contents,
                    content_type=file.content_type or "application/octet-stream",
                )
                logger.info("S3 upload success (dev): key=%s", key)
                return key
            except Exception as e:
                logger.warning(f"S3 upload failed in dev, falling back to disk: {e}")

        file_path = os.path.join(self.upload_dir, unique_name)
        try:
            with open(file_path, "wb") as f:
                f.write(contents)
            logger.warning(
                "[dev] File saved to ./static/uploads — ephemeral. "
                "Set AWS_S3_* credentials to use the real storage path."
            )
            return f"/static/uploads/{unique_name}"
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Storage error: {e}")

    # ──────────────────────────────────────────────────────────────────────
    async def resolve_url(
        self,
        stored: Optional[str],
        *,
        filename: Optional[str] = None,
        expires_in: Optional[int] = None,
    ) -> Optional[str]:
        """
        Turn a DB-stored upload identifier into a URL the client can fetch.

        * ``None`` / empty → ``None``
        * Anything starting with ``http://`` or ``https://`` → passthrough
          (legacy Cloudinary URLs, or any other absolute URL).
        * Anything starting with ``/static/`` → passthrough (dev disk).
        * Otherwise treat as an S3 key and mint a presigned URL with
          ``AWS_S3_PRESIGN_TTL`` (default 1 hour) unless overridden.

        ``filename`` forces a ``Content-Disposition`` so downloads keep
        the original name; useful for receipt PDFs.
        """
        if not stored:
            return None
        if stored.startswith("http://") or stored.startswith("https://"):
            return stored
        if stored.startswith("/static/"):
            return stored
        # S3 key path. If S3 isn't configured (dev without creds), return
        # the raw key — better than a broken URL, and the dev path
        # already logged a loud warning at upload time.
        if self._s3 is None:
            logger.warning(
                "resolve_url called with S3 key but S3 backend is not configured: %s",
                stored,
            )
            return stored
        ttl = expires_in if expires_in is not None else settings.AWS_S3_PRESIGN_TTL
        try:
            return await self._s3.signed_url(stored, filename=filename, expires_in=ttl)
        except Exception as e:
            logger.warning("Presign failed for key=%s: %s", stored, e)
            return None

    # ──────────────────────────────────────────────────────────────────────
    async def verify_file_exists(self, file_url: str) -> bool:
        """Best-effort reachability check, used by tests and admin tooling."""
        if not file_url:
            return False

        # Absolute URL — HEAD it.
        if file_url.startswith("https://") or file_url.startswith("http://"):
            try:
                import httpx
                async with httpx.AsyncClient(timeout=5.0) as client:
                    response = await client.head(file_url, follow_redirects=True)
                    return response.status_code < 400
            except Exception as e:
                logger.warning(f"File verify failed: {file_url} — {e}")
                return False

        # Local dev path.
        if file_url.startswith("/static/uploads/"):
            file_path = os.path.join(os.getcwd(), file_url.lstrip("/"))
            return os.path.exists(file_path)

        # Treat as S3 key — check via the backend's signed_url (cheap HEAD
        # is not exposed; existence is implied if presign succeeds).
        if self._s3 is not None:
            try:
                url = await self._s3.signed_url(file_url, expires_in=60)
                return bool(url)
            except Exception:
                return False

        return False


storage_service = StorageService()
