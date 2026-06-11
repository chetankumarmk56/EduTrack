from sqlalchemy import Column, Integer, String, ForeignKey, Date, Index
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.core import TimestampMixin

class Attendance(Base, TimestampMixin):
    """
    Attendance records for students.
    Relational links substitute for strings (class_level, section, subject).
    """
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), index=True)
    date = Column(String, index=True) # YYYY-MM-DD (keeping string for simple date-based querying)
    status = Column(String) # 'Present', 'Absent', 'Late'
    subject = Column(String) # For legacy/string-based matching
    
    # Core Relational Links
    school_class_id = Column(Integer, ForeignKey("school_classes.id"), index=True, nullable=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), index=True, nullable=True)

    # Academic-year scope. Stamped with the institution's active year at write
    # time so a new year starts with clean attendance. Nullable for legacy rows.
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), index=True, nullable=True)

    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, default=1, index=True)
    institution = relationship("Institution", back_populates="attendance")

    # Relationships
    student = relationship("Student", back_populates="attendance_records")
    subject_ref = relationship("Subject", back_populates="attendance_records")
    school_class = relationship("SchoolClass")

    # Compound indexes for the hot batch-query paths. These were originally
    # created out-of-band by migration `c9f8a1b2e3d4` (raw CREATE INDEX) and
    # are mirrored here so `alembic revision --autogenerate` recognises them
    # as already-present and never emits a spurious DROP. Names + column order
    # match the DB exactly.
    __table_args__ = (
        Index(
            "ix_attendance_student_institution_subject_date",
            "student_id", "institution_id", "subject", "date",
        ),
        Index(
            "ix_attendance_class_date_institution",
            "school_class_id", "date", "institution_id",
        ),
    )
