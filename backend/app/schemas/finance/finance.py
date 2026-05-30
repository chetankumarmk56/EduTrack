from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from app.models.finance import StudentFeeStatus

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
    payment_mode: str  # UPI, CASH, MANUAL_UPI
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


class ManualPaymentCreate(BaseModel):
    student_id: int
    amount: float
    mode: str  # CASH, MANUAL_UPI
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
    class_name: str
    fee_per_student: float
    total_students: int
    paid_count: int
    partial_count: int
    unpaid_count: int
    no_record_count: int
    total_expected: float
    total_collected: float
    total_pending: float

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
    amount: float
    gateway_fee: Optional[float] = 0.0
    net_amount: Optional[float] = None
    payment_method: str
    payment_status: str
    payment_date: datetime
    notes: Optional[str] = None
    # External reference: UTR for manual UPI, internal id for cash. None for
    # admin-recorded entries that did not capture a reference.
    transaction_id: Optional[str] = None
    refund_status: Optional[str] = None
    refunded_amount: Optional[float] = None
    error_message: Optional[str] = None
    has_receipt: bool = False
    # Non-null when the row was mirrored from a parent manual-payment submission.
    manual_payment_request_id: Optional[int] = None

    class Config:
        from_attributes = True


class LedgerSummary(BaseModel):
    total_collected: float = 0.0
    total_pending: float = 0.0
    total_failed: float = 0.0
    total_refunded: float = 0.0
    total_cancelled: float = 0.0
    net_revenue: float = 0.0
    transaction_count: int = 0


class PaginatedLedgerResponse(BaseModel):
    total: int
    offset: int
    limit: int
    summary: LedgerSummary
    items: List[LedgerEntryResponse]
