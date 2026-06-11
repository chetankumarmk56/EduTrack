from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from datetime import datetime, date
import io

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_payment_admin, UserContext
from app.schemas.finance import (
    StudentDuesResponse, PaymentResponse, PaginatedPaymentResponse,
    ManualPaymentCreate, ManualPaymentResponse, FinanceSummaryResponse, DefaulterResponse,
    ArrearsStudentResponse,
    ClassFinanceBreakdownResponse,
    LedgerEntryResponse, PaginatedLedgerResponse, LedgerSummary,
    FeeReminderPreviewResponse, FeeReminderEligibleRow,
    FeeReminderDispatchSummary, FeeReminderSettingsResponse,
    FeeReminderSettingsUpdate,
)
from app.services.finance import finance_service
from app.services.finance.ledger_service import (
    normalise_date_range, export_csv, export_excel, export_pdf,
)
from app.models.directory import Student, Parent

router = APIRouter(prefix="/api/finance", tags=["Finance & Payments"])


async def ensure_student_access(user: UserContext, student_id: int, db: AsyncSession):
    """
    Ensure the current user (Student or Parent) has access to a specific student.
    Admins and Finance roles bypass this check.
    """
    if user.role in ["super_admin", "admin", "finance"]:
        return True

    auth_stmt = select(Student).where(Student.user_id == user.id, Student.id == student_id)
    auth_res = await db.execute(auth_stmt)
    if auth_res.scalars().first():
        return True

    if user.role == "parent":
        p_stmt = select(Parent).where(Parent.user_id == user.id)
        p_res = await db.execute(p_stmt)
        parent = p_res.scalars().first()
        if parent:
            s_stmt = select(Student).where(Student.id == student_id, Student.parent_id == parent.id)
            s_res = await db.execute(s_stmt)
            if s_res.scalars().first():
                return True

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied to student records. You must be the student or their registered parent."
    )


@router.get("/my-dues")
async def get_my_dues(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    """
    Auto-resolves the current user's dues.
      1. role='student': direct student lookup by user_id
      2. role='parent' + Parent record exists: show all children's dues
      3. role='parent' + No Parent record (family-portal): fall back to student lookup
    """
    if user.role == "parent":
        parent_res = await db.execute(
            select(Parent).where(Parent.user_id == user.id, Parent.institution_id == user.institution_id)
        )
        parent = parent_res.scalars().first()

        if parent:
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

    student_res = await db.execute(
        select(Student).where(
            Student.user_id == user.id,
            Student.institution_id == user.institution_id
        )
    )
    student = student_res.scalars().first()

    if not student:
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
    """View total and category-wise dues for a student."""
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
    """List historical payments for a specific student."""
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
    """Institutional payment list with filtering. Admin / Finance only."""
    items, total = await finance_service.get_all_payments(
        db, user.institution_id, date_from, date_to, mode, status, skip, limit
    )

    student_ids = list({p.student_id for p in items})
    names_map = {}
    if student_ids:
        names_res = await db.execute(select(Student.id, Student.name).where(Student.id.in_(student_ids)))
        names_map = {row[0]: row[1] for row in names_res.all()}

    enriched = []
    for p in items:
        enriched.append({
            "id": p.id,
            "student_id": p.student_id,
            "student_name": names_map.get(p.student_id, f"Scholar #{p.student_id}"),
            "amount": p.amount,
            "payment_mode": p.payment_mode,
            "status": p.status,
            "note": p.note,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "created_by_id": p.created_by_id,
            "allocations": [
                {
                    "id": a.id, "payment_id": a.payment_id,
                    "fee_type": a.fee_type, "allocated_amount": a.allocated_amount,
                }
                for a in (p.allocations or [])
            ],
        })

    return {"total": total, "offset": skip, "limit": limit, "items": enriched}


@router.post("/payments/manual", response_model=ManualPaymentResponse)
async def create_manual_payment(
    payment_in: ManualPaymentCreate,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin)
):
    """
    Record an admin-side manual payment (Cash / Manual UPI) directly into the
    finance ledger. Used by the Finance dashboard "Record Payment" action.
    Parents submit their own UPI payments through /api/manual-payments.
    """
    try:
        payment = await finance_service.record_manual_payment(
            db,
            admin.institution_id,
            payment_in.student_id,
            payment_in.amount,
            payment_in.mode,
            payment_in.note,
            admin.id
        )
        return {"payment": payment, "allocations": payment.allocations}
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
    """High-level institutional finance summary."""
    return await finance_service.get_finance_summary(db, admin.institution_id)


