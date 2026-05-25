"""
HTTP routes for the manual payment workflow.

Routes:
  POST   /api/manual-payments                 — parent submits a request
  GET    /api/manual-payments/mine            — parent's own submissions
  GET    /api/manual-payments/school-info     — read-only school payment info
  GET    /api/manual-payments/students        — wards the current parent can submit for
  GET    /api/manual-payments                 — admin queue (filters + summary)
  GET    /api/manual-payments/{id}            — single request (admin)
  POST   /api/manual-payments/{id}/decision   — approve / reject / partial / etc.
  POST   /api/manual-payments/{id}/notes      — admin appends an internal note
  GET    /api/manual-payments/{id}/receipt    — stream / regenerate receipt PDF

These endpoints DO NOT touch the existing Razorpay payment routes — the
new workflow is fully parallel and may be removed by deleting this folder
plus the migration without disturbing any other code path.
"""
from __future__ import annotations

import io
from datetime import date, datetime
from typing import List, Optional

from fastapi import (
    APIRouter, Depends, Form, File, UploadFile, HTTPException, Query, status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import (
    UserContext, get_current_user, require_payment_admin,
)
from app.core.logger import logger
from app.models.directory import Parent, Student
from app.models.core import Institution
from app.models.manual_payment import (
    ManualPaymentRequest,
    ManualPaymentStatus,
)
from app.schemas.manual_payment import (
    ManualPaymentSubmitRequest,
    ManualPaymentDecisionRequest,
    ManualPaymentNoteRequest,
    ManualPaymentRequestResponse,
    ManualPaymentListResponse,
    SchoolPaymentInfoResponse,
    InstitutionPaymentSettingsUpdate,
    InstitutionPaymentSettingsResponse,
)
from app.services.manual_payment.service import manual_payment_service
from app.services.manual_payment.config import (
    get_school_payment_info,
    get_admin_settings,
    upsert_admin_settings,
    set_qr_image_url,
)
from app.services.manual_payment.receipt import (
    generate_receipt_pdf_bytes, upload_receipt_pdf,
)
from app.services.storage_service import storage_service


router = APIRouter(prefix="/api/manual-payments", tags=["Manual Payments"])


# ─── Serialisation helpers ────────────────────────────────────────────────

async def _resolve_reviewer_name(
    db: AsyncSession, request: ManualPaymentRequest,
) -> Optional[str]:
    if not request.reviewed_by_user_id:
        return None
    from app.models.core import User
    res = await db.execute(
        select(User.name).where(User.id == request.reviewed_by_user_id)
    )
    return res.scalar()


async def _to_response(
    db: AsyncSession, request: ManualPaymentRequest,
) -> ManualPaymentRequestResponse:
    reviewer_name = await _resolve_reviewer_name(db, request)
    audit_logs = [
        {
            "id": a.id,
            "event": a.event,
            "actor_user_id": a.actor_user_id,
            "actor_role": a.actor_role,
            "actor_name": a.actor_name,
            "message": a.message,
            "from_status": a.from_status,
            "to_status": a.to_status,
            "created_at": a.created_at,
        }
        for a in (request.audit_logs or [])
    ]
    return ManualPaymentRequestResponse(
        id=request.id,
        institution_id=request.institution_id,
        student_id=request.student_id,
        student_name=request.student_name,
        parent_name=request.parent_name,
        class_name=request.class_name,
        section_name=request.section_name,
        fee_type=request.fee_type,
        installment_label=request.installment_label,
        amount=request.amount,
        approved_amount=request.approved_amount,
        transaction_reference=request.transaction_reference,
        transaction_at=request.transaction_at,
        payer_name=request.payer_name,
        payer_upi=request.payer_upi,
        screenshot_url=request.screenshot_url,
        parent_note=request.parent_note,
        status=request.status,
        admin_note=request.admin_note,
        rejection_reason=request.rejection_reason,
        reviewed_by_user_id=request.reviewed_by_user_id,
        reviewed_by_name=reviewer_name,
        reviewed_at=request.reviewed_at,
        first_viewed_at=request.first_viewed_at,
        receipt_number=request.receipt_number,
        receipt_url=request.receipt_url,
        receipt_generated_at=request.receipt_generated_at,
        submitted_at=request.submitted_at,
        submitted_by_user_id=request.submitted_by_user_id,
        audit_logs=audit_logs,
    )


# ─── Parent: school info card ─────────────────────────────────────────────

@router.get("/school-info", response_model=SchoolPaymentInfoResponse)
async def get_school_info(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
):
    """Read the parent-facing school payment info card for the current institution."""
    return await get_school_payment_info(db, institution_id=user.institution_id)


# ─── Admin: school payment settings (per-institution) ────────────────────

@router.get("/admin/school-info", response_model=InstitutionPaymentSettingsResponse)
async def admin_get_school_info(
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin),
):
    """Admin / finance view of their institution's payment settings."""
    return await get_admin_settings(db, institution_id=admin.institution_id)


