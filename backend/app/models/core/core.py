from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Enum, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum

class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    TEACHER = "teacher"
    PARENT = "parent"
    STUDENT = "student"

class TimestampMixin:
    """Mixin to add creation and update timestamps to all tables."""
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class Institution(Base, TimestampMixin):
    __tablename__ = "institutions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    slug = Column(String, unique=True, index=True)
    is_active = Column(Boolean, default=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True, index=True)
    # Storage identifier for the school logo (S3 key or /static/uploads path).
    # Resolve via storage_service.resolve_url before returning to clients.
    logo_url = Column(String, nullable=True)

    # Relationships
    users = relationship("User", back_populates="institution")
    students = relationship("Student", back_populates="institution")
    teachers = relationship("Teacher", back_populates="institution")
    events = relationship("Event", back_populates="institution")
    announcements = relationship("Announcement", back_populates="institution")
    grades = relationship("Grade", back_populates="institution")
    sections = relationship("Section", back_populates="institution")
    subjects = relationship("Subject", back_populates="institution")
    marks = relationship("Mark", back_populates="institution")
    attendance = relationship("Attendance", back_populates="institution")

class User(Base, TimestampMixin):
    """
    Unified User table for all credentials.
    Specific profiles (Teacher, Student, Parent) will link back to this.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=True)
    name = Column(String)
    password_hash = Column(String)
    role = Column(String, index=True) # Using string instead of Enum for simpler future migrations
    is_active = Column(Boolean, default=True)

    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=True)
    institution = relationship("Institution", back_populates="users")

    # ✅ NEW: Account lockout fields for brute force protection
    failed_login_attempts = Column(Integer, default=0)  # Track failed login attempts
    locked_until = Column(DateTime, nullable=True)  # Timestamp when account becomes unlocked

    # One-to-one profile links (optional based on role)
    teacher_profile = relationship("Teacher", back_populates="user", uselist=False)
    student_profile = relationship("Student", back_populates="user", uselist=False)
    parent_profile = relationship("Parent", back_populates="user", uselist=False)


class AuditLog(Base):
    """
    ✅ NEW: Audit log table for tracking all sensitive user actions.
    Used for security compliance, forensics, and admin activity monitoring.
    """
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)  # User performing action
    action = Column(String(100), index=True)  # LOGIN, CREATE_USER, UPDATE_GRADE, DELETE_ANNOUNCEMENT, etc.
    resource_type = Column(String(50), index=True)  # User, Mark, Announcement, StudentClass, etc.
    resource_id = Column(Integer, index=True)  # ID of resource being acted upon
    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=True, index=True)
    
    # Details about the change
    description = Column(Text, nullable=True)  # Human readable description
    old_values = Column(JSON, nullable=True)  # Previous values (for updates)
    new_values = Column(JSON, nullable=True)  # New values (for updates)
    
    # Request context
    ip_address = Column(String(45), nullable=True)  # IPv4 or IPv6 address
    user_agent = Column(Text, nullable=True)  # Browser user agent
    
    # Status
    status = Column(String(20), default="SUCCESS")  # SUCCESS, FAILURE
    error_message = Column(Text, nullable=True)  # Error details if failed
    
    # Metadata
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    # Relationships
    user = relationship("User")
    institution = relationship("Institution")
