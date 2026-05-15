"""Pydantic schemas for the teacher file library."""
from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

ExtractionStatus = Literal["pending", "done", "failed", "skipped"]


class UploadedFileOut(BaseModel):
    """Public-facing representation of a stored file."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    original_filename: str
    mime_type: str
    file_size: int
    subject: Optional[str] = None
    category: Optional[str] = None
    tags: List[str] = []
    uploaded_at: datetime
    last_used_at: Optional[datetime] = None
    extraction_status: ExtractionStatus
    has_text: bool = False


class UploadResultItem(BaseModel):
    """Per-file result inside a multi-file upload response."""

    filename: str
    ok: bool
    file: Optional[UploadedFileOut] = None
    error: Optional[str] = None


class UploadResponse(BaseModel):
    accepted: List[UploadResultItem]
    rejected: List[UploadResultItem]
    summary: dict


class FileListResponse(BaseModel):
    files: List[UploadedFileOut]
    total: int


class FileMetadataUpdate(BaseModel):
    subject: Optional[str] = Field(default=None, max_length=120)
    category: Optional[str] = Field(default=None, max_length=64)
    tags: Optional[List[str]] = None


class FileContentResponse(BaseModel):
    """Returned when a generator wants the extracted plain text."""

    id: int
    original_filename: str
    extraction_status: ExtractionStatus
    content: str
    chars: int


class DownloadLinkResponse(BaseModel):
    url: str
    expires_in: int
    backend: Literal["s3", "local"]
