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
    Parent/Guardian profile — the single source of truth for guardian
    contact details. Optionally linked to a User for login credentials,
    though parent-portal login resolves through the child's user (see
    auth_service.authenticate_parent_by_phone).
    """
    __tablename__ = "parents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)

    # Guardian contact details live here only — never duplicated on students.
    name = Column(String, nullable=True, index=True)
    email = Column(String, nullable=True, index=True)
    # Primary phone is the main contact number and the parent-portal login
    # credential (paired with the child's DOB). Secondary phone is the
    # fallback / emergency number and is never used for login.
    primary_phone = Column(String, nullable=True)
    secondary_phone = Column(String, nullable=True)
    # Auto-derived last-10-digits canonical form of primary_phone. Indexed
    # so the parent-login lookup is a single equality probe instead of a
    # scan. Kept in sync via the validator below — never set by hand
    # outside the Alembic backfill.
    primary_phone_normalized = Column(String(10), nullable=True, index=True)
    relation = Column(String) # e.g., "Mother", "Father", "Guardian"

    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, default=1, index=True)
    institution = relationship("Institution")

    # One-to-many relationship with students
    students = relationship("Student", back_populates="parent")
    # Back-link to unified user
    user = relationship("User", back_populates="parent_profile")

    @validates("primary_phone")
    def _set_normalized_phone(self, _key, value):
        """
        Auto-populate ``primary_phone_normalized`` on every write to
        ``primary_phone`` (INSERT and UPDATE, including bulk setattr).
        Returning ``value`` leaves the column itself unchanged — we only
        piggy-back to refresh the indexed login-lookup target.
        """
        self.primary_phone_normalized = _normalize_phone_to_last10(value)
        return value

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

    # Stable institution-wide admission identity. Unlike roll_number (per-class,
    # recomputed alphabetically) this never changes when a student moves class
    # or year — it is the key column for the promotion-preview export. Backfilled
    # as ADM-{institution_id}-{id} by migration; admin-editable thereafter.
    admission_number = Column(String, nullable=True, index=True)
    
    # Core Relational Link. Indexed: every class roster, class-attendance
    # join, finance class-breakdown, announcement class-size count, and the
    # student-login (name+class+dob) lookup filters on this FK.
    school_class_id = Column(Integer, ForeignKey("school_classes.id"), index=True)
    
    is_active = Column(Boolean, default=True)
    plain_password = Column(String, nullable=True)  # Admin-visible for credential recovery

    # Assigned automatically from alphabetical order within the student's class.
    # Recomputed whenever a student is added, removed, renamed, or moved between classes.
    roll_number = Column(Integer, nullable=True, index=True)

    # Optional student profile details.
    address = Column(String, nullable=True)
    blood_group = Column(String, nullable=True)

    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, default=1, index=True)
    institution = relationship("Institution", back_populates="students")

    # Guardian link — the only connection to parent contact details, which
    # live entirely on the Parent record (see the Parent model above).
    # Indexed: the Parent->children join runs on every parent-portal request
    # (announcements feed, /parents/fees, dashboard).
    parent_id = Column(Integer, ForeignKey("parents.id"), nullable=True, index=True)
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
