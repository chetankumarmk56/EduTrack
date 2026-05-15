from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Date, Text, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
from app.models.core import TimestampMixin
import enum


class TeacherAttendanceStatus(str, enum.Enum):
    PRESENT = "PRESENT"
    ABSENT = "ABSENT"
    HALF_DAY = "HALF_DAY"
    ON_LEAVE = "ON_LEAVE"


class TeacherLeaveType(str, enum.Enum):
    CASUAL = "CASUAL"
    SICK = "SICK"
    EARNED = "EARNED"
    MATERNITY = "MATERNITY"
    PATERNITY = "PATERNITY"
    OTHER = "OTHER"


class TeacherLeaveStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class TeacherAttendance(Base, TimestampMixin):
    __tablename__ = "teacher_attendance"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=False, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, index=True)

    date = Column(String, nullable=False, index=True)  # YYYY-MM-DD
    check_in_time = Column(String, nullable=True)       # HH:MM or full ISO
    check_out_time = Column(String, nullable=True)
    status = Column(String, nullable=False, default="PRESENT")  # TeacherAttendanceStatus
    remarks = Column(Text, nullable=True)

    # Edit tracking
    is_edited = Column(Integer, default=0)  # 0=original, 1=edited by admin
    edited_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Relationships
    teacher = relationship("Teacher", back_populates="attendance_records")
    edited_by = relationship("User", foreign_keys=[edited_by_id])
    audit_logs = relationship("TeacherAttendanceAuditLog", back_populates="attendance", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_teacher_attendance_inst_date", "institution_id", "date"),
        Index("ix_teacher_attendance_teacher_date", "teacher_id", "date", unique=True),
    )


class TeacherLeaveRequest(Base, TimestampMixin):
    __tablename__ = "teacher_leave_requests"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=False, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, index=True)

    leave_type = Column(String, nullable=False)   # TeacherLeaveType
    start_date = Column(String, nullable=False)    # YYYY-MM-DD
    end_date = Column(String, nullable=False)      # YYYY-MM-DD
    days_count = Column(Integer, nullable=False, default=1)
    reason = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="PENDING")  # TeacherLeaveStatus

    approved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    rejection_reason = Column(Text, nullable=True)

    # Relationships
    teacher = relationship("Teacher", back_populates="leave_requests")
    approved_by = relationship("User", foreign_keys=[approved_by_id])

    __table_args__ = (
        Index("ix_teacher_leave_inst_teacher", "institution_id", "teacher_id"),
        Index("ix_teacher_leave_inst_status", "institution_id", "status"),
    )


class TeacherAttendanceAuditLog(Base):
    __tablename__ = "teacher_attendance_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, index=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=False, index=True)

    # What entity was changed (attendance or leave)
    entity_type = Column(String, nullable=False)  # "ATTENDANCE" or "LEAVE"
    entity_id = Column(Integer, nullable=True)

    # attendance_id for attendance-specific logs
    attendance_id = Column(Integer, ForeignKey("teacher_attendance.id", ondelete="SET NULL"), nullable=True)

    changed_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String, nullable=False)  # CHECK_IN, CHECK_OUT, EDIT, APPROVE, REJECT, CANCEL, CREATE_LEAVE
    old_value = Column(Text, nullable=True)  # JSON string
    new_value = Column(Text, nullable=True)  # JSON string
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    attendance = relationship("TeacherAttendance", back_populates="audit_logs")
    changed_by = relationship("User", foreign_keys=[changed_by_id])

    __table_args__ = (
        Index("ix_teacher_audit_inst_teacher", "institution_id", "teacher_id"),
    )
