from sqlalchemy import Column, Integer, String, ForeignKey, Date
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
    date = Column(String) # YYYY-MM-DD (keeping string for simple date-based querying)
    status = Column(String) # 'Present', 'Absent', 'Late'
    subject = Column(String) # For legacy/string-based matching
    
    # Core Relational Links
    school_class_id = Column(Integer, ForeignKey("school_classes.id"), index=True, nullable=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), index=True, nullable=True)
    
    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, default=1, index=True)
    institution = relationship("Institution", back_populates="attendance")

    # Relationships
    student = relationship("Student", back_populates="attendance_records")
    subject_ref = relationship("Subject", back_populates="attendance_records")
    school_class = relationship("SchoolClass")