@router.put("/admin/school-info", response_model=InstitutionPaymentSettingsResponse)
async def admin_update_school_info(
    payload: InstitutionPaymentSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin),
):
    """Upsert UPI / bank / instructions for the current institution."""
    await upsert_admin_settings(
        db,
        institution_id=admin.institution_id,
        payload=payload,
        actor_user_id=admin.id,
    )
    return await get_admin_settings(db, institution_id=admin.institution_id)


@router.post("/admin/school-info/qr", response_model=InstitutionPaymentSettingsResponse)
async def admin_upload_qr(
    qr: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin),
):
    """Upload a new QR image for this institution. Replaces any existing one."""
    if not qr or not qr.filename:
        raise HTTPException(status_code=400, detail="No QR file uploaded.")
    try:
        url = await storage_service.upload_file(qr)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("QR upload failed: %s", e)
        raise HTTPException(status_code=502, detail="Could not save the QR image. Please retry.")

    await set_qr_image_url(
        db,
        institution_id=admin.institution_id,
        qr_url=url,
        actor_user_id=admin.id,
    )
    return await get_admin_settings(db, institution_id=admin.institution_id)


@router.delete("/admin/school-info/qr", response_model=InstitutionPaymentSettingsResponse)
async def admin_remove_qr(
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin),
):
    """Remove the current QR image. The underlying file is left on storage."""
    await set_qr_image_url(
        db,
        institution_id=admin.institution_id,
        qr_url=None,
        actor_user_id=admin.id,
    )
    return await get_admin_settings(db, institution_id=admin.institution_id)


# ─── Parent: wards visible to the current parent/student ───────────────────

@router.get("/students")
async def get_my_students(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
):
    """
    Returns the set of students the current user can submit payments for.

    * Admin/Finance: every student in the institution (used by the admin
      portal when recording a manual payment from inside the office, if
      that flow is added later).
    * Parent with a Parent record: their wards.
    * Parent/student account where the user is bound to a student row: just
      that student.
    """
    if user.role in ("super_admin", "admin", "finance"):
        res = await db.execute(
            select(Student.id, Student.name, Student.school_class_id).where(
                Student.institution_id == user.institution_id,
                Student.is_active == True,  # noqa: E712
            ).limit(500)
        )
        return [
            {"id": row[0], "name": row[1], "school_class_id": row[2]}
            for row in res.all()
        ]

    students: List[dict] = []
    if user.role == "parent":
        p_res = await db.execute(
            select(Parent).where(
                Parent.user_id == user.id,
                Parent.institution_id == user.institution_id,
            )
        )
        parent = p_res.scalars().first()
        if parent:
            ch_res = await db.execute(
                select(Student.id, Student.name, Student.school_class_id).where(
                    Student.parent_id == parent.id,
                    Student.institution_id == user.institution_id,
                )
            )
            students = [
                {"id": row[0], "name": row[1], "school_class_id": row[2]}
                for row in ch_res.all()
            ]
    if not students:
        s_res = await db.execute(
            select(Student.id, Student.name, Student.school_class_id).where(
                Student.user_id == user.id,
                Student.institution_id == user.institution_id,
            )
        )
        students = [
            {"id": row[0], "name": row[1], "school_class_id": row[2]}
            for row in s_res.all()
        ]
    return students