@router.get("/class-breakdown", response_model=ClassFinanceBreakdownResponse)
async def get_class_finance_breakdown(
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin)
):
    """Per-class financial breakdown."""
    return await finance_service.get_class_finance_breakdown(db, admin.institution_id)


@router.get("/defaulters", response_model=List[DefaulterResponse])
async def get_institutional_defaulters(
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin)
):
    """Optimized list of students with outstanding dues."""
    return await finance_service.get_defaulters(db, admin.institution_id)


@router.get("/arrears", response_model=List[ArrearsStudentResponse])
async def get_institutional_arrears(
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin)
):
    """Students carrying unpaid fees from a previous (non-active) academic year."""
    return await finance_service.get_institutional_arrears(db, admin.institution_id)


@router.post("/backfill-fees", status_code=200)
async def backfill_student_fees(
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin)
):
    """
    Admin action: Re-sync StudentFee records for ALL active students in the institution.
    Safe to run multiple times (idempotent).
    """
    from app.models.directory import Student
    from app.models.academic import SchoolClass, Grade

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


# --- Finance Ledger Endpoints (Admin / Finance only) ---

_VALID_STATUSES = {
    "SUCCESS", "FAILED", "PENDING", "REFUNDED", "CANCELLED",
    "PARTIALLY_REFUNDED",
}
_VALID_METHODS = {"UPI", "CASH", "MANUAL_UPI"}
_VALID_FEE_TYPES = {"TUITION", "SPORTS"}


def _parse_filters(
    payment_status: Optional[str],
    payment_method: Optional[str],
    fee_type: Optional[str],
) -> dict:
    if payment_status and payment_status.upper() not in _VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid payment_status. Allowed: {sorted(_VALID_STATUSES)}",
        )
    if payment_method and payment_method.upper() not in _VALID_METHODS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid payment_method. Allowed: {sorted(_VALID_METHODS)}",
        )
    if fee_type and fee_type.upper() not in _VALID_FEE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid fee_type. Allowed: {sorted(_VALID_FEE_TYPES)}",
        )
    return {
        "payment_status": payment_status.upper() if payment_status else None,
        "payment_method": payment_method.upper() if payment_method else None,
        "fee_type": fee_type.upper() if fee_type else None,
    }


@router.get("/ledger", response_model=PaginatedLedgerResponse)
async def list_ledger(
    date_from: Optional[date] = Query(None, description="Inclusive start date (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="Inclusive end date (YYYY-MM-DD)"),
    student_id: Optional[int] = None,
    class_id: Optional[int] = None,
    fee_type: Optional[str] = None,
    payment_status: Optional[str] = None,
    payment_method: Optional[str] = None,
    academic_year: Optional[str] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    search: Optional[str] = Query(None, description="Match student name, receipt #, or UTR"),
    skip: int = 0,
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin),
):
    """Paginated finance ledger entries with filters + summary cards."""
    filters = _parse_filters(payment_status, payment_method, fee_type)

    df_dt = datetime.combine(date_from, datetime.min.time()) if date_from else None
    dt_dt = datetime.combine(date_to, datetime.max.time()) if date_to else None
    if df_dt and dt_dt and dt_dt < df_dt:
        raise HTTPException(status_code=400, detail="date_to must be >= date_from")

    base_filters = dict(
        date_from=df_dt,
        date_to=dt_dt,
        student_id=student_id,
        class_id=class_id,
        academic_year=academic_year,
        min_amount=min_amount,
        max_amount=max_amount,
        search=search,
        **filters,
    )

    items, total = await finance_service.list_ledger_entries(
        db, admin.institution_id, skip=skip, limit=limit, **base_filters
    )
    summary = await finance_service.get_ledger_summary(
        db, admin.institution_id, **base_filters
    )

    rows = [
        LedgerEntryResponse(
            **e,
            admission_number=f"STU{e['student_id']:05d}",
        )
        for e in items
    ]

    return PaginatedLedgerResponse(
        total=total,
        offset=skip,
        limit=limit,
        summary=summary,
        items=rows,
    )


@router.get("/ledger/summary", response_model=LedgerSummary)
async def get_ledger_summary_cards(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    academic_year: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin),
):
    """Summary cards: collected / pending / failed / refunded / count."""
    df_dt = datetime.combine(date_from, datetime.min.time()) if date_from else None
    dt_dt = datetime.combine(date_to, datetime.max.time()) if date_to else None
    return await finance_service.get_ledger_summary(
        db,
        admin.institution_id,
        date_from=df_dt,
        date_to=dt_dt,
        academic_year=academic_year,
    )


