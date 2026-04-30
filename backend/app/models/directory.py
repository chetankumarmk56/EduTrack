from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, Date
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.core import TimestampMixin

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

    # New Integrated Parent Fields
    parent_name = Column(String, nullable=True)
    parent_email = Column(String, nullable=True)
    parent_phone = Column(String, nullable=True)

    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, default=1, index=True)
    institution = relationship("Institution", back_populates="students")

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
