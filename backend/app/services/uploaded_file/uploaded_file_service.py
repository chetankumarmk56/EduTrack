"""Teacher file library — orchestration service.

Sits between the route layer and the storage adapter:

* Validates uploads (size, type, count).
* Generates date-partitioned storage keys with teacher ownership in the path.
* Persists metadata in ``uploaded_files`` while the binary lives in the
  active storage backend.
* Extracts plain text on upload (best-effort) so the question-bank and
  lesson-plan generators can reuse the file with zero extra parsing.
* Enforces strict ownership checks — every read / download / delete is
  scoped to the calling teacher.
"""
from __future__ import annotations

import datetime as dt
import mimetypes
import re
import uuid
from typing import List, Optional, Tuple

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import UserContext
from app.core.logger import logger
from app.models.directory import Teacher
from app.models.uploaded_file import UploadedFile
from app.schemas.uploaded_file import (
    FileMetadataUpdate,
    UploadedFileOut,
    UploadResponse,
    UploadResultItem,
)
from app.services.file_parsing import SUPPORTED_SUFFIXES, extract_text, suffix_of
from app.services.storage.base import FileStorageBackend
from app.services.storage.factory import get_backend_for, get_default_backend

# ----------------------------------------------------------------------
# Tunables
# ----------------------------------------------------------------------
MAX_FILES_PER_REQUEST = 9
MAX_FILE_BYTES = 25 * 1024 * 1024  # 25 MB
MAX_EXTRACTED_TEXT_CHARS = 200_000  # cap DB row size
ALLOWED_SUFFIXES = SUPPORTED_SUFFIXES  # pdf, docx, txt, md

# ----------------------------------------------------------------------


def _safe_filename(name: str) -> str:
    base = name.strip().replace("\\", "_").replace("/", "_")
    base = re.sub(r"[^A-Za-z0-9._\- ]+", "_", base)[:200]
    return base or "file"


def _to_out(row: UploadedFile) -> UploadedFileOut:
    return UploadedFileOut(
        id=row.id,
        original_filename=row.original_filename,
        mime_type=row.mime_type,
        file_size=row.file_size,
        subject=row.subject,
        category=row.category,
        tags=list(row.tags or []),
        uploaded_at=row.uploaded_at,
        last_used_at=row.last_used_at,
        extraction_status=row.extraction_status,  # type: ignore[arg-type]
        has_text=bool(row.extracted_text),
    )


