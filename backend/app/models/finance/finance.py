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
    CANCELLED = "CANCELLED"

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
    
    status = Column(Enum(StudentFeeStatus, native_enum=False), default=StudentFeeStatus.UNPAID, index=True)
    
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


class LedgerEntryType(str, enum.Enum):
    """Direction of a ledger entry — credits collected, debits refunded/reversed."""
    PAYMENT = "PAYMENT"
    REFUND = "REFUND"
    ADJUSTMENT = "ADJUSTMENT"


class FinanceLedger(Base, TimestampMixin):
    """
    Append-only finance ledger. One row per confirmed financial event
    (online payment success, manual payment, refund, manual adjustment).

    Distinct from `payments` (the gateway record) so that:
      - Refunds/reversals get their own row instead of mutating history.
      - Receipt number is generated once at the moment a payment is confirmed.
      - Reports/exports run off this table, independent of gateway internals.
    """
    __tablename__ = "finance_ledger"

    id = Column(Integer, primary_key=True, index=True)

    # Idempotency keys — receipt_number is the human-facing identifier;
    # razorpay_payment_id is the gateway-facing one. Both are unique so
    # duplicate confirmations (webhook + frontend) cannot create two rows.
    receipt_number = Column(String, unique=True, nullable=False, index=True)
    entry_type = Column(
        Enum(LedgerEntryType, native_enum=False),
        default=LedgerEntryType.PAYMENT,
        nullable=False,
        index=True,
    )

    # Linkage
    payment_id = Column(Integer, ForeignKey("payments.id"), index=True, nullable=True)
    # Cross-reference to the manual-payment workflow. Populated only when a
    # FinanceLedger row was synthesised from an approved ManualPaymentRequest.
    # NULL for gateway/Razorpay rows. Lets the ledger UI stream the original
    # PDF receipt without re-rendering or duplicating receipt storage.
    manual_payment_request_id = Column(
        Integer, ForeignKey("manual_payment_requests.id"), index=True, nullable=True,
    )
    student_id = Column(Integer, ForeignKey("students.id"), index=True, nullable=False)
    class_id = Column(Integer, ForeignKey("school_classes.id"), index=True, nullable=True)
    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, index=True)

    # Denormalised for fast list/export queries — captured at the moment of payment,
    # immutable even if the student is later renamed or moved between classes.
    student_name = Column(String, nullable=False)
    class_name = Column(String, nullable=True)
    fee_type = Column(String, nullable=True, default="TUITION")
    academic_year = Column(String, nullable=False, index=True)

    # Razorpay identifiers (NULL for manual/cash payments)
    razorpay_order_id = Column(String, index=True, nullable=True)
    razorpay_payment_id = Column(String, unique=True, index=True, nullable=True)

    # Amounts (rupees)
    amount = Column(Float, nullable=False)
    gateway_fee = Column(Float, nullable=True, default=0.0)
    net_amount = Column(Float, nullable=True)

    payment_method = Column(String, nullable=False)
    payment_status = Column(String, nullable=False, default="SUCCESS", index=True)

    # Distinct from created_at — payment_date is when the transaction was confirmed
    # by the gateway/admin; created_at is when this row was inserted.
    payment_date = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)

    notes = Column(String, nullable=True)
    recorded_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    payment = relationship("Payment")
    student = relationship("Student")
    school_class = relationship("SchoolClass")
    institution = relationship("Institution")
    recorder = relationship("User")

    __table_args__ = (
        Index("ix_finance_ledger_payment_date_inst", "institution_id", "payment_date"),
        Index("ix_finance_ledger_student_inst", "institution_id", "student_id"),
    )
