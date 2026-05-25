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
    """A file uploaded by a teacher into their private library.

    The same table also acts as the "My Files" listing for AI-generated
    artifacts (e.g. Question Banks). For generated rows:

    * ``file_type`` is the generator name (``question_bank``) instead of
      the default ``upload``;
    * ``display_name`` carries the human-readable label
      (``"Science - Class 8 - Is Matter Around Us Pure"`` with optional
      ``(2)`` / ``(3)`` suffix for duplicates);
    * ``storage_key`` points at the ``output/<name>.json`` object the
      external microservice wrote to S3;
    * ``source_chapter_id`` lets the UI deep-link back to the generated
      result page without re-querying.
    """

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

    # Classification: ``upload`` (default teacher upload) or a generator
    # name like ``question_bank``. Untyped to keep future generators easy
    # to add — readers should treat unknown values as opaque.
    file_type = Column(String(32), nullable=False, default="upload", index=True)

    # Generator-only metadata. ``display_name`` overrides ``original_filename``
    # in the UI; ``version`` is the de-duplication counter (1, 2, 3 …)
    # within the same teacher / file_type / base name.
    display_name = Column(String(255), nullable=True)
    version = Column(Integer, nullable=False, default=1)

    # Generator linkage — points back at the chapter scope so the UI can
    # deep-link to ``/teacher/question-bank/result?...``. ``teacher_id``
    # here is the *external* identifier embedded in the S3 path (not the
    # DB FK above).
    source_school_id = Column(String(64), nullable=True)
    source_teacher_id = Column(String(64), nullable=True)
    source_grade_id = Column(String(64), nullable=True)
    source_subject_id = Column(String(64), nullable=True)
    source_chapter_id = Column(String(64), nullable=True)

    # Note: index is declared explicitly in __table_args__ below — don't
    # add index=True here too or Base.metadata.create_all will try to
    # create the same index twice and fail with "index already exists".
    uploaded_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
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
        Index("ix_uploaded_files_owner_type", "teacher_id", "file_type"),
    )
