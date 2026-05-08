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
    ManualPaymentCreate, ManualPaymentResponse, FinanceSummaryResponse, DefaulterResponse,
    ParentFeeResponse, ClassFinanceBreakdownResponse, PaymentCancel
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

@router.get("/my-dues")
async def get_my_dues(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    """
    Auto-resolves the current user's dues.
    Handles three cases:
      1. role='student': direct student lookup by user_id
      2. role='parent' + Parent record exists: show all children's dues
      3. role='parent' + No Parent record (student using family portal): fall back to student lookup
    """
    if user.role == "parent":
        # Try to find an actual parent profile first
        parent_res = await db.execute(
            select(Parent).where(Parent.user_id == user.id, Parent.institution_id == user.institution_id)
        )
        parent = parent_res.scalars().first()

        if parent:
            # Real parent user — return all children's dues
            children_res = await db.execute(
                select(Student).where(
                    Student.parent_id == parent.id,
                    Student.institution_id == user.institution_id
                )
            )
            children = children_res.scalars().all()
            child_ids = [c.id for c in children]
            return await finance_service.get_students_dues_bulk(
                db, user.institution_id, child_ids
            )

    # Student path (role='student' OR role='parent' with no Parent record)
    student_res = await db.execute(
        select(Student).where(
            Student.user_id == user.id,
            Student.institution_id == user.institution_id
        )
    )
    student = student_res.scalars().first()

    if not student:
        # Last resort: sub might be student.id instead of user_id
        student_res2 = await db.execute(
            select(Student).where(
                Student.id == user.id,
                Student.institution_id == user.institution_id
            )
        )
        student = student_res2.scalars().first()

    if not student:
        return []

    dues = await finance_service.get_student_dues(db, user.institution_id, student.id)
    return [dues] if dues else []


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
    
    # Enrich with student names
    student_ids = list({p.student_id for p in items})
    names_map = {}
    if student_ids:
        names_res = await db.execute(select(Student.id, Student.name).where(Student.id.in_(student_ids)))
        names_map = {row[0]: row[1] for row in names_res.all()}
    
    # Attach student_name to each item as a dict (since PaymentResponse doesn't have it)
    enriched = []
    for p in items:
        p_dict = {
            "id": p.id,
            "student_id": p.student_id,
            "student_name": names_map.get(p.student_id, f"Scholar #{p.student_id}"),
            "amount": p.amount,
            "payment_mode": p.payment_mode,
            "status": p.status,
            "razorpay_order_id": p.razorpay_order_id,
            "note": p.note,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "created_by_id": p.created_by_id,
            "allocations": [{"id": a.id, "payment_id": a.payment_id, "fee_type": a.fee_type, "allocated_amount": a.allocated_amount} for a in (p.allocations or [])]
        }
        enriched.append(p_dict)
    
    return {
        "total": total,
        "offset": skip,
        "limit": limit,
        "items": enriched
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

@router.post("/payments/cancel")
async def cancel_payment(
    cancel_in: PaymentCancel,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    """
    Mark a pending payment as CANCELLED.
    """
    success = await finance_service.cancel_razorpay_order(
        db, user.institution_id, 
        cancel_in.razorpay_order_id,
        cancel_in.student_id
    )
    
    if success:
        return {"status": "CANCELLED", "message": "Payment cancelled."}
    else:
        return {"status": "ERROR", "message": "Could not cancel payment."}

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

@router.get("/class-breakdown", response_model=ClassFinanceBreakdownResponse)
async def get_class_finance_breakdown(
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin)
):
    """
    Per-class financial breakdown showing:
    - Fee per student for each class
    - Total students enrolled
    - Counts of PAID / PARTIAL / UNPAID / NO-RECORD students
    - Total expected, collected, and pending amounts per class
    - Grand totals across all classes
    """
    return await finance_service.get_class_finance_breakdown(db, admin.institution_id)


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

@router.post("/backfill-fees", status_code=200)
async def backfill_student_fees(
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin)
):
    """
    Admin action: Re-sync StudentFee records for ALL active students in the institution.
    
    Fixes students who:
    - Were enrolled when their class had fee = 0 (StudentFee exists but total_amount = 0)
    - Were enrolled before _sync_student_fee was implemented (no StudentFee record at all)
    
    Safe to run multiple times (idempotent).
    """
    from app.models.directory import Student
    from app.models.academic import SchoolClass, Grade

    # Fetch all active students
    students_res = await db.execute(
        select(Student).where(
            Student.institution_id == admin.institution_id,
            Student.is_active == True,
            Student.school_class_id != None
        )
    )
    students = students_res.scalars().all()

    created = 0
    updated = 0
    skipped = 0

    for student in students:
        # Resolve fee amount (3-layer fallback, same as _sync_student_fee)
        class_res = await db.execute(select(SchoolClass).where(SchoolClass.id == student.school_class_id))
        school_class = class_res.scalars().first()
        if not school_class:
            skipped += 1
            continue

        total_amount = school_class.total_fee or school_class.tuition_fee or 0.0
        due_date = school_class.fee_due_date

        if total_amount == 0.0:
            grade_res = await db.execute(select(Grade).where(Grade.id == school_class.grade_id))
            grade = grade_res.scalars().first()
            if grade:
                total_amount = grade.tuition_fee or 0.0
                if not due_date:
                    due_date = grade.fee_due_date
                if total_amount > 0:
                    school_class.total_fee = total_amount
                    school_class.tuition_fee = total_amount

        if total_amount == 0.0:
            skipped += 1
            continue

        # Check existing
        from app.models.finance import StudentFee, StudentFeeStatus
        from datetime import date as date_type
        existing_res = await db.execute(
            select(StudentFee).where(
                StudentFee.student_id == student.id,
                StudentFee.class_id == student.school_class_id
            )
        )
        existing = existing_res.scalars().first()

        if existing:
            if existing.total_amount != total_amount:
                existing.total_amount = total_amount
                existing.due_amount = max(0.0, total_amount - existing.amount_paid)
                if existing.due_amount <= 0:
                    existing.status = StudentFeeStatus.PAID
                elif existing.amount_paid > 0:
                    existing.status = StudentFeeStatus.PARTIAL
                else:
                    existing.status = StudentFeeStatus.UNPAID
                if due_date:
                    existing.due_date = due_date
                updated += 1
            else:
                skipped += 1
        else:
            new_fee = StudentFee(
                student_id=student.id,
                class_id=student.school_class_id,
                institution_id=admin.institution_id,
                total_amount=total_amount,
                due_amount=total_amount,
                amount_paid=0.0,
                due_date=due_date if due_date else date_type.today(),
                status=StudentFeeStatus.UNPAID
            )
            db.add(new_fee)
            created += 1

    await db.commit()

    return {
        "status": "ok",
        "message": f"Backfill complete: {created} created, {updated} updated, {skipped} skipped (no class fee defined).",
        "created": created,
        "updated": updated,
        "skipped": skipped
    }