@router.get("/ledger/filters")
async def get_ledger_filter_options(
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin),
):
    """Dynamic filter options for the admin ledger UI."""
    return await finance_service.get_ledger_facets(db, admin.institution_id)


@router.post("/ledger/sync-manual-payments")
async def sync_manual_payments_to_ledger(
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin),
):
    """
    Force-reconcile FinanceLedger with manual_payment_requests.

    Manually fires the same backfill that runs automatically on every
    ledger / summary read. Useful for ops verification and for one-off
    repairs without waiting for the next dashboard load.
    """
    from app.services.finance.ledger_helpers import (
        backfill_missing_manual_ledger_entries,
    )
    backfilled = await backfill_missing_manual_ledger_entries(
        db, admin.institution_id,
    )
    return {
        "status": "ok",
        "backfilled": backfilled,
        "message": (
            f"Created {backfilled} missing finance-ledger row(s) "
            "from approved manual payments."
        ),
    }


@router.get("/ledger/{ledger_id}/receipt")
async def download_ledger_receipt(
    ledger_id: int,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin),
):
    """
    Stream a PDF receipt for a successful FinanceLedger entry.

    Routing:
      * Entries mirrored from the manual-payment workflow render the same
        receipt the parent sees (richer template, includes UTR + payer
        details).
      * Other SUCCESS entries (admin-recorded cash / manual UPI) get a
        compact on-the-fly receipt built from the ledger row itself.
    """
    from app.models.finance import FinanceLedger
    from app.models.core import Institution
    from app.models.manual_payment import ManualPaymentRequest
    from app.services.manual_payment.receipt import generate_receipt_pdf_bytes
    from app.services.manual_payment.service import manual_payment_service

    res = await db.execute(
        select(FinanceLedger).where(
            FinanceLedger.id == ledger_id,
            FinanceLedger.institution_id == admin.institution_id,
        )
    )
    entry = res.scalars().first()
    if not entry:
        raise HTTPException(status_code=404, detail="Ledger entry not found.")
    if entry.payment_status != "SUCCESS":
        raise HTTPException(
            status_code=409,
            detail="Receipts are only available for successful payments.",
        )

    inst_res = await db.execute(
        select(Institution.name).where(Institution.id == entry.institution_id)
    )
    school_name = inst_res.scalar() or "Your School"

    if entry.manual_payment_request_id:
        mp_res = await db.execute(
            select(ManualPaymentRequest).where(
                ManualPaymentRequest.id == entry.manual_payment_request_id,
                ManualPaymentRequest.institution_id == admin.institution_id,
            )
        )
        mp = mp_res.scalars().first()
        if not mp:
            raise HTTPException(
                status_code=404,
                detail="Linked manual payment record is missing.",
            )
        balance = await manual_payment_service.get_balance_due(
            db, institution_id=admin.institution_id, student_id=mp.student_id,
        )
        pdf_bytes = generate_receipt_pdf_bytes(
            school_name=school_name,
            payment_request=mp,
            balance_due=balance,
            verified_by_name=admin.name,
        )
        filename = f"{entry.receipt_number or f'MR-{mp.id}'}.pdf"
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    class _LedgerReceiptStub:
        pass

    stub = _LedgerReceiptStub()
    stub.id = entry.id
    stub.institution_id = entry.institution_id
    stub.receipt_number = entry.receipt_number
    stub.student_name = entry.student_name
    stub.parent_name = "—"
    stub.class_name = entry.class_name
    stub.section_name = None
    stub.fee_type = entry.fee_type or "TUITION"
    stub.installment_label = None
    stub.amount = float(entry.amount or 0.0)
    stub.approved_amount = float(entry.amount or 0.0)
    stub.transaction_reference = entry.external_reference or "—"
    stub.transaction_at = entry.payment_date
    stub.payer_name = None
    stub.payer_upi = None
    stub.status = entry.payment_status
    stub.reviewed_at = entry.payment_date
    stub.receipt_generated_at = entry.payment_date

    pdf_bytes = generate_receipt_pdf_bytes(
        school_name=school_name,
        payment_request=stub,  # type: ignore[arg-type]
        balance_due=None,
        verified_by_name=admin.name,
    )
    filename = f"{entry.receipt_number}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/ledger/export")
