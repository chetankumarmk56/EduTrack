from app.models.core import Institution, User, UserRole, TimestampMixin
from app.models.academic import Subject, Grade, Section, SchoolClass
from app.models.directory import Parent, Student, Teacher, TeacherAssignment
from app.models.attendance import Attendance
from app.models.mark import Mark, Exam
from app.models.event import Event
from app.models.communication import Announcement
import app.models.communication as comm
print(f"DEBUG: Announcement model loaded from: {comm.__file__}")
from app.models.transport import Bus, Route, Stop, StudentTransport, BusLocation, NotificationLog
from app.models.finance import FeeStructure, Payment, PaymentAllocation
from app.core.database import Base

# Grouped export list for easy project-wide access
__all__ = [
    "Institution", "User", "UserRole", "TimestampMixin",
    "Subject", "Grade", "Section", "SchoolClass",
    "Parent", "Student", "Teacher", "TeacherAssignment",
    "Attendance", "Mark", "Exam",
    "Event", "Announcement", "Base",
    "Bus", "Route", "Stop", "StudentTransport", "BusLocation", "NotificationLog",
    "FeeStructure", "Payment", "PaymentAllocation"
]
