"""
PDF receipt for an approved manual payment.

Receipts are generated only after admin approval (or partial approval).
The PDF is rendered in-memory with reportlab, uploaded via the shared
storage_service so it survives behind a CDN URL in production, and the
returned URL is stored on the ManualPaymentRequest row.

A separate `generate_receipt_pdf_bytes` is exposed so the route layer can
also stream the receipt synchronously if storage upload fails (defence
in depth — the receipt should never be unrecoverable once approved).
"""
from __future__ import annotations

import io
from datetime import datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import UploadFile
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
)

from app.core.config import settings
from app.core.logger import logger
from app.models.manual_payment import ManualPaymentRequest
from app.services.storage_service import storage_service


_PRIMARY = colors.HexColor("#4f46e5")
_MUTED = colors.HexColor("#6b7280")
_DARK = colors.HexColor("#0f172a")
_LIGHT_BG = colors.HexColor("#f1f5f9")


def _fmt_amount(amount: Optional[float]) -> str:
    if amount is None:
        return "—"
    # Indian comma format: ₹1,23,456.00
    s = f"{amount:,.2f}"
    return f"₹ {s}"


def _fmt_dt(dt: Optional[datetime]) -> str:
    if not dt:
        return "—"
    # Stored timestamps are UTC (timezone-aware via DateTime(timezone=True),
    # or naive utcnow() for reviewed_at/receipt_generated_at). Render in the
    # configured display timezone so receipts read in local wall-clock time.
    try:
        local_tz = ZoneInfo(settings.FEE_REMINDER_TIMEZONE)
    except Exception:
        local_tz = ZoneInfo("Asia/Kolkata")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(local_tz).strftime("%d %b %Y, %I:%M %p")


def _fmt_class_section(class_name: Optional[str], section_name: Optional[str]) -> str:
    """Combine class + section without duplicating a section already in class_name.

    Class display names often already include the section (e.g. "10-A"), so
    blindly appending the section_name produces "10-A A". Only append when
    the section isn't already a suffix/token of the class label.
    """
    cls = (class_name or "").strip()
    sec = (section_name or "").strip()
    if not cls and not sec:
        return "—"
    if not sec:
        return cls or "—"
    if not cls:
        return sec
    # Already contains the section as a suffix (e.g. "10-A" + "A", "10 A" + "A").
    tail = cls.split()[-1] if " " in cls else cls.split("-")[-1]
    if tail.upper() == sec.upper() or cls.upper().endswith(sec.upper()):
        return cls
    return f"{cls} {sec}"


