from sqlalchemy import Column, Integer, String, ForeignKey, Date
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.core import TimestampMixin

class Exam(Base, TimestampMixin):
    """Represents a specific assessment (e.g., 'Unit Test 1', 'Final Exam')."""
    __tablename__ = "exams"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    date = Column(String, nullable=True) # YYYY-MM-DD
    term = Column(String, nullable=True) # Q1, Semester 1, etc.
    
    school_class_id = Column(Integer, ForeignKey("school_classes.id"), index=True, nullable=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), index=True, nullable=True)
    
    institution_id = Column(Integer, ForeignKey("institutions.id"), index=True)
    institution = relationship("Institution")

    # Relationships
    school_class = relationship("SchoolClass")
    subject_ref = relationship("Subject")
    marks = relationship("Mark", back_populates="exam")

class Mark(Base, TimestampMixin):
    """Individual marks given to students for subjects and exams."""
    __tablename__ = "marks"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), index=True)
    
    exam_id = Column(Integer, ForeignKey("exams.id"), index=True, nullable=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), index=True, nullable=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), index=True, nullable=True)

    # Legacy Migration Support
    subject = Column(String) # 'Science', 'Math'
    test_name = Column(String) # 'Unit Test 1'
    
    score = Column(Integer)
    max_score = Column(Integer, default=100)

    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, default=1, index=True)
    institution = relationship("Institution", back_populates="marks")

    # Relationships
    student = relationship("Student", back_populates="marks_records")
    exam = relationship("Exam", back_populates="marks")
    subject_ref = relationship("Subject", back_populates="marks_records")
    recorded_by = relationship("Teacher", back_populates="marks_recorded")
