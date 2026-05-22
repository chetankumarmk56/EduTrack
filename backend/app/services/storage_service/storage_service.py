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
        # Local fallback directory
        self.upload_dir = os.path.join(os.getcwd(), "static", "uploads")
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
                logger.info("☁️  Cloudinary storage initialized successfully.")
            except Exception as e:
                logger.error(f"Cloudinary init error: {e}")

    # ──────────────────────────────────────────────────────────────────────────
    async def upload_file(self, file: UploadFile) -> str:
        """
        Upload a file and return a permanent public URL.
        Priority: Cloudinary → Local (ephemeral, dev-only)
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

        # 3. Cloudinary upload (preferred)
        if self._cloudinary_ready:
            try:
                result = await asyncio.to_thread(
                    cloudinary.uploader.upload,
                    contents,
                    public_id=f"edutrack/announcements/{unique_name}",
                    resource_type="auto",   # handles images, PDFs, videos, docs
                    overwrite=True,
                )
                url = result.get("secure_url", "")
                logger.info(f"☁️  Cloudinary upload success: {url}")
                return url
            except Exception as e:
                logger.warning(f"Cloudinary upload failed, trying fallback: {e}")

        # 4. Local storage (dev/fallback — ephemeral on Render free tier)
        file_path = os.path.join(self.upload_dir, unique_name)
        try:
            with open(file_path, "wb") as f:
                f.write(contents)
            logger.warning("⚠️  File saved locally — will NOT persist across Render redeploys.")
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

        # Local path
        if file_url.startswith("/static/uploads/"):
            file_path = os.path.join(os.getcwd(), file_url.lstrip("/"))
            return os.path.exists(file_path)

        return False


storage_service = StorageService()
