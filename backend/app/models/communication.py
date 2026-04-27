import uuid
from enum import Enum
from sqlalchemy import Column, String, Text, ForeignKey, DateTime, Enum as SQLEnum, UniqueConstraint, Index, Integer, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.database import Base
from app.models.core import TimestampMixin

class AnnouncementType(str, Enum):
    CLASS = "class"
    STUDENT = "student"

class AnnouncementPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

class Announcement(Base):
    """
    Robust targeted announcements system.
    """
    print("DEBUG: Announcement class (CLEAN VERSION) is being defined now!")
    __tablename__ = "announcements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    
    type = Column(SQLEnum(AnnouncementType, native_enum=False), nullable=False)
    priority = Column(SQLEnum(AnnouncementPriority, native_enum=False), default=AnnouncementPriority.LOW, nullable=False)
    
    attachment_url = Column(String, nullable=True)
    
    # Target IDs
    class_id = Column(Integer, ForeignKey("school_classes.id"), nullable=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=False)
    
    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    teacher = relationship("Teacher")
    institution = relationship("Institution")
    reads = relationship("AnnouncementRead", back_populates="announcement", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_announcements_class_id", "class_id"),
        Index("ix_announcements_student_id", "student_id"),
        Index("ix_announcements_created_at_desc", created_at.desc()),
    )

class AnnouncementRead(Base):
    """
    Tracks which parents have read which announcements.
    """
    __tablename__ = "announcement_reads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    announcement_id = Column(UUID(as_uuid=True), ForeignKey("announcements.id", ondelete="CASCADE"), nullable=False)
    parent_id = Column(Integer, ForeignKey("parents.id"), nullable=False)
    read_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    announcement = relationship("Announcement", back_populates="reads")
    parent = relationship("Parent")

    __table_args__ = (
        UniqueConstraint("announcement_id", "parent_id", name="uq_announcement_parent_read"),
    )

class Notification(Base, TimestampMixin):
    """
    User-specific notifications (e.g. reminders, alerts).
    """
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    title = Column(String)
    message = Column(Text)
    type = Column(String, default="INFO") 
    is_read = Column(Boolean, default=False) 
    
    user = relationship("User")
    institution_id = Column(Integer, ForeignKey("institutions.id"), index=True)
    institution = relationship("Institution")

class CronLock(Base):
    """Distributed lock for background tasks."""
    __tablename__ = "cron_locks"

    name = Column(String, primary_key=True)
    locked_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
