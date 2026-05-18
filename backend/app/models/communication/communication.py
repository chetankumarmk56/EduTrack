import uuid
from enum import Enum
from sqlalchemy import Column, String, Text, ForeignKey, DateTime, Enum as SQLEnum, UniqueConstraint, Index, Integer, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.database import Base
from app.models.core import TimestampMixin

class AnnouncementType(str, Enum):
    CLASS = "CLASS"
    STUDENT = "STUDENT"

class AnnouncementPriority(str, Enum):
    NORMAL = "NORMAL"
    IMPORTANT = "IMPORTANT"


class Announcement(Base):
    """
    Robust targeted announcements system.
    """
    __tablename__ = "announcements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    
    type = Column(SQLEnum(AnnouncementType, native_enum=False), nullable=False)
    priority = Column(SQLEnum(AnnouncementPriority, native_enum=False), default=AnnouncementPriority.NORMAL, nullable=False)
    
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


class DevicePlatform(str, Enum):
    IOS = "ios"
    ANDROID = "android"
    WEB = "web"


class DeviceToken(Base, TimestampMixin):
    """
    Per-device Expo push token. A single user may have many active tokens
    (phone + tablet + parent's spouse on shared login). Tokens are kept
    `is_active=False` after Expo reports them as invalid so we can audit
    them later without re-sending.
    """
    __tablename__ = "device_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, index=True)

    expo_push_token = Column(String, nullable=False, unique=True, index=True)
    platform = Column(String, nullable=False, default=DevicePlatform.ANDROID.value)
    device_name = Column(String, nullable=True)

    is_active = Column(Boolean, default=True, nullable=False, index=True)
    last_used_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    invalidated_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User")
    institution = relationship("Institution")

    __table_args__ = (
        Index("ix_device_tokens_user_active", "user_id", "is_active"),
    )


class PushDeliveryLog(Base):
    """
    Per-token dispatch record. One row per (notification, device_token)
    attempt so the operator can answer "why didn't this parent get
    yesterday's update?" without polling Expo's receipt API directly.
    """
    __tablename__ = "push_delivery_logs"

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, index=True)

    # Which feature emitted this notification (announcement, fee_reminder, attendance_alert, ...)
    notification_type = Column(String, nullable=False, index=True)
    # Free-form reference — stringified UUID/int — kept loose so different
    # features (announcements, fees, attendance) can all log here without
    # forcing a polymorphic FK.
    reference_id = Column(String, nullable=True, index=True)

    device_token_id = Column(Integer, ForeignKey("device_tokens.id", ondelete="SET NULL"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    # queued | sent | failed | invalid_token
    status = Column(String, nullable=False, default="queued", index=True)
    expo_ticket_id = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    sent_at = Column(DateTime(timezone=True), nullable=True)
