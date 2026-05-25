"""
Announcement / teacher-shared file storage.

Production path: Cloudinary (signed URLs returned to the client).
Dev fallback: ``static/uploads/`` on the local disk — only allowed when
``ENVIRONMENT != "prod"``. In production the absence of Cloudinary
credentials would already have been caught by ``app.core.config``'s
startup check, but we double-guard here so a config drift can't sneak a
local write past us.

Why two guards: the config check is one-shot at process start. If
someone clears Cloudinary creds at runtime (e.g. a secret rotation
that doesn't restart the process), the second guard kicks in.
"""
import os
import asyncio
import datetime
from fastapi import UploadFile, HTTPException, status
from app.core.config import settings
from app.core.logger import logger

# ─── Cloudinary ───────────────────────────────────────────────────────────────
try:
    import cloudinary
    import cloudinary.uploader
    CLOUDINARY_AVAILABLE = True
except ImportError:
    CLOUDINARY_AVAILABLE = False


class StorageService:
    # All common file types teachers might share
    ALLOWED_EXTENSIONS = {
        # Images
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg",
        # Documents
        ".pdf", ".doc", ".docx", ".xls", ".xlsx",
        ".ppt", ".pptx", ".txt", ".csv", ".rtf",
        # Video / Audio (short clips)
        ".mp4", ".mov", ".avi", ".mp3", ".m4a",
    }
    MAX_SIZE = 25 * 1024 * 1024  # 25 MB (Cloudinary free tier limit)

    def __init__(self):
        # Local-disk dir only used in dev. Creating the directory is cheap
        # and avoids a race when multiple tests start up in parallel.
        self.upload_dir = os.path.join(os.getcwd(), "static", "uploads")
        if settings.ENVIRONMENT != "prod":
            os.makedirs(self.upload_dir, exist_ok=True)

        # ── Cloudinary init ────────────────────────────────────────────────
        self._cloudinary_ready = False
        if (
            CLOUDINARY_AVAILABLE
            and settings.CLOUDINARY_CLOUD_NAME
            and settings.CLOUDINARY_API_KEY
            and settings.CLOUDINARY_API_SECRET
        ):
            try:
                cloudinary.config(
                    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
                    api_key=settings.CLOUDINARY_API_KEY,
                    api_secret=settings.CLOUDINARY_API_SECRET,
                    secure=True,
                )
                self._cloudinary_ready = True
                logger.info("Cloudinary storage initialized.")
            except Exception as e:
                logger.error(f"Cloudinary init error: {e}")

    # ──────────────────────────────────────────────────────────────────────────
    async def upload_file(self, file: UploadFile) -> str:
        """
        Upload a file and return a permanent URL.

        Behaviour by environment:
          * prod:  Cloudinary required. Failure surfaces as 5xx so the
                   client retries rather than ending up with a 404'd
                   ``/static/uploads/...`` URL after the next redeploy.
          * dev:   Try Cloudinary first if configured, else write locally.
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

        unique_name = f"{int(datetime.datetime.now().timestamp())}_{file.filename}"

        # 3. Production path: Cloudinary required.
        if settings.ENVIRONMENT == "prod":
            if not self._cloudinary_ready:
                # Defense-in-depth: config startup check should have caught this.
                logger.error(
                    "Cloudinary not initialised in production. "
                    "Refusing to write upload to ephemeral local disk."
                )
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=(
                        "File storage is not available right now. "
                        "Please try again or contact support."
                    ),
                )
            try:
                result = await asyncio.to_thread(
                    cloudinary.uploader.upload,
                    contents,
                    public_id=f"edutrack/announcements/{unique_name}",
                    resource_type="auto",
                    overwrite=True,
                )
                url = result.get("secure_url", "")
                if not url:
                    raise RuntimeError("Cloudinary returned no secure_url")
                logger.info(f"Cloudinary upload success: {url}")
                return url
            except Exception as e:
                logger.exception("Cloudinary upload failed in production: %s", e)
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="The file storage provider rejected the upload. Please try again.",
                )

        # 4. Dev / test path. Use Cloudinary if it happens to be configured;
        #    otherwise fall back to local disk. Loud log so nobody mistakes
        #    a working dev flow for a working prod flow.
        if self._cloudinary_ready:
            try:
                result = await asyncio.to_thread(
                    cloudinary.uploader.upload,
                    contents,
                    public_id=f"edutrack/announcements/{unique_name}",
                    resource_type="auto",
                    overwrite=True,
                )
                url = result.get("secure_url", "")
                if url:
                    logger.info(f"Cloudinary upload success (dev): {url}")
                    return url
            except Exception as e:
                logger.warning(f"Cloudinary upload failed in dev, falling back to disk: {e}")

        file_path = os.path.join(self.upload_dir, unique_name)
        try:
            with open(file_path, "wb") as f:
                f.write(contents)
            logger.warning(
                "[dev] File saved to ./static/uploads — ephemeral. "
                "Set Cloudinary credentials to use the real storage path."
            )
            return f"/static/uploads/{unique_name}"
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Storage error: {e}")

    # ──────────────────────────────────────────────────────────────────────────
    async def verify_file_exists(self, file_url: str) -> bool:
        """Verify a file URL is reachable."""
        if not file_url:
            return False

        # Cloudinary URLs — trust them implicitly (already verified on upload)
        if "cloudinary.com" in file_url:
            return True

        # Any other HTTPS URL — do a HEAD check
        if file_url.startswith("https://") or file_url.startswith("http://"):
            try:
                import httpx
                async with httpx.AsyncClient(timeout=5.0) as client:
                    response = await client.head(file_url, follow_redirects=True)
                    return response.status_code < 400
            except Exception as e:
                logger.warning(f"File verify failed: {file_url} — {e}")
                return False

        # Local path (dev only — see upload_file).
        if file_url.startswith("/static/uploads/"):
            file_path = os.path.join(os.getcwd(), file_url.lstrip("/"))
            return os.path.exists(file_path)

        return False


storage_service = StorageService()
