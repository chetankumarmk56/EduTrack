"""HTTP routes for the teacher private file library."""
from __future__ import annotations

from typing import List, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import RedirectResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import UserContext, get_current_user, require_teacher_strict
from app.schemas.uploaded_file import (
    DownloadLinkResponse,
    FileContentResponse,
    FileListResponse,
    FileMetadataUpdate,
    UploadedFileOut,
    UploadResponse,
)
from app.services.uploaded_file import (
    MAX_FILES_PER_REQUEST,
    uploaded_file_service,
)

router = APIRouter(prefix="/api/files", tags=["Teacher File Library"])


# ----------------------------------------------------------------------
# Upload (multi-file)
# ----------------------------------------------------------------------
@router.post(
    "/upload",
    response_model=UploadResponse,
    summary=f"Upload up to {MAX_FILES_PER_REQUEST} files at once",
)
async def upload_files(
    files: List[UploadFile] = File(...),
    subject: Optional[str] = Form(default=None),
    category: Optional[str] = Form(default=None),
    tags: Optional[str] = Form(default=None),  # comma-separated
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_teacher_strict),
):
    parsed_tags = [t.strip() for t in (tags or "").split(",") if t.strip()]
    return await uploaded_file_service.upload_many(
        db=db,
        user=user,
        files=files,
        subject=subject,
        category=category,
        tags=parsed_tags,
    )


# ----------------------------------------------------------------------
# Listing / search
# ----------------------------------------------------------------------
@router.get("/my-files", response_model=FileListResponse)
async def list_my_files(
    search: Optional[str] = Query(default=None),
    subject: Optional[str] = Query(default=None),
    tag: Optional[str] = Query(default=None),
    file_type: Optional[str] = Query(
        default=None,
        description="Filter by file_type, e.g. 'upload' or 'question_bank'.",
    ),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_teacher_strict),
):
    files, total = await uploaded_file_service.list_my_files(
        db=db,
        user=user,
        search=search,
        subject=subject,
        tag=tag,
        file_type=file_type,
        limit=limit,
        offset=offset,
    )
    return FileListResponse(files=files, total=total)


@router.get("/search", response_model=FileListResponse)
async def search_my_files(
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_teacher_strict),
):
    files, total = await uploaded_file_service.list_my_files(
        db=db, user=user, search=q, limit=limit
    )
    return FileListResponse(files=files, total=total)


# ----------------------------------------------------------------------
# Single file actions
# ----------------------------------------------------------------------
@router.get("/{file_id}", response_model=UploadedFileOut)
async def get_file(
    file_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_teacher_strict),
):
    return await uploaded_file_service.get_metadata(db, user, file_id)


@router.get(
    "/{file_id}/content",
    response_model=FileContentResponse,
    summary="Plain-text content for reuse in generator pages",
)
async def get_file_content(
    file_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_teacher_strict),
):
    row, text = await uploaded_file_service.get_content(db, user, file_id)
    return FileContentResponse(
        id=row.id,
        original_filename=row.original_filename,
        extraction_status=row.extraction_status,  # type: ignore[arg-type]
        content=text,
        chars=len(text),
    )


@router.get("/{file_id}/download-link", response_model=DownloadLinkResponse)
async def get_download_link(
    file_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_teacher_strict),
):
    """Return a short-lived signed S3 URL when available, otherwise tell the
    caller to stream from ``/files/{id}/download``."""
    row, url, _ = await uploaded_file_service.get_download(db, user, file_id)
    from app.core.config import settings

    if url is None:
        raise HTTPException(
            status_code=409,
            detail="This backend cannot issue presigned URLs; use /download instead.",
        )
    return DownloadLinkResponse(
        url=url, expires_in=settings.AWS_S3_PRESIGN_TTL, backend=row.storage_backend  # type: ignore[arg-type]
    )


@router.get(
    "/{file_id}/download",
    summary="Download / stream the file (handles both signed S3 and local backends)",
)
async def download_file(
    file_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_teacher_strict),
):
    row, url, data = await uploaded_file_service.get_download(db, user, file_id)
    if url is not None:
        return RedirectResponse(url=url, status_code=307)

    def _iter():
        yield data

    return StreamingResponse(
        _iter(),
        media_type=row.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{row.original_filename}"',
        },
    )


@router.patch("/{file_id}", response_model=UploadedFileOut)
async def update_metadata(
    file_id: int,
    patch: FileMetadataUpdate,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_teacher_strict),
):
    return await uploaded_file_service.update_metadata(db, user, file_id, patch)


@router.delete("/{file_id}", status_code=204)
async def delete_file(
    file_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_teacher_strict),
):
    await uploaded_file_service.soft_delete(db, user, file_id)
    return None


# Currently unused but reserved for future audit-trail / "I just used this file" hooks.
@router.post("/{file_id}/touch", response_model=UploadedFileOut)
async def touch_file(
    file_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_teacher_strict),
):
    """Mark a file as recently used (no-op for read access)."""
    out = await uploaded_file_service.get_metadata(db, user, file_id)
    return out