# ─── Parent: submit ───────────────────────────────────────────────────────

@router.post(
    "",
    response_model=ManualPaymentRequestResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_manual_payment(
    student_id: int = Form(...),
    parent_name: str = Form(...),
    amount: float = Form(...),
    transaction_reference: str = Form(...),
    transaction_at: datetime = Form(...),
    fee_type: Optional[str] = Form("TUITION"),
    installment_label: Optional[str] = Form(None),
    payer_name: Optional[str] = Form(None),
    payer_upi: Optional[str] = Form(None),
    parent_note: Optional[str] = Form(None),
    screenshot: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
):
    """Parent / student submits a manual payment for admin review."""
    payload = ManualPaymentSubmitRequest(
        student_id=student_id,
        parent_name=parent_name,
        amount=amount,
        transaction_reference=transaction_reference,
        transaction_at=transaction_at,
        fee_type=fee_type,
        installment_label=installment_label,
        payer_name=payer_name,
        payer_upi=payer_upi,
        parent_note=parent_note,
    )

    screenshot_url: Optional[str] = None
    if screenshot is not None and screenshot.filename:
        try:
            screenshot_url = await storage_service.upload_file(screenshot)
        except HTTPException:
            # Storage errors should surface but never silently corrupt a submit.
            raise
        except Exception as e:
            logger.exception("Screenshot upload failed: %s", e)
            raise HTTPException(
                status_code=502,
                detail="Could not save the screenshot. Please retry or submit without it.",
            )

    req = await manual_payment_service.submit_request(
        db,
        institution_id=user.institution_id,
        actor_user_id=user.id,
        actor_role=user.role,
        actor_name=user.name,
        payload=payload,
        screenshot_url=screenshot_url,
    )
    return await _to_response(db, req)


# ─── Parent: own history ──────────────────────────────────────────────────

@router.get("/mine", response_model=ManualPaymentListResponse)
async def get_my_submissions(
    skip: int = 0,
    limit: int = Query(50, le=100),
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
):
    """
    Lists payments submitted by the current parent/student. Admins should
    use the main GET endpoint instead — this one is scoped strictly to the
    caller's `submitted_by_user_id`.
    """
    from sqlalchemy import func as _func
    from sqlalchemy.orm import selectinload as _selectinload

    filters = [
        ManualPaymentRequest.institution_id == user.institution_id,
        ManualPaymentRequest.submitted_by_user_id == user.id,
    ]

    total_res = await db.execute(
        select(_func.count(ManualPaymentRequest.id)).where(*filters)
    )
    total = int(total_res.scalar() or 0)

    rows_res = await db.execute(
        select(ManualPaymentRequest)
        .where(*filters)
        # Eager-load audit_logs so _to_response doesn't lazy-load (async sessions
        # raise on implicit lazy loads).
        .options(_selectinload(ManualPaymentRequest.audit_logs))
        .order_by(ManualPaymentRequest.submitted_at.desc())
        .offset(skip)
        .limit(limit)
    )
    items = rows_res.scalars().unique().all()

    serialised = [await _to_response(db, r) for r in items]

    # Lightweight summary across the caller's own submissions, computed in Python
    # since the dataset per parent is small (<=100 rows).
    from app.schemas.manual_payment import ManualPaymentSummary
    summary = ManualPaymentSummary()
    for r in items:
        summary.total += 1
        if r.status == ManualPaymentStatus.PENDING_VERIFICATION.value:
            summary.pending_verification += 1
        elif r.status == ManualPaymentStatus.APPROVED.value:
            summary.approved += 1
            summary.total_approved_amount += r.approved_amount or r.amount
        elif r.status == ManualPaymentStatus.PARTIAL_PAYMENT.value:
            summary.partial += 1
            summary.total_approved_amount += r.approved_amount or 0.0
        elif r.status == ManualPaymentStatus.NEED_VERIFICATION.value:
            summary.need_verification += 1
        elif r.status == ManualPaymentStatus.REJECTED.value:
            summary.rejected += 1
        elif r.status == ManualPaymentStatus.FAILED.value:
            summary.failed += 1

    return ManualPaymentListResponse(
        total=total, offset=skip, limit=limit, summary=summary, items=serialised,
    )


# ─── Admin: queue ─────────────────────────────────────────────────────────

@router.get("", response_model=ManualPaymentListResponse)
async def list_manual_payments(
    status_filter: Optional[List[str]] = Query(default=None, alias="status"),
    student_id: Optional[int] = None,
    class_name: Optional[str] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
    order: str = Query("asc", regex="^(asc|desc)$"),
    skip: int = 0,
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin),
):
    valid = {s.value for s in ManualPaymentStatus}
    if status_filter:
        bad = [s for s in status_filter if s not in valid]
        if bad:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown status values: {bad}. Allowed: {sorted(valid)}",
            )

    items, total, summary = await manual_payment_service.list_requests(
        db,
        institution_id=admin.institution_id,
        statuses=status_filter,
        student_id=student_id,
        class_name=class_name,
        min_amount=min_amount,
        max_amount=max_amount,
        date_from=date_from,
        date_to=date_to,
        search=search,
        skip=skip,
        limit=limit,
        order=order,
    )

    serialised = [await _to_response(db, r) for r in items]
    return ManualPaymentListResponse(
        total=total, offset=skip, limit=limit, summary=summary, items=serialised,
    )