async def export_ledger(
    date_from: date = Query(..., description="Inclusive start date (YYYY-MM-DD)"),
    date_to: date = Query(..., description="Inclusive end date (YYYY-MM-DD)"),
    format: str = Query("excel", pattern="^(excel|csv|pdf)$"),
    student_id: Optional[int] = None,
    class_id: Optional[int] = None,
    fee_type: Optional[str] = None,
    payment_status: Optional[str] = None,
    payment_method: Optional[str] = None,
    academic_year: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin),
):
    """Export the finance ledger for an inclusive date range."""
    try:
        start_dt, end_dt = normalise_date_range(date_from, date_to)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if (date_to - date_from).days > 366 * 2:
        raise HTTPException(
            status_code=400,
            detail="Date range too large (max 24 months). Please narrow the range.",
        )

    filters = _parse_filters(payment_status, payment_method, fee_type)

    entries = await finance_service.fetch_ledger_for_export(
        db,
        admin.institution_id,
        date_from=start_dt,
        date_to=end_dt,
        student_id=student_id,
        class_id=class_id,
        academic_year=academic_year,
        **filters,
    )

    fname_base = f"finance-ledger_{date_from.isoformat()}_{date_to.isoformat()}"

    if format == "csv":
        payload = export_csv(entries, date_from, date_to)
        return StreamingResponse(
            io.BytesIO(payload),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{fname_base}.csv"'},
        )

    if format == "pdf":
        try:
            payload = export_pdf(entries, date_from, date_to)
        except RuntimeError as e:
            raise HTTPException(status_code=500, detail=str(e))
        return StreamingResponse(
            io.BytesIO(payload),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{fname_base}.pdf"'},
        )

    try:
        payload = export_excel(entries, date_from, date_to)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return StreamingResponse(
        io.BytesIO(payload),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname_base}.xlsx"'},
    )


# ─── Fee reminders (admin-controlled) ─────────────────────────────────────
#
# Reminder dispatch is admin-triggered by default. The optional automation
# loop lives in fee_reminder_scheduler.py and only fires when an admin has
# explicitly switched their institution to WEEKLY / MONTHLY via the
# settings endpoint below. No request here ever needs a Wednesday gate.

_VALID_AUTOMATION_MODES = {"DISABLED", "WEEKLY", "MONTHLY", "CUSTOM"}


def _settings_to_response(s, *, effective_overdue: int, effective_cooldown: int) -> FeeReminderSettingsResponse:
    return FeeReminderSettingsResponse(
        institution_id=s.institution_id,
        automation_mode=s.automation_mode,
        day_of_week=s.day_of_week,
        day_of_month=s.day_of_month,
        send_hour=s.send_hour,
        timezone=s.timezone,
        overdue_days=s.overdue_days,
        cooldown_days=s.cooldown_days,
        voice_calls_enabled=bool(s.voice_calls_enabled),
        last_run_at=s.last_run_at,
        last_run_triggered_by=s.last_run_triggered_by,
        effective_overdue_days=effective_overdue,
        effective_cooldown_days=effective_cooldown,
    )


@router.get("/fee-reminders/settings", response_model=FeeReminderSettingsResponse)
async def get_fee_reminder_settings(
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin),
):
    """
    Read this institution's fee-reminder automation settings. Lazily
    creates a DISABLED row the first time the page is opened.
    """
    from app.services.finance.fee_reminder_service import fee_reminder_service
    s = await fee_reminder_service.get_or_create_settings(db, admin.institution_id)
    return _settings_to_response(
        s,
        effective_overdue=fee_reminder_service._effective_overdue_days(s),
        effective_cooldown=fee_reminder_service._effective_cooldown_days(s),
    )


