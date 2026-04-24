from sqlalchemy import Column, Integer, String, ForeignKey, Float, DateTime, Enum, Index, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
from app.models.core import TimestampMixin
import enum

class PaymentMode(str, enum.Enum):
    UPI = "UPI"
    CARD = "CARD"
    NETBANKING = "NETBANKING"
    CASH = "CASH"
    MANUAL_UPI = "MANUAL_UPI"

class PaymentStatus(str, enum.Enum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"

class FeeType(str, enum.Enum):
    TUITION = "TUITION"
    SPORTS = "SPORTS"
    TRANSPORT = "TRANSPORT"

class StudentFeeStatus(str, enum.Enum):
    UNPAID = "UNPAID"
    PARTIAL = "PARTIAL"
    PAID = "PAID"

class FeeStructure(Base, TimestampMixin):
    """Defines the fee requirements and tracking for a student."""
    __tablename__ = "fee_structure"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), index=True)
    fee_type = Column(String) # For Enum mapping or direct string
    total_amount = Column(Float)
    paid_amount = Column(Float, default=0.0)
    priority = Column(Integer, default=0)

    institution_id = Column(Integer, ForeignKey("institutions.id"), index=True)
    institution = relationship("Institution")

    # Relationship to student
    student = relationship("Student")

class StudentFee(Base, TimestampMixin):
    """Granular tracking for individual student fees (e.g. Monthly/Termly fees)."""
    __tablename__ = "student_fees"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), index=True)
    class_id = Column(Integer, ForeignKey("school_classes.id"), index=True)
    
    total_amount = Column(Float, nullable=False)
    amount_paid = Column(Float, default=0.0)
    due_amount = Column(Float, nullable=False)
    due_date = Column(Date, nullable=False)
    
    status = Column(Enum(StudentFeeStatus), default=StudentFeeStatus.UNPAID, index=True)
    
    last_notified_at = Column(DateTime(timezone=True), nullable=True, index=True)
    last_called_at = Column(DateTime(timezone=True), nullable=True, index=True)
    
    institution_id = Column(Integer, ForeignKey("institutions.id"), index=True)

    # Relationships
    student = relationship("Student")
    school_class = relationship("SchoolClass")
    institution = relationship("Institution")

    __table_args__ = (
        Index("ix_student_fees_student_class", "student_id", "class_id", unique=True),
    )

class Payment(Base, TimestampMixin):
    """Records a payment transaction."""
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), index=True)
    amount = Column(Float)
    payment_mode = Column(String) # UPI, CARD, NETBANKING, CASH, MANUAL_UPI
    status = Column(String, default="PENDING") # PENDING, SUCCESS, FAILED
    
    razorpay_order_id = Column(String, nullable=True)
    razorpay_payment_id = Column(String, nullable=True)
    note = Column(String, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by_id = Column(Integer, ForeignKey("users.id"))
    
    institution_id = Column(Integer, ForeignKey("institutions.id"), index=True)
    institution = relationship("Institution")

    # Relationships
    student = relationship("Student")
    recorder = relationship("User")
    allocations = relationship("PaymentAllocation", back_populates="payment", cascade="all, delete-orphan")

class PaymentAllocation(Base, TimestampMixin):
    """Tracks how a single payment is distributed among various fee types."""
    __tablename__ = "payment_allocations"

    id = Column(Integer, primary_key=True, index=True)
    payment_id = Column(Integer, ForeignKey("payments.id"), index=True)
    fee_type = Column(String) # TUITION, SPORTS, TRANSPORT
    allocated_amount = Column(Float)
    
    institution_id = Column(Integer, ForeignKey("institutions.id"), index=True)
    institution = relationship("Institution")

    # Relationship to payment
    payment = relationship("Payment", back_populates="allocations")

class PaymentTransaction(Base, TimestampMixin):
    """Used for webhook idempotency and atomic updates."""
    __tablename__ = "payment_transactions"

    id = Column(Integer, primary_key=True, index=True)
    razorpay_payment_id = Column(String, unique=True, index=True, nullable=False)
    order_id = Column(String, index=True)
    amount = Column(Float)
    status = Column(String)
