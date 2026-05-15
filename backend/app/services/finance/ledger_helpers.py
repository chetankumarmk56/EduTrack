"""
Helpers for the FinanceLedger: academic-year resolution, receipt-number
generation, and a single ledger-write entry point used by the verify,
webhook, and manual-payment flows.

Idempotency strategy — a ledger row is keyed by *both*:
  1. razorpay_payment_id  (gateway-side dedupe; NULL for manual entries)
  2. receipt_number       (human-facing unique receipt)

So if both the frontend verify call and the webhook arrive, only one row
survives the unique constraints; the second insert is detected and the
existing row is returned instead.
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


# Razorpay charges (rough): 2% on UPI/cards. Used only when the gateway
# does not include a fee in the webhook payload. We never block on this.
DEFAULT_GATEWAY_FEE_RATE = 0.02


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
    SEQ is per (institution, year-month), zero-padded. Reads MAX from existing
    rows so it stays monotonic even after manual entries.
    """
    pd = payment_date or datetime.utcnow()
    yyyymm = pd.strftime("%Y%m")
    prefix = f"RCPT-{institution_id}-{yyyymm}-"

    res = await db.execute(
        select(func.count(FinanceLedger.id)).where(
            FinanceLedger.institution_id == institution_id,
            FinanceLedger.receipt_number.like(f"{prefix}%"),
        )
    )
    count = res.scalar() or 0
    return f"{prefix}{count + 1:05d}"


def _estimate_gateway_fee(amount: float, payment_method: str) -> tuple[float, float]:
    """
    Rough cost estimate when the gateway didn't supply a `fee` field.
    Returns (gateway_fee, net_amount). Manual/cash payments incur no fee.
    """
    if payment_method in {"CASH", "MANUAL_UPI"}:
        return 0.0, amount
    fee = round(amount * DEFAULT_GATEWAY_FEE_RATE, 2)
    return fee, max(0.0, amount - fee)


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

    Look-up order:
      1. razorpay_payment_id (if present) — catches webhook-vs-verify races.
      2. payment_id           — catches manual-payment double-clicks.

    Returns the existing row when a duplicate is detected; never raises on
    legitimate dedupe.
    """
    # 1) Dedupe by gateway payment id when available
    if payment.razorpay_payment_id:
        existing_res = await db.execute(
            select(FinanceLedger).where(
                FinanceLedger.razorpay_payment_id == payment.razorpay_payment_id
            )
        )
        existing = existing_res.scalars().first()
        if existing:
            logger.info(
                f"LEDGER IDEMPOTENT: Existing row {existing.id} for "
                f"payment_id={payment.razorpay_payment_id}, returning."
            )
            return existing

    # 2) Dedupe by internal payment.id
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

    # Resolve denormalised fields
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
    if gateway_fee is None:
        fee, net = _estimate_gateway_fee(payment.amount, payment_method)
    else:
        fee = max(0.0, gateway_fee)
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
        razorpay_order_id=payment.razorpay_order_id,
        razorpay_payment_id=payment.razorpay_payment_id,
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
        # Race: another concurrent write inserted the row between our SELECT
        # and INSERT. Roll the savepoint and re-fetch.
        logger.warning(
            f"LEDGER RACE: IntegrityError on insert for payment {payment.id} — "
            f"refetching. Detail: {e}"
        )
        await db.rollback()
        if payment.razorpay_payment_id:
            existing_res = await db.execute(
                select(FinanceLedger).where(
                    FinanceLedger.razorpay_payment_id == payment.razorpay_payment_id
                )
            )
            row = existing_res.scalars().first()
            if row:
                return row
        pid_existing_res = await db.execute(
            select(FinanceLedger).where(FinanceLedger.payment_id == payment.id)
        )
        return pid_existing_res.scalars().first()
