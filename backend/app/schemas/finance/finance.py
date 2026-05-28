from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime, date
from app.models.finance import PaymentMode, PaymentStatus, FeeType, StudentFeeStatus

# --- Student Fee (Granular) Schemas ---

class StudentFeeBase(BaseModel):
    student_id: int
    class_id: int
    total_amount: float
    due_date: date

class StudentFeeCreate(StudentFeeBase):
    pass

class StudentFeeUpdate(BaseModel):
    amount_paid: Optional[float] = None
    due_date: Optional[date] = None
    status: Optional[StudentFeeStatus] = None
    last_notified_at: Optional[datetime] = None
    last_called_at: Optional[datetime] = None

class StudentFeeResponse(StudentFeeBase):
    id: int
    amount_paid: float
    due_amount: float
    status: StudentFeeStatus
    last_notified_at: Optional[datetime]
    last_called_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# --- Fee Structure Schemas ---

class FeeStructureBase(BaseModel):
    fee_type: str
    total_amount: float
    priority: int = 0

class FeeStructureCreate(FeeStructureBase):
    student_id: int

class FeeStructureResponse(FeeStructureBase):
    id: int
    student_id: int
    paid_amount: float
    created_at: datetime

    class Config:
        from_attributes = True

# --- Payment Allocation Schemas ---

class PaymentAllocationBase(BaseModel):
    fee_type: str
    allocated_amount: float

class PaymentAllocationResponse(PaymentAllocationBase):
    id: int
    payment_id: int

    class Config:
        from_attributes = True

# --- Payment Schemas ---

class PaymentBase(BaseModel):
    student_id: int
    amount: float
    payment_mode: str # UPI, CARD, NETBANKING, CASH, MANUAL_UPI
    razorpay_order_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    note: Optional[str] = None

class PaymentCreate(PaymentBase):
    status: str = "PENDING"

class PaymentResponse(PaymentBase):
    id: int
    status: str
    created_at: datetime
    created_by_id: int
    allocations: List[PaymentAllocationResponse] = []

    class Config:
        from_attributes = True

# --- Specialized Response Schemas ---

class OrderCreate(BaseModel):
    student_id: int
    amount: float

class OrderResponse(BaseModel):
    order_id: str
    amount: int
    key_id: str
    currency: str
    is_mock: bool = False

class PaymentVerify(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str

class PaymentVerifyResponse(BaseModel):
    status: str
    message: str
    payment_id: Optional[int] = None

class PaymentCancel(BaseModel):
    razorpay_order_id: str
    student_id: int

class ManualPaymentCreate(BaseModel):
    student_id: int
    amount: float
    mode: str # CASH, MANUAL_UPI
    note: Optional[str] = None

class ManualPaymentResponse(BaseModel):
    payment: PaymentResponse
    allocations: List[PaymentAllocationResponse]

class CategoryTotal(BaseModel):
    category: str
    amount: float

class FinanceSummaryResponse(BaseModel):
    total_collected: float
    total_pending: float
    category_collected: List[CategoryTotal]
    category_pending: List[CategoryTotal]

class DefaulterResponse(BaseModel):
    student_id: int
    student_name: str
    total_due: float
    class_name: Optional[str] = None
    phone: Optional[str] = None
    class_id: Optional[int] = None
    grade_id: Optional[int] = None

class CategoryWiseDue(BaseModel):
    fee_type: str
    total: float
    paid: float
    due: float

class StudentDuesResponse(BaseModel):
    student_id: int
    student_name: str
    total_due: float
    total_paid: float
    due_date: Optional[date]
    is_overdue: bool
    breakdown: List[CategoryWiseDue]

class PaginatedPaymentResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: List[PaymentResponse]

class ClassFinanceRow(BaseModel):
    class_id: int
    class_name: str         # e.g. "10-A"
    fee_per_student: float  # total_fee on the SchoolClass
    total_students: int     # enrolled active students
    paid_count: int         # students with status=PAID
    partial_count: int      # students with status=PARTIAL
    unpaid_count: int       # students with status=UNPAID
    no_record_count: int    # students with NO StudentFee record at all
    total_expected: float   # fee_per_student × total_students
    total_collected: float  # sum of amount_paid across StudentFee records
    total_pending: float    # sum of due_amount across StudentFee records

class ClassFinanceBreakdownResponse(BaseModel):
    rows: List[ClassFinanceRow]
    grand_total_expected: float
    grand_total_collected: float
    grand_total_pending: float
    total_classes_with_fee: int
    total_students: int


class ParentFeeResponse(BaseModel):
    student_name: str
    total_amount: float
    amount_paid: float
    due_amount: float
    due_date: date
    status: str
    overdue_days: int

    class Config:
        from_attributes = True


# --- Finance Ledger Schemas ---

class LedgerEntryResponse(BaseModel):
    id: int
    receipt_number: str
    entry_type: str
    payment_id: Optional[int] = None
    student_id: int
    student_name: str
    class_id: Optional[int] = None
    class_name: Optional[str] = None
    admission_number: Optional[str] = None
    fee_type: Optional[str] = None
    academic_year: str
    razorpay_order_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    amount: float
    gateway_fee: Optional[float] = 0.0
    net_amount: Optional[float] = None
    payment_method: str
    payment_status: str
    payment_date: datetime
    notes: Optional[str] = None
    # Convenience: the user-facing transaction reference (Razorpay payment id
    # if captured, else the order id, else None for cash).
    transaction_id: Optional[str] = None
    # Set when a payment has one or more REFUND ledger entries linked to it.
    # `None` for payments with no refund activity.
    refund_status: Optional[str] = None
    refunded_amount: Optional[float] = None
    # Surfaced for FAILED / CANCELLED rows so the UI can show why.
    error_message: Optional[str] = None
    # True when a PDF receipt can be streamed for this entry — i.e. status
    # is SUCCESS and the row was either mirrored from manual_payment or
    # carries a real ledger id we can render an on-the-fly PDF from.
    has_receipt: bool = False
    # When non-null, the ledger row was mirrored from this manual payment.
    manual_payment_request_id: Optional[int] = None

    class Config:
        from_attributes = True


class LedgerSummary(BaseModel):
    total_collected: float = 0.0
    total_pending: float = 0.0
    total_failed: float = 0.0
    total_refunded: float = 0.0
    total_cancelled: float = 0.0
    # Net revenue = total_collected − total_refunded. Failed/cancelled/pending
    # never inflate or deflate this figure.
    net_revenue: float = 0.0
    transaction_count: int = 0


class PaginatedLedgerResponse(BaseModel):
    total: int
    offset: int
    limit: int
    summary: LedgerSummary
    items: List[LedgerEntryResponse]
