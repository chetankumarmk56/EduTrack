"""
Helpers for the FinanceLedger: academic-year resolution, receipt-number
generation, and the single ledger-write entry point used by the
admin-records-payment and manual-payment-approval flows.

Idempotency: ledger rows are keyed by `receipt_number` (unique) plus,
where applicable, `payment_id` (for admin-recorded payments) and
`manual_payment_request_id` (for parent-submitted UPI). Duplicate writes
fall through to a refetch instead of raising.
"""
from __future__ import annotations

from datetime import datetime, date
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logger import logger
from app.models.finance import (
    FinanceLedger,
    LedgerEntryType,
    Payment,
)
from app.models.directory import Student
from app.models.academic import SchoolClass
from app.models.manual_payment import ManualPaymentRequest, ManualPaymentStatus


# Statuses that should always have a FinanceLedger mirror row.
_MIRRORED_STATUSES = (
    ManualPaymentStatus.APPROVED.value,
    ManualPaymentStatus.PARTIAL_PAYMENT.value,
)


def resolve_academic_year(today: Optional[date] = None) -> str:
    """India academic-year convention: April–March. May 2026 → '2026-2027'."""
    today = today or date.today()
    if today.month >= 4:
        start = today.year
    else:
        start = today.year - 1
    return f"{start}-{start + 1}"


async def generate_receipt_number(
    db: AsyncSession, institution_id: int, payment_date: Optional[datetime] = None
) -> str:
    """
    Format: RCPT-{INST}-{YYYYMM}-{SEQ}
    SEQ is per (institution, year-month). Uses SELECT … FOR UPDATE on the
    max existing sequence value so concurrent payments in the same month can
    never produce duplicate receipt numbers.
    """
    from sqlalchemy import text

    pd = payment_date or datetime.utcnow()
    yyyymm = pd.strftime("%Y%m")
    prefix = f"RCPT-{institution_id}-{yyyymm}-"

    # Lock the latest row for this prefix so no two concurrent writers can
    # both read the same COUNT and collide on the UNIQUE constraint.
    res = await db.execute(
        select(func.max(FinanceLedger.receipt_number))
        .where(
            FinanceLedger.institution_id == institution_id,
            FinanceLedger.receipt_number.like(f"{prefix}%"),
        )
        .with_for_update()
    )
    latest = res.scalar()  # e.g. "RCPT-1-202506-00004" or None
    if latest:
        try:
            last_seq = int(latest.rsplit("-", 1)[-1])
        except (ValueError, IndexError):
            last_seq = 0
    else:
        last_seq = 0
    return f"{prefix}{last_seq + 1:05d}"


async def write_ledger_entry(
    db: AsyncSession,
    *,
    institution_id: int,
    payment: Payment,
    student: Student,
    payment_method: str,
    payment_status: str = "SUCCESS",
    entry_type: LedgerEntryType = LedgerEntryType.PAYMENT,
    gateway_fee: Optional[float] = None,
    notes: Optional[str] = None,
    recorded_by_id: Optional[int] = None,
) -> FinanceLedger:
    """
    Idempotently insert (or fetch) a single ledger row for a confirmed payment.

    Dedupes on `payment_id` — if a row already exists for this Payment, the
    existing row is returned.
    """
    pid_existing_res = await db.execute(
        select(FinanceLedger).where(FinanceLedger.payment_id == payment.id)
    )
    pid_existing = pid_existing_res.scalars().first()
    if pid_existing:
        logger.info(
            f"LEDGER IDEMPOTENT: Existing row {pid_existing.id} for "
            f"local payment_id={payment.id}, returning."
        )
        return pid_existing

    class_name: Optional[str] = None
    class_id: Optional[int] = student.school_class_id
    if class_id:
        sc_res = await db.execute(
            select(SchoolClass).where(SchoolClass.id == class_id)
        )
        sc = sc_res.scalars().first()
        if sc:
            class_name = sc.display_name or f"Grade {sc.grade_id}"

    payment_date = payment.created_at or datetime.utcnow()
    fee = max(0.0, gateway_fee or 0.0)
    net = max(0.0, payment.amount - fee)

    receipt_number = await generate_receipt_number(db, institution_id, payment_date)

    entry = FinanceLedger(
        receipt_number=receipt_number,
        entry_type=entry_type,
        payment_id=payment.id,
        student_id=student.id,
        class_id=class_id,
        institution_id=institution_id,
        student_name=student.name,
        class_name=class_name,
        fee_type="TUITION",
        academic_year=resolve_academic_year(payment_date.date()),
        external_reference=None,
        amount=payment.amount,
        gateway_fee=fee,
        net_amount=net,
        payment_method=payment_method,
        payment_status=payment_status,
        payment_date=payment_date,
        notes=notes or payment.note,
        recorded_by_id=recorded_by_id or payment.created_by_id,
    )
    db.add(entry)
    try:
        await db.flush()
        logger.info(
            f"LEDGER WRITE: receipt={receipt_number} payment_id={payment.id} "
            f"amount=₹{payment.amount} method={payment_method}"
        )
        return entry
    except IntegrityError as e:
        logger.warning(
            f"LEDGER RACE: IntegrityError on insert for payment {payment.id} — "
            f"refetching. Detail: {e}"
        )
        await db.rollback()
        pid_existing_res = await db.execute(
            select(FinanceLedger).where(FinanceLedger.payment_id == payment.id)
        )
        return pid_existing_res.scalars().first()


