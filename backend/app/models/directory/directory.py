from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, Date, Index
from sqlalchemy.orm import relationship, validates
from app.core.database import Base
from app.models.core import TimestampMixin


def _normalize_phone_to_last10(raw):
    """
    Canonicalise a phone number to its last 10 digits.

    Indian guardian numbers are 10-digit subscriber IDs, often prefixed
    with +91, 0, or stray spaces/dashes. Comparing on the last 10 digits
    canonicalises across all those formats so a parent-login lookup is a
    single indexed equality probe instead of a Python-side scan over
    every student with the same DOB.

    Returns ``None`` if fewer than 10 digits are present so callers can
    skip the row rather than false-match on a partial number. Mirrored
    in app/services/auth/auth_service._normalize_phone — keep them in
    sync (the migration backfill calls this same function).
    """
    if not raw:
        return None
    digits = "".join(ch for ch in str(raw) if ch.isdigit())
    if len(digits) < 10:
        return None
    return digits[-10:]

class Parent(Base, TimestampMixin):
    """
    Parent/Guardian profile.
    Linked to a User for login credentials.
    """
    __tablename__ = "parents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    phone = Column(String)
    relation = Column(String) # e.g., "Mother", "Father", "Guardian"

    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, default=1, index=True)
    institution = relationship("Institution")

    # One-to-many relationship with students
    students = relationship("Student", back_populates="parent")
    # Back-link to unified user
    user = relationship("User", back_populates="parent_profile")

class Student(Base, TimestampMixin):
    """
    Student profile.
    Linked to a User for portal access.
    """
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    name = Column(String, index=True)
    dob = Column(String) # YYYY-MM-DD
    whatsapp = Column(String, nullable=True)
    
    # Core Relational Link
    school_class_id = Column(Integer, ForeignKey("school_classes.id"))
    
    is_active = Column(Boolean, default=True)
    plain_password = Column(String, nullable=True)  # Admin-visible for credential recovery

    # Assigned automatically from alphabetical order within the student's class.
    # Recomputed whenever a student is added, removed, renamed, or moved between classes.
    roll_number = Column(Integer, nullable=True, index=True)

    # New Integrated Parent Fields
    parent_name = Column(String, nullable=True)
    parent_email = Column(String, nullable=True)
    parent_phone = Column(String, nullable=True)
    # Auto-derived last-10-digits canonical form of parent_phone. Indexed
    # alongside dob so the parent-login lookup is a single equality probe
    # against the index instead of a full scan over every student with
    # the same DOB across every institution. Kept in sync via the
    # ``_set_normalized_phone`` validator below — never set it by hand
    # outside the Alembic backfill.
    parent_phone_normalized = Column(String(10), nullable=True, index=True)

    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, default=1, index=True)
    institution = relationship("Institution", back_populates="students")

    @validates("parent_phone")
    def _set_normalized_phone(self, _key, value):
        """
        Auto-populate ``parent_phone_normalized`` on every write to
        ``parent_phone``. Fires for INSERT and UPDATE, including bulk
        ``setattr`` paths used by the directory service when applying a
        partial update payload. Returning ``value`` keeps the column
        itself unchanged — we only piggy-back to refresh the index target.
        """
        self.parent_phone_normalized = _normalize_phone_to_last10(value)
        return value

    # Relationships
    parent_id = Column(Integer, ForeignKey("parents.id"), nullable=True)
    parent = relationship("Parent", back_populates="students")
    school_class = relationship("SchoolClass", back_populates="students")
    user = relationship("User", back_populates="student_profile")
    attendance_records = relationship("Attendance", back_populates="student", cascade="all, delete-orphan")
    marks_records = relationship("Mark", back_populates="student", cascade="all, delete-orphan")

class Teacher(Base, TimestampMixin):
    """
    Educator profile.
    Linked to a User for portal access.
    """
    __tablename__ = "teachers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    name = Column(String, index=True)
    email = Column(String) 
    phone = Column(String, nullable=True)
    whatsapp = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    plain_password = Column(String, nullable=True) 
    
    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, default=1, index=True)
    institution = relationship("Institution", back_populates="teachers")
    
    # Relationships
    user = relationship("User", back_populates="teacher_profile")
    assignments = relationship("TeacherAssignment", back_populates="teacher", cascade="all, delete-orphan")
    marks_recorded = relationship("Mark", back_populates="recorded_by")
    attendance_records = relationship("TeacherAttendance", back_populates="teacher", cascade="all, delete-orphan")
    leave_requests = relationship("TeacherLeaveRequest", back_populates="teacher", cascade="all, delete-orphan")

class TeacherAssignment(Base, TimestampMixin):
    """Bridge table connecting Teachers to SchoolClasses and Subjects."""
    __tablename__ = "teacher_assignments"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), index=True)
    school_class_id = Column(Integer, ForeignKey("school_classes.id"), index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), index=True)
    
    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, default=1, index=True)
    
    # Relationships
    teacher = relationship("Teacher", back_populates="assignments")
    school_class = relationship("SchoolClass", back_populates="teacher_assignments")
    subject_ref = relationship("Subject", back_populates="teacher_assignments")
