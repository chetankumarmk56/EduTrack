"""
Manual UPI/Bank payment workflow.

This is an isolated, parallel flow to the existing Razorpay-gated `Payment`
table. A parent pays directly into the school's UPI/bank account out-of-band,
then submits the transaction details (UTR + screenshot optional) through
this table. The admin manually verifies the receipt against the school's
real account before approving — only then do we update StudentFee dues
and generate a receipt.

On approval the service additively mirrors the row into FinanceLedger
(linked via FinanceLedger.manual_payment_request_id) so the unified finance
page reflects manual collections too. The mirror is idempotent and never
touches the `payments` table.
"""
from sqlalchemy import (
    Column, Integer, String, Float, DateTime, ForeignKey, Text, Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base
from app.models.core import TimestampMixin
import enum


class ManualPaymentStatus(str, enum.Enum):
    """
    Lifecycle for a parent-submitted manual payment.

    PENDING_VERIFICATION → initial state on submit
    APPROVED            → admin confirmed receipt in school account
    NEED_VERIFICATION   → admin wants more info / could not confirm yet
    REJECTED            → admin rejected (wrong account, duplicate, etc.)
    FAILED              → submission marked as failed (e.g. invalid txn)
    PARTIAL_PAYMENT     → admin partially approved — amount differs from
                          submission; the difference becomes new dues again
    """
    PENDING_VERIFICATION = "PENDING_VERIFICATION"
    APPROVED = "APPROVED"
    NEED_VERIFICATION = "NEED_VERIFICATION"
    REJECTED = "REJECTED"
    FAILED = "FAILED"
    PARTIAL_PAYMENT = "PARTIAL_PAYMENT"


class ManualPaymentAuditEvent(str, enum.Enum):
    """Discrete events captured in the audit log."""
    SUBMITTED = "SUBMITTED"
    ADMIN_VIEWED = "ADMIN_VIEWED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    MARKED_NEED_VERIFICATION = "MARKED_NEED_VERIFICATION"
    MARKED_PARTIAL = "MARKED_PARTIAL"
    MARKED_FAILED = "MARKED_FAILED"
    RECEIPT_GENERATED = "RECEIPT_GENERATED"
    NOTE_ADDED = "NOTE_ADDED"
    MANUAL_OVERRIDE = "MANUAL_OVERRIDE"


class ManualPaymentRequest(Base, TimestampMixin):
    """A parent-submitted manual payment awaiting / past admin verification."""
    __tablename__ = "manual_payment_requests"

    id = Column(Integer, primary_key=True, index=True)

    # Tenancy
    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    submitted_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Denormalised at submit time so admin lists stay readable even if the
    # student is later renamed or moved between classes.
    student_name = Column(String(200), nullable=False)
    parent_name = Column(String(200), nullable=False)
    class_name = Column(String(120), nullable=True)
    section_name = Column(String(40), nullable=True)

    # Fee context
    fee_type = Column(String(40), nullable=True, default="TUITION")
    installment_label = Column(String(120), nullable=True)

    # Money
    amount = Column(Float, nullable=False)
    approved_amount = Column(Float, nullable=True)  # set on APPROVED / PARTIAL_PAYMENT

    # Parent-provided transaction details
    transaction_reference = Column(String(120), nullable=False, index=True)
    transaction_at = Column(DateTime(timezone=True), nullable=False)
    payer_name = Column(String(200), nullable=True)
    payer_upi = Column(String(120), nullable=True)
    screenshot_url = Column(String(1024), nullable=True)
    parent_note = Column(Text, nullable=True)

    # Workflow
    status = Column(
        String(40),
        nullable=False,
        default=ManualPaymentStatus.PENDING_VERIFICATION.value,
        index=True,
    )
    admin_note = Column(Text, nullable=True)
    rejection_reason = Column(String(500), nullable=True)

    reviewed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    first_viewed_at = Column(DateTime(timezone=True), nullable=True)

    # Receipt — generated only on APPROVED / PARTIAL_PAYMENT
    receipt_number = Column(String(80), unique=True, nullable=True, index=True)
    receipt_url = Column(String(1024), nullable=True)
    receipt_generated_at = Column(DateTime(timezone=True), nullable=True)

    submitted_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    # Relationships
    institution = relationship("Institution")
    student = relationship("Student")
    submitter = relationship("User", foreign_keys=[submitted_by_user_id])
    reviewer = relationship("User", foreign_keys=[reviewed_by_user_id])
    audit_logs = relationship(
        "ManualPaymentAuditLog",
        back_populates="payment_request",
        cascade="all, delete-orphan",
        order_by="ManualPaymentAuditLog.created_at",
    )

    __table_args__ = (
        Index(
            "ix_manual_payment_requests_inst_status",
            "institution_id", "status",
        ),
        Index(
            "ix_manual_payment_requests_inst_submitted_at",
            "institution_id", "submitted_at",
        ),
        # Catches double-submits of the same UTR by the same parent for the
        # same student. Status PENDING_VERIFICATION duplicates are blocked
        # at the service layer; we keep the model loose here so REJECTED
        # entries don't permanently block a legitimate retry.
        Index(
            "ix_manual_payment_requests_dedupe",
            "institution_id", "student_id", "transaction_reference",
        ),
    )


class ManualPaymentAuditLog(Base):
    """
    Append-only event log for a manual payment request. Drives the
    audit trail surfaced to admins (and ops/forensics later).
    """
    __tablename__ = "manual_payment_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    payment_request_id = Column(
        Integer,
        ForeignKey("manual_payment_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False, index=True)

    event = Column(String(60), nullable=False, index=True)
    actor_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    actor_role = Column(String(40), nullable=True)
    actor_name = Column(String(200), nullable=True)

    # Free-form summary + optional structured snapshot (status before/after, etc.)
    message = Column(Text, nullable=True)
    from_status = Column(String(40), nullable=True)
    to_status = Column(String(40), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    payment_request = relationship("ManualPaymentRequest", back_populates="audit_logs")