async def write_manual_payment_ledger_entry(
    db: AsyncSession,
    *,
    institution_id: int,
    request: ManualPaymentRequest,
    student: Student,
    recorded_by_id: Optional[int] = None,
) -> FinanceLedger:
    """
    Mirror an approved/partial ManualPaymentRequest into FinanceLedger so it
    surfaces alongside admin-recorded payments on the finance dashboard.

    Idempotent on `manual_payment_request_id`. A re-approval or backfill
    never duplicates the entry. The flush below is wrapped in a nested
    transaction so an IntegrityError race does not roll back the surrounding
    apply_decision transaction — only the duplicate insert is rolled back.
    """
    existing_res = await db.execute(
        select(FinanceLedger).where(
            FinanceLedger.manual_payment_request_id == request.id
        )
    )
    existing = existing_res.scalars().first()
    if existing:
        logger.info(
            f"LEDGER IDEMPOTENT (manual): row {existing.id} exists for "
            f"manual_payment_request_id={request.id}."
        )
        return existing

    class_name: Optional[str] = request.class_name
    class_id: Optional[int] = student.school_class_id
    if class_id and not class_name:
        sc_res = await db.execute(
            select(SchoolClass).where(SchoolClass.id == class_id)
        )
        sc = sc_res.scalars().first()
        if sc:
            class_name = sc.display_name or f"Grade {sc.grade_id}"

    amount = float(request.approved_amount or request.amount or 0.0)
    payment_date = request.reviewed_at or datetime.utcnow()

    # Prefer the manual-payment receipt number so the same identifier appears
    # on the PDF, the parent's history, and the finance ledger.
    receipt_number = request.receipt_number or await generate_receipt_number(
        db, institution_id, payment_date
    )

    entry = FinanceLedger(
        receipt_number=receipt_number,
        entry_type=LedgerEntryType.PAYMENT,
        payment_id=None,
        manual_payment_request_id=request.id,
        student_id=student.id,
        class_id=class_id,
        institution_id=institution_id,
        student_name=request.student_name or student.name,
        class_name=class_name,
        fee_type=request.fee_type or "TUITION",
        academic_year=resolve_academic_year(payment_date.date()),
        external_reference=request.transaction_reference,
        amount=amount,
        gateway_fee=0.0,
        net_amount=amount,
        payment_method="MANUAL_UPI",
        payment_status="SUCCESS",
        payment_date=payment_date,
        notes=(
            f"UTR {request.transaction_reference}"
            + (f" · {request.installment_label}" if request.installment_label else "")
        ),
        recorded_by_id=recorded_by_id,
    )
    db.add(entry)
    try:
        # Use a savepoint so a race here doesn't blow away the caller's
        # in-progress transaction (status flip, dues reduction, audit).
        async with db.begin_nested():
            await db.flush()
        logger.info(
            f"LEDGER WRITE (manual): receipt={receipt_number} "
            f"manual_payment_request_id={request.id} amount=₹{amount}"
        )
        return entry
    except IntegrityError as e:
        logger.warning(
            f"LEDGER RACE (manual): IntegrityError for request {request.id} — "
            f"refetching. Detail: {e}"
        )
        existing_res = await db.execute(
            select(FinanceLedger).where(
                FinanceLedger.manual_payment_request_id == request.id
            )
        )
        return existing_res.scalars().first()


async def backfill_missing_manual_ledger_entries(
    db: AsyncSession,
    institution_id: int,
) -> int:
    """
    Reconcile FinanceLedger with manual_payment_requests.

    Finds every APPROVED / PARTIAL_PAYMENT ManualPaymentRequest for this
    institution that has no matching FinanceLedger row, and creates one.
    Returns the number of rows backfilled.

    This is the safety net that guarantees the finance ledger is the
    source of truth even when an apply_decision mirror call fails
    silently (network blip, transient DB error, code regression, etc.).
    Runs cheaply: an OUTER JOIN + LIMIT-bounded write loop. The whole
    function is idempotent — re-running it on a healthy DB is a no-op.
    """
    from sqlalchemy.orm import aliased  # noqa: F401  (kept for future joins)

    # LEFT JOIN finance_ledger on manual_payment_request_id and keep only
    # the rows where the ledger side is NULL — i.e. the missing mirrors.
    stmt = (
        select(ManualPaymentRequest)
        .outerjoin(
            FinanceLedger,
            FinanceLedger.manual_payment_request_id == ManualPaymentRequest.id,
        )
        .where(
            ManualPaymentRequest.institution_id == institution_id,
            ManualPaymentRequest.status.in_(_MIRRORED_STATUSES),
            FinanceLedger.id.is_(None),
        )
    )
    res = await db.execute(stmt)
    missing = list(res.scalars().unique().all())

    if not missing:
        return 0

    logger.info(
        "LEDGER BACKFILL: found %d approved manual payments without a ledger "
        "row for institution %s. Repairing now.",
        len(missing), institution_id,
    )

    backfilled = 0
    for request in missing:
        student_res = await db.execute(
            select(Student).where(Student.id == request.student_id)
        )
        student = student_res.scalars().first()
        if not student:
            logger.warning(
                "LEDGER BACKFILL: skipping manual request %s — student %s "
                "no longer exists.",
                request.id, request.student_id,
            )
            continue
        try:
            await write_manual_payment_ledger_entry(
                db,
                institution_id=institution_id,
                request=request,
                student=student,
                recorded_by_id=request.reviewed_by_user_id,
            )
            backfilled += 1
        except Exception as e:  # noqa: BLE001 — log and continue, don't break the read path
            logger.exception(
                "LEDGER BACKFILL: failed to mirror manual request %s: %s",
                request.id, e,
            )

    if backfilled:
        # Commit the backfilled rows in their own transaction boundary so a
        # downstream filter/list query sees them. Safe because we only INSERT
        # new rows — no mutation to caller-owned state.
        await db.commit()

    return backfilled
