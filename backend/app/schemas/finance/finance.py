from pydantic import BaseModel, Field
from typing import Literal, Optional, List
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
    amount: float = Field(..., gt=0, le=1_000_000)
    mode: Literal["CASH", "MANUAL_UPI"]
    note: Optional[str] = Field(default=None, max_length=2000)

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

class PreviousYearArrear(BaseModel):
    """An unpaid fee carried over from a year that is no longer active."""
    academic_year: Optional[str] = None
    class_name: Optional[str] = None
    due: float

class StudentDuesResponse(BaseModel):
    student_id: int
    student_name: str
    total_due: float
    total_paid: float
    due_date: Optional[date]
    is_overdue: bool
    breakdown: List[CategoryWiseDue]
    # Carried-over arrears from a previous (non-active) academic year. Included
    # in total_due, but broken out so the UI can flag "due from last year".
    previous_year_due: float = 0.0
    arrears: List[PreviousYearArrear] = []

class ArrearsStudentResponse(BaseModel):
    """A student carrying previous-year arrears — for the admin finance view."""
    student_id: int
    student_name: str
    admission_number: Optional[str] = None
    current_class_name: Optional[str] = None
    phone: Optional[str] = None
    previous_year_due: float
    arrears: List[PreviousYearArrear] = []

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


# --- Fee reminders ---

class FeeReminderEligibleRow(BaseModel):
    student_fee_id: int
    student_id: int
    student_name: str
    class_name: Optional[str] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    due_amount: float
    due_date: str
    days_overdue: int
    last_notified_at: Optional[str] = None
    has_login_target: bool = False
    has_phone: bool = False
    in_cooldown: bool = False
    eligible_now: bool = False
    skip_reason: Optional[str] = None


class FeeReminderPreviewResponse(BaseModel):
    # Total overdue, unpaid rows — the full population the admin can see.
    overdue_count: int
    overdue_unique_students: int
    overdue_total_due: float
    # Subset that would ACTUALLY be notified by clicking Send right now.
    eligible_count: int
    unique_students: int
    total_due_amount: float
    # Why some overdue rows aren't eligible right now.
    in_cooldown_count: int
    no_login_count: int
    rows: List[FeeReminderEligibleRow]


class FeeReminderDispatchSummary(BaseModel):
    triggered: bool
    skipped_reason: Optional[str] = None
    eligible_rows: int = 0
    unique_students: int = 0
    skipped_no_target: int = 0
    # Rows attempted but not reached (no push token + no call placed). Not put
    # under cooldown — the next dispatch retries them.
    delivery_failed: int = 0
    push: dict = {}
    calls: dict = {}
    notified_fee_ids: List[int] = []
    # First voice-vendor error string from the run, if any call failed.
    # E.g. "Twilio API error (HTTP 400): The number ... is unverified."
    first_call_error: Optional[str] = None


class FeeReminderSettingsResponse(BaseModel):
    institution_id: int
    # One of: DISABLED, WEEKLY, MONTHLY, CUSTOM
    automation_mode: str
    day_of_week: Optional[int] = None   # 0..6 (Mon..Sun) — for WEEKLY
    day_of_month: Optional[int] = None  # 1..28 — for MONTHLY
    send_hour: int = 9
    timezone: str = "Asia/Kolkata"
    overdue_days: Optional[int] = None
    cooldown_days: Optional[int] = None
    voice_calls_enabled: bool = True
    last_run_at: Optional[datetime] = None
    last_run_triggered_by: Optional[str] = None
    # Defaults the UI shows as hints when overrides are NULL.
    effective_overdue_days: int
    effective_cooldown_days: int


class FeeReminderSettingsUpdate(BaseModel):
    automation_mode: Optional[str] = None
    day_of_week: Optional[int] = None
    day_of_month: Optional[int] = None
    send_hour: Optional[int] = None
    timezone: Optional[str] = None
    overdue_days: Optional[int] = None
    cooldown_days: Optional[int] = None
    voice_calls_enabled: Optional[bool] = None
