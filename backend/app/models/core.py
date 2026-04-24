from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Enum
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
    FINANCE = "finance"

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

    # One-to-one profile links (optional based on role)
    teacher_profile = relationship("Teacher", back_populates="user", uselist=False)
    student_profile = relationship("Student", back_populates="user", uselist=False)
    parent_profile = relationship("Parent", back_populates="user", uselist=False)
