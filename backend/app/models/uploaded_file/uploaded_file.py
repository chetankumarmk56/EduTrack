"""SQLAlchemy model for the teacher file library.

Files are physically stored in a pluggable backend (S3 in prod, local disk in
dev). This table is the canonical record: ownership, soft-delete, metadata,
and optionally the extracted plain text for reuse in the question-bank and
lesson-plan generators.
"""
from __future__ import annotations

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base
from app.models.core import TimestampMixin


class UploadedFile(Base, TimestampMixin):
    """A file uploaded by a teacher into their private library."""

    __tablename__ = "uploaded_files"

    id = Column(Integer, primary_key=True, index=True)

    # Ownership — teacher_id, NOT user_id, so admin/parent uploads cannot
    # collide with this library. Institution scoping for future tenancy.
    teacher_id = Column(
        Integer, ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    institution_id = Column(
        Integer, ForeignKey("institutions.id"), nullable=False, index=True
    )

    # Physical storage
    storage_backend = Column(String(16), nullable=False, default="s3")  # "s3" | "local"
    storage_key = Column(String(512), nullable=False)

    # Display metadata
    original_filename = Column(String(255), nullable=False)
    mime_type = Column(String(128), nullable=False, default="application/octet-stream")
    file_size = Column(Integer, nullable=False)

    # Reuse / search
    extracted_text = Column(Text, nullable=True)
    extraction_status = Column(String(16), nullable=False, default="pending")
    # one of: pending | done | failed | skipped

    tags = Column(JSON, nullable=False, default=list)
    subject = Column(String(120), nullable=True)
    category = Column(String(64), nullable=True)

    uploaded_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    last_used_at = Column(DateTime(timezone=True), nullable=True)

    # Soft delete
    is_deleted = Column(Boolean, nullable=False, default=False, index=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    teacher = relationship("Teacher")
    institution = relationship("Institution")

    __table_args__ = (
        Index("ix_uploaded_files_owner_active", "teacher_id", "is_deleted"),
        Index("ix_uploaded_files_uploaded_at", "uploaded_at"),
    )