class UploadedFileService:
    # ------------------------------------------------------------------
    # Ownership lookup
    # ------------------------------------------------------------------
    async def _resolve_teacher_id(
        self, db: AsyncSession, user: UserContext
    ) -> int:
        if user.role not in ("teacher", "admin", "super_admin"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only teachers can use the file library.",
            )
        if user.role == "teacher":
            res = await db.execute(
                select(Teacher.id).where(Teacher.user_id == user.id)
            )
            teacher_id = res.scalar_one_or_none()
            if teacher_id is None:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Teacher profile not found for the current user.",
                )
            return teacher_id
        # admin / super_admin acting on behalf of themselves — admins have no
        # teacher profile, so they cannot upload here. Front-end hides this
        # surface for non-teachers.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin accounts do not own a teacher file library.",
        )

    async def _get_owned(
        self, db: AsyncSession, file_id: int, teacher_id: int
    ) -> UploadedFile:
        res = await db.execute(
            select(UploadedFile).where(
                UploadedFile.id == file_id,
                UploadedFile.teacher_id == teacher_id,
                UploadedFile.is_deleted.is_(False),
            )
        )
        row = res.scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")
        return row

    # ------------------------------------------------------------------
    # Upload
    # ------------------------------------------------------------------
    async def upload_many(
        self,
        db: AsyncSession,
        user: UserContext,
        files: List[UploadFile],
        subject: Optional[str],
        category: Optional[str],
        tags: List[str],
    ) -> UploadResponse:
        if not files:
            raise HTTPException(status_code=400, detail="No files were provided.")
        if len(files) > MAX_FILES_PER_REQUEST:
            raise HTTPException(
                status_code=400,
                detail=f"You can upload at most {MAX_FILES_PER_REQUEST} files at a time "
                f"(received {len(files)}).",
            )

        teacher_id = await self._resolve_teacher_id(db, user)
        backend = get_default_backend()

        accepted: List[UploadResultItem] = []
        rejected: List[UploadResultItem] = []

        for f in files:
            try:
                row = await self._upload_one(
                    db=db,
                    backend=backend,
                    teacher_id=teacher_id,
                    institution_id=user.institution_id,
                    upload=f,
                    subject=subject,
                    category=category,
                    tags=tags,
                )
                accepted.append(UploadResultItem(filename=f.filename or "file", ok=True, file=_to_out(row)))
            except HTTPException as exc:
                rejected.append(
                    UploadResultItem(
                        filename=f.filename or "file",
                        ok=False,
                        error=str(exc.detail),
                    )
                )
            except Exception as exc:  # noqa: BLE001
                logger.exception("Upload failed for %s: %s", f.filename, exc)
                rejected.append(
                    UploadResultItem(
                        filename=f.filename or "file",
                        ok=False,
                        error="Upload failed due to a server error.",
                    )
                )

        await db.commit()
        return UploadResponse(
            accepted=accepted,
            rejected=rejected,
            summary={
                "received": len(files),
                "accepted": len(accepted),
                "rejected": len(rejected),
            },
        )

    async def _upload_one(
        self,
        *,
        db: AsyncSession,
        backend: FileStorageBackend,
        teacher_id: int,
        institution_id: int,
        upload: UploadFile,
        subject: Optional[str],
        category: Optional[str],
        tags: List[str],
    ) -> UploadedFile:
        filename = upload.filename or "file"
        suffix = suffix_of(filename)
        if suffix not in ALLOWED_SUFFIXES:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type '.{suffix}'. Allowed: "
                f"{', '.join(sorted(ALLOWED_SUFFIXES))}.",
            )

        data = await upload.read()
        if not data:
            raise HTTPException(status_code=400, detail="File is empty.")
        if len(data) > MAX_FILE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"File too large (max {MAX_FILE_BYTES // (1024 * 1024)} MB).",
            )

        mime_type = (
            upload.content_type
            or mimetypes.guess_type(filename)[0]
            or "application/octet-stream"
        )

        now = dt.datetime.utcnow()
        unique = uuid.uuid4().hex[:12]
        safe_name = _safe_filename(filename)
        storage_key = (
            f"{now.year}/{now.month:02d}/{now.day:02d}/"
            f"teacher_{teacher_id}/{unique}_{safe_name}"
        )

        # Push to backend FIRST. If this fails the DB stays untouched.
        await backend.upload(key=storage_key, data=data, content_type=mime_type)

        # Best-effort text extraction (synchronous; files are small).
        extracted: Optional[str] = None
        extraction_status = "skipped"
        try:
            text = extract_text(filename, data)
            extracted = text[:MAX_EXTRACTED_TEXT_CHARS]
            extraction_status = "done"
        except ValueError as exc:
            logger.info("Text extraction skipped for %s: %s", filename, exc)
            extraction_status = "failed"

        row = UploadedFile(
            teacher_id=teacher_id,
            institution_id=institution_id,
            storage_backend=backend.name,
            storage_key=storage_key,
            original_filename=safe_name,
            mime_type=mime_type,
            file_size=len(data),
            extracted_text=extracted,
            extraction_status=extraction_status,
            tags=tags or [],
            subject=subject,
            category=category,
        )
        db.add(row)
        await db.flush()  # populate row.id
        return row

    # ------------------------------------------------------------------
    # Listing / search
    # ------------------------------------------------------------------
    async def list_my_files(
        self,
        db: AsyncSession,
        user: UserContext,
        *,
        search: Optional[str] = None,
        subject: Optional[str] = None,
        tag: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[UploadedFileOut], int]:
        teacher_id = await self._resolve_teacher_id(db, user)

        base = select(UploadedFile).where(
            UploadedFile.teacher_id == teacher_id,
            UploadedFile.is_deleted.is_(False),
        )
        if search:
            like = f"%{search.lower()}%"
            base = base.where(
                or_(
                    func.lower(UploadedFile.original_filename).like(like),
                    func.lower(UploadedFile.subject).like(like),
                )
            )
        if subject:
            base = base.where(UploadedFile.subject == subject)
        if tag:
            # JSON contains a string element; portable form: cast to text and LIKE
            base = base.where(func.cast(UploadedFile.tags, str).like(f'%"{tag}"%'))

        total_res = await db.execute(
            select(func.count()).select_from(base.subquery())
        )
        total = total_res.scalar_one()

        page = (
            base.order_by(desc(UploadedFile.uploaded_at))
            .offset(max(0, offset))
            .limit(max(1, min(200, limit)))
        )
        rows = (await db.execute(page)).scalars().all()
        return [_to_out(r) for r in rows], int(total)

    # ------------------------------------------------------------------
    # Single-file actions
    # ------------------------------------------------------------------
    async def get_metadata(
        self, db: AsyncSession, user: UserContext, file_id: int
    ) -> UploadedFileOut:
        teacher_id = await self._resolve_teacher_id(db, user)
        row = await self._get_owned(db, file_id, teacher_id)
        return _to_out(row)

    async def get_content(
        self, db: AsyncSession, user: UserContext, file_id: int
    ) -> Tuple[UploadedFile, str]:
        """Return (row, plain_text) for reuse in generator flows."""
        teacher_id = await self._resolve_teacher_id(db, user)
        row = await self._get_owned(db, file_id, teacher_id)

        text = row.extracted_text or ""
        if not text:
            # Try a late extraction (e.g. earlier upload failed).
            try:
                backend = get_backend_for(row.storage_backend)
                data = await backend.download(row.storage_key)
                text = extract_text(row.original_filename, data)[
                    :MAX_EXTRACTED_TEXT_CHARS
                ]
                row.extracted_text = text
                row.extraction_status = "done"
            except Exception as exc:  # noqa: BLE001
                logger.warning("Late extraction failed for file %s: %s", file_id, exc)
                row.extraction_status = "failed"

        row.last_used_at = dt.datetime.utcnow()
        await db.commit()
        await db.refresh(row)
        return row, text

    async def get_download(
        self, db: AsyncSession, user: UserContext, file_id: int
    ) -> Tuple[UploadedFile, Optional[str], bytes]:
        """Return (row, signed_url_or_None, raw_bytes_if_local).

        Routes use the signed URL when present (S3) and stream the bytes when
        ``None`` (local backend).
        """
        teacher_id = await self._resolve_teacher_id(db, user)
        row = await self._get_owned(db, file_id, teacher_id)
        backend = get_backend_for(row.storage_backend)
        url = await backend.signed_url(
            row.storage_key,
            filename=row.original_filename,
            expires_in=settings.AWS_S3_PRESIGN_TTL,
        )
        if url is not None:
            row.last_used_at = dt.datetime.utcnow()
            await db.commit()
            return row, url, b""

        data = await backend.download(row.storage_key)
        row.last_used_at = dt.datetime.utcnow()
        await db.commit()
        return row, None, data

    async def update_metadata(
        self,
        db: AsyncSession,
        user: UserContext,
        file_id: int,
        patch: FileMetadataUpdate,
    ) -> UploadedFileOut:
        teacher_id = await self._resolve_teacher_id(db, user)
        row = await self._get_owned(db, file_id, teacher_id)
        if patch.subject is not None:
            row.subject = patch.subject or None
        if patch.category is not None:
            row.category = patch.category or None
        if patch.tags is not None:
            row.tags = patch.tags
        await db.commit()
        await db.refresh(row)
        return _to_out(row)

    async def soft_delete(
        self, db: AsyncSession, user: UserContext, file_id: int
    ) -> None:
        teacher_id = await self._resolve_teacher_id(db, user)
        row = await self._get_owned(db, file_id, teacher_id)
        row.is_deleted = True
        row.deleted_at = dt.datetime.utcnow()
        await db.commit()

        # Best-effort physical delete. We swallow errors so the DB row stays
        # marked deleted even if the object store is temporarily unreachable.
        try:
            backend = get_backend_for(row.storage_backend)
            await backend.delete(row.storage_key)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Soft-deleted file %s but object cleanup failed: %s", file_id, exc
            )


uploaded_file_service = UploadedFileService()
