from sqlalchemy import Column, Integer, String, ForeignKey, Time, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.core import TimestampMixin


class SchedulePeriod(Base, TimestampMixin):
    """
    Institution-wide bell schedule. Defines the structure of a school day:
    period rows, breaks, lunch, etc. Shared across every class.
    """
    __tablename__ = "schedule_periods"

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id"), index=True, nullable=False)

    name = Column(String, nullable=False)              # "Period 1", "Lunch", "Break"
    period_type = Column(String, nullable=False)       # "class_period" | "break" | "lunch" | "assembly"
    order = Column(Integer, nullable=False, default=0) # display order in the day
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)

    slots = relationship(
        "TimetableSlot",
        back_populates="period",
        cascade="all, delete-orphan",
    )


class TimetableSlot(Base, TimestampMixin):
    """
    Concrete teaching assignment for a class on a specific day at a specific period.
    Only used for periods of type 'class_period'.
    """
    __tablename__ = "timetable_slots"
    __table_args__ = (
        UniqueConstraint(
            "school_class_id", "schedule_period_id", "day_of_week",
            name="uq_timetable_class_period_day",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id"), index=True, nullable=False)

    school_class_id = Column(Integer, ForeignKey("school_classes.id"), index=True, nullable=False)
    schedule_period_id = Column(Integer, ForeignKey("schedule_periods.id"), index=True, nullable=False)
    day_of_week = Column(Integer, nullable=False)  # 0=Mon ... 6=Sun

    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=True)
    room = Column(String, nullable=True)

    school_class = relationship("SchoolClass")
    period = relationship("SchedulePeriod", back_populates="slots")
    subject = relationship("Subject")
    teacher = relationship("Teacher")
