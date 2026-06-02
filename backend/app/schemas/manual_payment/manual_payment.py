from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.models.manual_payment import ManualPaymentStatus


# ─── Parent: submit a manual payment ───────────────────────────────────────

class ManualPaymentSubmitRequest(BaseModel):
    """Validated payload from the parent payment form.

    Submitted as multipart form data alongside the optional screenshot, so the
    route layer reconstructs this model from `Form(...)` fields. Keep field
    names aligned with the form for symmetry.
    """
    student_id: int
    parent_name: str = Field(..., min_length=1, max_length=200)
    fee_type: Literal["TUITION", "SPORTS"] = "TUITION"
    installment_label: Optional[str] = Field(default=None, max_length=120)
    amount: float = Field(..., gt=0, le=10_000_000)
    transaction_reference: str = Field(..., min_length=4, max_length=120)
    transaction_at: datetime
    payer_name: Optional[str] = Field(default=None, max_length=200)
    payer_upi: Optional[str] = Field(default=None, max_length=120)
    parent_note: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("transaction_reference")
    @classmethod
    def _strip_reference(cls, v: str) -> str:
        return v.strip()

    @field_validator("parent_name", "payer_name", "payer_upi", "parent_note", "installment_label")
    @classmethod
    def _strip_optional(cls, v):
        if v is None:
            return v
        v = v.strip()
        return v or None


# ─── Admin: decision payload ───────────────────────────────────────────────

class ManualPaymentDecisionRequest(BaseModel):
    """Admin action against a pending request.

    `decision` is the target status. `approved_amount` is required for
    APPROVED + PARTIAL_PAYMENT (defaults to the submitted amount for plain
    APPROVED). `rejection_reason` is required for REJECTED / FAILED.
    """
    decision: ManualPaymentStatus
    approved_amount: Optional[float] = Field(default=None, gt=0, le=10_000_000)
    rejection_reason: Optional[str] = Field(default=None, max_length=500)
    admin_note: Optional[str] = Field(default=None, max_length=2000)


class ManualPaymentNoteRequest(BaseModel):
    admin_note: str = Field(..., min_length=1, max_length=2000)


# ─── Read models ───────────────────────────────────────────────────────────

class ManualPaymentAuditLogResponse(BaseModel):
    id: int
    event: str
    actor_user_id: Optional[int] = None
    actor_role: Optional[str] = None
    actor_name: Optional[str] = None
    message: Optional[str] = None
    from_status: Optional[str] = None
    to_status: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ManualPaymentRequestResponse(BaseModel):
    id: int
    institution_id: int

    student_id: int
    student_name: str
    parent_name: str
    class_name: Optional[str] = None
    section_name: Optional[str] = None

    fee_type: Optional[str] = None
    installment_label: Optional[str] = None

    amount: float
    approved_amount: Optional[float] = None

    transaction_reference: str
    transaction_at: datetime
    payer_name: Optional[str] = None
    payer_upi: Optional[str] = None
    screenshot_url: Optional[str] = None
    parent_note: Optional[str] = None

    status: str
    admin_note: Optional[str] = None
    rejection_reason: Optional[str] = None

    reviewed_by_user_id: Optional[int] = None
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    first_viewed_at: Optional[datetime] = None

    receipt_number: Optional[str] = None
    receipt_url: Optional[str] = None
    receipt_generated_at: Optional[datetime] = None

    submitted_at: datetime
    submitted_by_user_id: int

    audit_logs: List[ManualPaymentAuditLogResponse] = []

    class Config:
        from_attributes = True


class ManualPaymentSummary(BaseModel):
    total: int = 0
    pending_verification: int = 0
    approved: int = 0
    need_verification: int = 0
    rejected: int = 0
    failed: int = 0
    partial: int = 0
    total_approved_amount: float = 0.0


class ManualPaymentListResponse(BaseModel):
    total: int
    offset: int
    limit: int
    summary: ManualPaymentSummary
    items: List[ManualPaymentRequestResponse]


# ─── Parent: school-info card ──────────────────────────────────────────────

class SchoolPaymentInfoResponse(BaseModel):
    """Read-only display values for the parent form (no secrets)."""
    school_name: str
    upi_id: Optional[str] = None
    upi_display_name: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_ifsc: Optional[str] = None
    bank_account_holder: Optional[str] = None
    qr_image_url: Optional[str] = None
    payment_instructions: Optional[str] = None
    is_configured: bool = False


# ─── Admin: settings management ───────────────────────────────────────────

class InstitutionPaymentSettingsUpdate(BaseModel):
    """Admin payload for upserting per-institution payment details.

    All fields optional — admins can save partial info (e.g. UPI only, no bank).
    Empty strings are treated as "clear this field".
    """
    upi_id: Optional[str] = Field(default=None, max_length=160)
    upi_display_name: Optional[str] = Field(default=None, max_length=200)
    bank_name: Optional[str] = Field(default=None, max_length=200)
    bank_account_number: Optional[str] = Field(default=None, max_length=80)
    bank_ifsc: Optional[str] = Field(default=None, max_length=40)
    bank_account_holder: Optional[str] = Field(default=None, max_length=200)
    payment_instructions: Optional[str] = Field(default=None, max_length=4000)

    @field_validator("*", mode="before")
    @classmethod
    def _normalise_blank(cls, v):
        if isinstance(v, str):
            stripped = v.strip()
            return stripped or None
        return v


class InstitutionPaymentSettingsResponse(SchoolPaymentInfoResponse):
    """Admin view of the payment settings — same shape as parent view today,
    but kept distinct so we can expose extra fields (updated_by, audit) later
    without leaking them to parents."""
    updated_at: Optional[datetime] = None
    updated_by_name: Optional[str] = None
