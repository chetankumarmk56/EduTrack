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