def generate_receipt_pdf_bytes(
    *,
    school_name: str,
    payment_request: ManualPaymentRequest,
    balance_due: Optional[float] = None,
    verified_by_name: Optional[str] = None,
) -> bytes:
    """Render a receipt PDF for `payment_request` and return raw bytes."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        title=f"Receipt {payment_request.receipt_number or payment_request.id}",
    )

    styles = getSampleStyleSheet()
    h1 = ParagraphStyle(
        "h1", parent=styles["Heading1"],
        fontSize=22, textColor=_DARK, spaceAfter=2,
    )
    h2 = ParagraphStyle(
        "h2", parent=styles["Heading2"],
        fontSize=12, textColor=_PRIMARY, spaceAfter=4,
    )
    body = ParagraphStyle(
        "body", parent=styles["BodyText"],
        fontSize=10, textColor=_DARK, leading=14,
    )
    muted = ParagraphStyle(
        "muted", parent=body, textColor=_MUTED, fontSize=9,
    )
    big_amount = ParagraphStyle(
        "amount", parent=body, fontSize=18, textColor=_PRIMARY,
    )

    story = []

    # ── Header ────────────────────────────────────────────────────────────
    story.append(Paragraph(f"<b>{school_name}</b>", h1))
    story.append(Paragraph("Official Fee Receipt — Manual Payment", muted))
    story.append(Spacer(1, 6 * mm))

    receipt_row = [
        [Paragraph("Receipt No.", muted), Paragraph(
            f"<b>{payment_request.receipt_number or '—'}</b>", body)],
        [Paragraph("Issued On", muted), Paragraph(
            _fmt_dt(payment_request.receipt_generated_at or payment_request.reviewed_at), body)],
        [Paragraph("Status", muted), Paragraph(
            f"<b>{payment_request.status}</b>", body)],
    ]
    receipt_table = Table(receipt_row, colWidths=[40 * mm, 130 * mm])
    receipt_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(receipt_table)
    story.append(Spacer(1, 6 * mm))

    # ── Student section ───────────────────────────────────────────────────
    story.append(Paragraph("Student Details", h2))
    student_rows = [
        ["Student Name", payment_request.student_name],
        ["Parent / Guardian", payment_request.parent_name],
        ["Class / Section", _fmt_class_section(payment_request.class_name, payment_request.section_name)],
        ["Fee Type", payment_request.fee_type or "TUITION"],
    ]
    if payment_request.installment_label:
        student_rows.append(["Installment", payment_request.installment_label])
    student_table = Table(student_rows, colWidths=[45 * mm, 125 * mm])
    student_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), _LIGHT_BG),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TEXTCOLOR", (0, 0), (0, -1), _DARK),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
    ]))
    story.append(student_table)
    story.append(Spacer(1, 6 * mm))

    # ── Payment section ───────────────────────────────────────────────────
    story.append(Paragraph("Payment Details", h2))
    paid = payment_request.approved_amount or payment_request.amount
    payment_rows = [
        ["Amount Submitted", _fmt_amount(payment_request.amount)],
        ["Amount Approved", _fmt_amount(payment_request.approved_amount)],
        ["Transaction ID / UTR", payment_request.transaction_reference],
        ["Transaction Time", _fmt_dt(payment_request.transaction_at)],
        ["Payer Name", payment_request.payer_name or "—"],
        ["Payer UPI", payment_request.payer_upi or "—"],
        ["Approved At", _fmt_dt(payment_request.reviewed_at)],
        ["Verified By", verified_by_name or "Admin"],
    ]
    if balance_due is not None:
        payment_rows.append(["Balance Due After Payment", _fmt_amount(balance_due)])

    payment_table = Table(payment_rows, colWidths=[55 * mm, 115 * mm])
    payment_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), _LIGHT_BG),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TEXTCOLOR", (0, 0), (0, -1), _DARK),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
    ]))
    story.append(payment_table)
    story.append(Spacer(1, 6 * mm))

    # ── Total ─────────────────────────────────────────────────────────────
    total_row = Table(
        [[Paragraph("Total Paid", body), Paragraph(_fmt_amount(paid), big_amount)]],
        colWidths=[55 * mm, 115 * mm],
    )
    total_row.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), _LIGHT_BG),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
    ]))
    story.append(total_row)
    story.append(Spacer(1, 8 * mm))

    # ── Verification code + footer ───────────────────────────────────────
    verification_code = payment_request.receipt_number or f"MP-{payment_request.id}"
    story.append(Paragraph(
        f"Verification Code: <b>{verification_code}</b>", body
    ))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        "This is a system-generated receipt for a manually verified UPI/bank payment. "
        "Please contact the school office for any clarifications.",
        muted,
    ))

    doc.build(story)
    buffer.seek(0)
    return buffer.read()


class _BytesUpload(UploadFile):
    """Adapter so we can hand raw PDF bytes to storage_service.upload_file."""

    def __init__(self, filename: str, data: bytes):
        super().__init__(
            filename=filename,
            file=io.BytesIO(data),
            size=len(data),
            headers=None,
        )
        # Cache for size-check / future use; UploadFile.read() is async.
        self._cached = data

    async def read(self, size: int = -1) -> bytes:
        return self._cached


async def upload_receipt_pdf(
    *, pdf_bytes: bytes, receipt_number: str,
) -> str:
    """Push the receipt to remote storage and return its URL."""
    filename = f"receipts/{receipt_number}.pdf"
    upload = _BytesUpload(filename=filename, data=pdf_bytes)
    try:
        return await storage_service.upload_file(upload)
    except Exception as e:
        # Receipts are best-effort persisted; the bytes are still streamable
        # to the client on demand if the upload fails.
        logger.exception("Receipt upload failed for %s: %s", receipt_number, e)
        raise
