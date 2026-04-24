from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, Header
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from datetime import datetime

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_payment_admin, UserContext
from app.schemas.finance import (
    StudentDuesResponse, PaymentResponse, PaginatedPaymentResponse,
    PaymentCreate, OrderCreate, OrderResponse, PaymentVerify, PaymentVerifyResponse,
    ManualPaymentCreate, ManualPaymentResponse, FinanceSummaryResponse, DefaulterResponse
)
from app.services.finance_service import finance_service
from app.models.directory import Student, Parent

router = APIRouter(prefix="/api/finance", tags=["Finance & Payments"])

async def ensure_student_access(user: UserContext, student_id: int, db: AsyncSession):
    """
    Helper to ensure the current user (Student or Parent) has access to a specific student record.
    Admins and Finance roles bypass this check.
    """
    if user.role in ["super_admin", "admin", "finance"]:
        return True
    
    # Identity-based and Relationship-based access
    from app.models.directory import Student, Parent
    
    # Check 1: User is the student (direct account or shared with parent)
    auth_stmt = select(Student).where(Student.user_id == user.id, Student.id == student_id)
    auth_res = await db.execute(auth_stmt)
    if auth_res.scalars().first():
        return True
        
    # Check 2: User is a parent linked to this student
    if user.role == "parent":
        # Find if this user_id belongs to a parent record
        p_stmt = select(Parent).where(Parent.user_id == user.id)
        p_res = await db.execute(p_stmt)
        parent = p_res.scalars().first()
        
        if parent:
            # Check if student is a ward of this parent
            s_stmt = select(Student).where(Student.id == student_id, Student.parent_id == parent.id)
            s_res = await db.execute(s_stmt)
            if s_res.scalars().first():
                return True
                
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN, 
        detail="Access denied to student records. You must be the student or their registered parent."
    )
    
    return True

@router.get("/students/{student_id}/dues", response_model=StudentDuesResponse)
async def get_student_dues(
    student_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    """
    View total and category-wise dues for a student.
    Accessible by Admin/Finance or the Student/Parent themselves.
    """
    await ensure_student_access(user, student_id, db)
    
    dues = await finance_service.get_student_dues(db, user.institution_id, student_id)
    if not dues:
        raise HTTPException(status_code=404, detail="Student dues record not found.")
    return dues

@router.get("/payments/student/{student_id}", response_model=List[PaymentResponse])
async def get_student_payments(
    student_id: int,
    skip: int = 0,
    limit: int = Query(100, le=100),
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    """
    List historical payments for a specific student.
    Accessible by Admin/Finance or the Student/Parent themselves.
    """
    await ensure_student_access(user, student_id, db)
    
    return await finance_service.get_student_payments(db, user.institution_id, student_id, skip, limit)

@router.get("/payments", response_model=PaginatedPaymentResponse)
async def get_all_payments(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    mode: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = Query(20, le=100),
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_payment_admin)
):
    """
    Institutional payment list with advanced filtering.
    Restricted to Admin and Finance roles.
    """
    items, total = await finance_service.get_all_payments(
        db, user.institution_id, date_from, date_to, mode, status, skip, limit
    )
    
    return {
        "total": total,
        "offset": skip,
        "limit": limit,
        "items": items
    }

@router.post("/payments/create-order", response_model=OrderResponse)
async def create_payment_order(
    order_in: OrderCreate,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    """
    Initialize an online payment by creating a Razorpay order.
    The payment will be saved in PENDING state.
    """
    await ensure_student_access(user, order_in.student_id, db)
    
    try:
        order_data = await finance_service.create_razorpay_order(
            db, user.institution_id, order_in.student_id, order_in.amount, user.id
        )
        return order_data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("/payments/verify", response_model=PaymentVerifyResponse)
async def verify_payment(
    verify_in: PaymentVerify,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    """
    Verify a Razorpay payment signature and update transaction status.
    """
    success = await finance_service.verify_razorpay_payment(
        db, user.institution_id, 
        verify_in.razorpay_order_id, 
        verify_in.razorpay_payment_id, 
        verify_in.razorpay_signature
    )
    
    if success:
        return {
            "status": "SUCCESS",
            "message": "Payment verified and recorded."
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment verification failed. Invalid signature."
        )

@router.post("/payments/manual", response_model=ManualPaymentResponse)
async def create_manual_payment(
    payment_in: ManualPaymentCreate,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin)
):
    """
    Record a manual (Cash/Manual UPI) payment.
    Restricted to Finance and Admin roles.
    """
    try:
        # Record and allocate
        payment = await finance_service.record_manual_payment(
            db, 
            admin.institution_id, 
            payment_in.student_id, 
            payment_in.amount, 
            payment_in.mode, 
            payment_in.note, 
            admin.id
        )
        
        return {
            "payment": payment,
            "allocations": payment.allocations
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/summary", response_model=FinanceSummaryResponse)
async def get_finance_dashboard_summary(
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin)
):
    """
    Get high-level institutional finance summary.
    """
    return await finance_service.get_finance_summary(db, admin.institution_id)

@router.get("/defaulters", response_model=List[DefaulterResponse])
async def get_institutional_defaulters(
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin)
):
    """
    Get an optimized list of students with outstanding dues.
    """
    return await finance_service.get_defaulters(db, admin.institution_id)

@router.post("/payments/webhook")
async def razorpay_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_razorpay_signature: str = Header(None)
):
    """
    Public webhook endpoint for Razorpay notifications.
    Uses signature verification instead of standard JWT auth.
    """
    if not x_razorpay_signature:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing Razorpay signature header."
        )

    # Capture raw body for signature verification
    raw_body = await request.body()
    
    success = await finance_service.handle_razorpay_webhook(
        db, raw_body, x_razorpay_signature
    )
    
    if success:
        return {"status": "ok"}
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Webhook processing failed or invalid signature."
        )