# ─── Admin: get one ───────────────────────────────────────────────────────

@router.get("/{request_id}", response_model=ManualPaymentRequestResponse)
async def get_manual_payment(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin),
):
    req = await manual_payment_service.get_request(
        db, institution_id=admin.institution_id, request_id=request_id,
    )
    await manual_payment_service.mark_admin_viewed(
        db, request=req,
        actor_user_id=admin.id, actor_role=admin.role, actor_name=admin.name,
    )
    # Re-fetch to include the freshly-written ADMIN_VIEWED audit log.
    req = await manual_payment_service.get_request(
        db, institution_id=admin.institution_id, request_id=request_id,
    )
    return await _to_response(db, req)


# ─── Admin: decision ──────────────────────────────────────────────────────

@router.post("/{request_id}/decision", response_model=ManualPaymentRequestResponse)
async def apply_decision(
    request_id: int,
    payload: ManualPaymentDecisionRequest,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin),
):
    req = await manual_payment_service.apply_decision(
        db,
        institution_id=admin.institution_id,
        request_id=request_id,
        decision=payload.decision,
        approved_amount=payload.approved_amount,
        rejection_reason=payload.rejection_reason,
        admin_note=payload.admin_note,
        actor_user_id=admin.id,
        actor_role=admin.role,
        actor_name=admin.name,
    )

    # Auto-generate receipt on positive outcomes.
    if req.status in (
        ManualPaymentStatus.APPROVED.value,
        ManualPaymentStatus.PARTIAL_PAYMENT.value,
    ) and not req.receipt_number:
        try:
            await _generate_and_attach_receipt(
                db, request=req, actor=admin,
            )
            req = await manual_payment_service.get_request(
                db, institution_id=admin.institution_id, request_id=request_id,
            )
        except Exception as e:
            logger.exception("Receipt generation failed: %s", e)
            # Approval stands; receipt can be re-generated on demand.

    return await _to_response(db, req)


