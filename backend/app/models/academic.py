from sqlalchemy import Column, Integer, String, ForeignKey, Float, Date
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.core import TimestampMixin

class Grade(Base, TimestampMixin):
    """Represents a scholastic year/level (e.g., Grade 10)."""
    __tablename__ = "grades"

    id = Column(Integer, primary_key=True, index=True)
    level = Column(Integer) # e.g., 10
    name = Column(String)  # e.g., "Grade 10"
    
    tuition_fee = Column(Float, default=0.0)
    fee_due_date = Column(Date, nullable=True)

    institution_id = Column(Integer, ForeignKey("institutions.id"), index=True)
    institution = relationship("Institution", back_populates="grades")

    # Relationships
    sections = relationship("Section", back_populates="grade", cascade="all, delete-orphan")
    classes = relationship("SchoolClass", back_populates="grade", cascade="all, delete-orphan")

class Section(Base, TimestampMixin):
    """Represents a specific division within a Grade (e.g., Section A)."""
    __tablename__ = "sections"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String) # e.g., "A"

    grade_id = Column(Integer, ForeignKey("grades.id"), index=True)
    grade = relationship("Grade", back_populates="sections")
    
    institution_id = Column(Integer, ForeignKey("institutions.id"), index=True)
    institution = relationship("Institution", back_populates="sections")

    # Relationships
    classes = relationship("SchoolClass", back_populates="section", cascade="all, delete-orphan")

class Subject(Base, TimestampMixin):
    __tablename__ = "subjects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    code = Column(String, index=True) # e.g. 'MATH101'
    
    institution_id = Column(Integer, ForeignKey("institutions.id"), index=True)
    institution = relationship("Institution", back_populates="subjects")

    # Relationships
    attendance_records = relationship("Attendance", back_populates="subject_ref", cascade="all, delete-orphan")
    marks_records = relationship("Mark", back_populates="subject_ref", cascade="all, delete-orphan")
    teacher_assignments = relationship("TeacherAssignment", back_populates="subject_ref", cascade="all, delete-orphan")

class SchoolClass(Base, TimestampMixin):
    """
    The specific 'Class' unit (mapping Grade + Section).
    This is what students are enrolled in and teachers are assigned to.
    """
    __tablename__ = "school_classes"

    id = Column(Integer, primary_key=True, index=True)
    
    grade_id = Column(Integer, ForeignKey("grades.id"))
    section_id = Column(Integer, ForeignKey("sections.id"))
    
    institution_id = Column(Integer, ForeignKey("institutions.id"))
    
    # Optional alias: e.g., "10-A"
    display_name = Column(String, nullable=True)

    # Dedicated classroom shared across the whole weekly timetable
    room_number = Column(String, nullable=True)

    # Fee Structure per Class
    tuition_fee = Column(Float, nullable=False, default=0.0)
    transport_fee = Column(Float, default=0.0)
    other_fee = Column(Float, default=0.0)
    total_fee = Column(Float, default=0.0)
    fee_due_date = Column(Date, nullable=True)

    # Relationships
    grade = relationship("Grade", back_populates="classes")
    section = relationship("Section", back_populates="classes")
    students = relationship("Student", back_populates="school_class")
    teacher_assignments = relationship("TeacherAssignment", back_populates="school_class")