@router.put("/fee-reminders/settings", response_model=FeeReminderSettingsResponse)
async def update_fee_reminder_settings(
    payload: FeeReminderSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin),
):
    """
    Update automation mode / schedule / overrides. Validation is strict:
    WEEKLY requires day_of_week, MONTHLY requires day_of_month, etc.
    """
    from app.services.finance.fee_reminder_service import fee_reminder_service

    if payload.automation_mode is not None:
        mode = payload.automation_mode.upper()
        if mode not in _VALID_AUTOMATION_MODES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid automation_mode. Allowed: {sorted(_VALID_AUTOMATION_MODES)}",
            )
        payload.automation_mode = mode

    if payload.day_of_week is not None and not (0 <= payload.day_of_week <= 6):
        raise HTTPException(status_code=400, detail="day_of_week must be 0..6 (Mon..Sun).")
    if payload.day_of_month is not None and not (1 <= payload.day_of_month <= 28):
        raise HTTPException(status_code=400, detail="day_of_month must be 1..28 (capped so Feb fires).")
    if payload.send_hour is not None and not (0 <= payload.send_hour <= 23):
        raise HTTPException(status_code=400, detail="send_hour must be 0..23.")
    if payload.overdue_days is not None and payload.overdue_days < 0:
        raise HTTPException(status_code=400, detail="overdue_days must be >= 0.")
    if payload.cooldown_days is not None and payload.cooldown_days < 0:
        raise HTTPException(status_code=400, detail="cooldown_days must be >= 0.")
    if payload.timezone is not None:
        try:
            import zoneinfo
            zoneinfo.ZoneInfo(payload.timezone)
        except (zoneinfo.ZoneInfoNotFoundError, KeyError, Exception):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid timezone '{payload.timezone}'. Use an IANA name such as 'Asia/Kolkata'.",
            )

    s = await fee_reminder_service.get_or_create_settings(db, admin.institution_id)

    if payload.automation_mode is not None:
        if payload.automation_mode == "WEEKLY":
            target_dow = payload.day_of_week if payload.day_of_week is not None else s.day_of_week
            if target_dow is None:
                raise HTTPException(
                    status_code=400,
                    detail="WEEKLY automation requires day_of_week (0..6).",
                )
        if payload.automation_mode == "MONTHLY":
            target_dom = payload.day_of_month if payload.day_of_month is not None else s.day_of_month
            if target_dom is None:
                raise HTTPException(
                    status_code=400,
                    detail="MONTHLY automation requires day_of_month (1..28).",
                )

    for field in (
        "automation_mode", "day_of_week", "day_of_month", "send_hour",
        "timezone", "overdue_days", "cooldown_days", "voice_calls_enabled",
    ):
        val = getattr(payload, field)
        if val is not None:
            setattr(s, field, val)
    s.updated_by_user_id = admin.id

    await db.commit()
    await db.refresh(s)
    return _settings_to_response(
        s,
        effective_overdue=fee_reminder_service._effective_overdue_days(s),
        effective_cooldown=fee_reminder_service._effective_cooldown_days(s),
    )


@router.get("/fee-reminders/preview", response_model=FeeReminderPreviewResponse)
async def preview_fee_reminders(
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin),
):
    """
    List every overdue, unpaid fee for this institution, tagged with
    whether it would actually be notified on the next dispatch.

    Aggregate counts split the population:
      - `overdue_*`        : full visible list (admin's situational awareness)
      - `eligible_*`       : the subset that the next click-to-send would notify
      - `in_cooldown_count`: silenced by `last_notified_at + cooldown_days`
      - `no_login_count`   : student has no parent/student login — admin must
                             link a User before any push can reach them
    """
    from app.services.finance.fee_reminder_service import fee_reminder_service
    rows = await fee_reminder_service.preview_eligible(
        db, institution_id=admin.institution_id,
    )
    eligible_rows = [r for r in rows if r.eligible_now]
    in_cooldown = sum(1 for r in rows if r.in_cooldown)
    no_login = sum(1 for r in rows if not r.has_login_target and not r.in_cooldown)
    return FeeReminderPreviewResponse(
        overdue_count=len(rows),
        overdue_unique_students=len({r.student_id for r in rows}),
        overdue_total_due=sum(r.due_amount for r in rows),
        eligible_count=len(eligible_rows),
        unique_students=len({r.student_id for r in eligible_rows}),
        total_due_amount=sum(r.due_amount for r in eligible_rows),
        in_cooldown_count=in_cooldown,
        no_login_count=no_login,
        rows=[FeeReminderEligibleRow(**r.__dict__) for r in rows],
    )


@router.post("/fee-reminders/dispatch", response_model=FeeReminderDispatchSummary)
async def dispatch_fee_reminders(
    dry_run: bool = Query(False, description="Compute eligibility but don't push or bump last_notified_at"),
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin),
):
    """
    Send fee reminders for the admin's institution NOW.

    This is the click-to-send endpoint behind the Finance dashboard's
    "Send Fee Reminders" button. Eligibility, cooldown, and lock semantics
    are unchanged from the previous cron flow — only the trigger changed.
    """
    from app.services.finance.fee_reminder_service import fee_reminder_service
    from app.core.logger import logger

    logger.info(
        "[fee-reminder] dispatch triggered by user=%s institution=%s (dry_run=%s)",
        admin.id, admin.institution_id, dry_run,
    )
    summary = await fee_reminder_service.dispatch_due_reminders(
        db,
        institution_id=admin.institution_id,
        triggered_by="manual",
        dry_run=dry_run,
    )
    return FeeReminderDispatchSummary(**summary.as_dict())