# ─── Admin: append internal note ──────────────────────────────────────────

@router.post("/{request_id}/notes", response_model=ManualPaymentRequestResponse)
async def append_note(
    request_id: int,
    payload: ManualPaymentNoteRequest,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_payment_admin),
):
    req = await manual_payment_service.add_admin_note(
        db,
        institution_id=admin.institution_id,
        request_id=request_id,
        note=payload.admin_note,
        actor_user_id=admin.id,
        actor_role=admin.role,
        actor_name=admin.name,
    )
    return await _to_response(db, req)


# ─── Receipt ──────────────────────────────────────────────────────────────

async def _generate_and_attach_receipt(
    db: AsyncSession, *, request: ManualPaymentRequest, actor: UserContext,
) -> ManualPaymentRequest:
    """Build, persist, and link the PDF receipt to the request."""
    inst_res = await db.execute(
        select(Institution.name).where(Institution.id == request.institution_id)
    )
    school_name = inst_res.scalar() or "Your School"

    # Receipt number first so the PDF embeds the right code
    receipt_number = (
        request.receipt_number
        or await manual_payment_service.generate_receipt_number(
            db, institution_id=request.institution_id,
        )
    )
    request.receipt_number = receipt_number

    balance = await manual_payment_service.get_balance_due(
        db, institution_id=request.institution_id, student_id=request.student_id,
    )
    pdf_bytes = generate_receipt_pdf_bytes(
        school_name=school_name,
        payment_request=request,
        balance_due=balance,
        verified_by_name=actor.name,
    )

    receipt_url: Optional[str] = None
    try:
        receipt_url = await upload_receipt_pdf(
            pdf_bytes=pdf_bytes, receipt_number=receipt_number,
        )
    except Exception as e:
        logger.warning(
            "Receipt %s upload failed, will stream on-demand: %s",
            receipt_number, e,
        )

    return await manual_payment_service.record_receipt(
        db,
        request=request,
        receipt_number=receipt_number,
        receipt_url=receipt_url,
        actor_user_id=actor.id,
        actor_role=actor.role,
        actor_name=actor.name,
    )


@router.get("/{request_id}/receipt")
async def download_receipt(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
):
    """
    Stream the receipt PDF. Available to admin/finance, or to the parent
    who submitted the payment. Only returns a PDF for APPROVED / PARTIAL
    payments — the source-of-truth is the admin's manual confirmation.
    """
    res = await db.execute(
        select(ManualPaymentRequest).where(
            ManualPaymentRequest.id == request_id,
            ManualPaymentRequest.institution_id == user.institution_id,
        )
    )
    req = res.scalars().first()
    if not req:
        raise HTTPException(status_code=404, detail="Payment request not found.")

    if req.status not in (
        ManualPaymentStatus.APPROVED.value,
        ManualPaymentStatus.PARTIAL_PAYMENT.value,
    ):
        raise HTTPException(
            status_code=409,
            detail="Receipt is only available after admin approval.",
        )

    if user.role not in ("super_admin", "admin", "finance") and req.submitted_by_user_id != user.id:
        raise HTTPException(status_code=403, detail="Not your receipt.")

    inst_res = await db.execute(
        select(Institution.name).where(Institution.id == req.institution_id)
    )
    school_name = inst_res.scalar() or "Your School"

    if not req.receipt_number:
        # Backfill — admin approved before the receipt was attempted.
        req = await _generate_and_attach_receipt(db, request=req, actor=user)

    balance = await manual_payment_service.get_balance_due(
        db, institution_id=req.institution_id, student_id=req.student_id,
    )
    pdf_bytes = generate_receipt_pdf_bytes(
        school_name=school_name,
        payment_request=req,
        balance_due=balance,
        verified_by_name=None,
    )
    filename = f"{req.receipt_number}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
