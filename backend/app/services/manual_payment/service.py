"""
Core business logic for the manual payment workflow.

Boundary with the legacy Razorpay flow:
  • This service NEVER reads or writes `payments`, `payment_allocations`,
    `payment_transactions`, or `finance_ledger`. It owns its own tables.
  • On admin approval it DOES call into the existing fee_service to reduce
    the student's StudentFee dues — that's the single integration point
    so dues correctly reflect approved manual payments.
"""
from __future__ import annotations

from datetime import datetime, date
from typing import List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.logger import logger
from app.models.directory import Parent, Student
from app.models.academic import SchoolClass, Grade, Section
from app.models.finance import StudentFee, StudentFeeStatus
from app.models.manual_payment import (
    ManualPaymentRequest,
    ManualPaymentAuditLog,
    ManualPaymentStatus,
    ManualPaymentAuditEvent,
)
from app.schemas.manual_payment import (
    ManualPaymentSubmitRequest,
    ManualPaymentSummary,
)


# Statuses that count as "terminal positive" — once a payment lands here,
# we won't re-allocate against StudentFee a second time even if the admin
# clicks Approve again.
_TERMINAL_POSITIVE = {
    ManualPaymentStatus.APPROVED.value,
    ManualPaymentStatus.PARTIAL_PAYMENT.value,
}


class ManualPaymentService:
    # ── Helpers ────────────────────────────────────────────────────────────

    async def _resolve_student(
        self, db: AsyncSession, *, institution_id: int, student_id: int,
    ) -> Student:
        res = await db.execute(
            select(Student).where(
                Student.id == student_id,
                Student.institution_id == institution_id,
            )
        )
        student = res.scalars().first()
        if not student:
            raise HTTPException(
                status_code=404,
                detail="Student not found in your institution.",
            )
        return student

    async def _resolve_class_snapshot(
        self, db: AsyncSession, student: Student,
    ) -> Tuple[Optional[str], Optional[str]]:
        """Best-effort denormalisation of class/section names at submit time."""
        if not student.school_class_id:
            return None, None
        sc_res = await db.execute(
            select(SchoolClass, Grade, Section).
            join(Grade, SchoolClass.grade_id == Grade.id, isouter=True).
            join(Section, SchoolClass.section_id == Section.id, isouter=True).
            where(SchoolClass.id == student.school_class_id)
        )
        row = sc_res.first()
        if not row:
            return None, None
        sc, grade, section = row
        class_name = (
            sc.display_name
            or (grade.name if grade else None)
            or f"Class {sc.id}"
        )
        section_name = section.name if section else None
        return class_name, section_name

    async def _ensure_parent_can_submit(
        self, db: AsyncSession, *, user_id: int, role: str,
        institution_id: int, student: Student,
    ) -> None:
        """
        Same access model as `ensure_student_access` in the existing finance
        router — admins/finance bypass, parents must be linked to the student,
        students may submit for themselves, family-portal accounts (no Parent
        record) are accepted when the user_id == student.user_id.
        """
        if role in ("super_admin", "admin", "finance"):
            return

        if role == "student" and student.user_id == user_id:
            return

        if role == "parent":
            # Path 1: real parent record links to this student.
            p_res = await db.execute(
                select(Parent).where(
                    Parent.user_id == user_id,
                    Parent.institution_id == institution_id,
                )
            )
            parent = p_res.scalars().first()
            if parent and student.parent_id == parent.id:
                return
            # Path 2: family-portal account where the parent uses the student's
            # own login (common in this codebase per project memory).
            if student.user_id == user_id:
                return

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only submit payments for your own ward.",
        )

    async def _write_audit(
        self,
        db: AsyncSession,
        *,
        payment_request: ManualPaymentRequest,
        event: ManualPaymentAuditEvent,
        actor_user_id: Optional[int],
        actor_role: Optional[str],
        actor_name: Optional[str],
        message: Optional[str] = None,
        from_status: Optional[str] = None,
        to_status: Optional[str] = None,
    ) -> None:
        log = ManualPaymentAuditLog(
            payment_request_id=payment_request.id,
            institution_id=payment_request.institution_id,
            event=event.value,
            actor_user_id=actor_user_id,
            actor_role=actor_role,
            actor_name=actor_name,
            message=message,
            from_status=from_status,
            to_status=to_status,
        )
        db.add(log)
        await db.flush()

    # ── Parent: submit ─────────────────────────────────────────────────────

    async def submit_request(
        self,
        db: AsyncSession,
        *,
        institution_id: int,
        actor_user_id: int,
        actor_role: str,
        actor_name: str,
        payload: ManualPaymentSubmitRequest,
        screenshot_url: Optional[str],
    ) -> ManualPaymentRequest:
        student = await self._resolve_student(
            db, institution_id=institution_id, student_id=payload.student_id,
        )
        await self._ensure_parent_can_submit(
            db, user_id=actor_user_id, role=actor_role,
            institution_id=institution_id, student=student,
        )

        # Duplicate-submission guard: block when the SAME txn ref is already
        # in PENDING_VERIFICATION / APPROVED / PARTIAL for this student. We
        # tolerate retries after REJECTED / FAILED so a parent can correct
        # and resubmit.
        existing_res = await db.execute(
            select(ManualPaymentRequest).where(
                ManualPaymentRequest.institution_id == institution_id,
                ManualPaymentRequest.student_id == payload.student_id,
                ManualPaymentRequest.transaction_reference
                == payload.transaction_reference,
                ManualPaymentRequest.status.in_([
                    ManualPaymentStatus.PENDING_VERIFICATION.value,
                    ManualPaymentStatus.APPROVED.value,
                    ManualPaymentStatus.PARTIAL_PAYMENT.value,
                    ManualPaymentStatus.NEED_VERIFICATION.value,
                ]),
            )
        )
        if existing_res.scalars().first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "A payment with this transaction reference is already on "
                    "file for this student. Please contact the school office "
                    "if you believe this is an error."
                ),
            )

        class_name, section_name = await self._resolve_class_snapshot(db, student)

        req = ManualPaymentRequest(
            institution_id=institution_id,
            student_id=student.id,
            submitted_by_user_id=actor_user_id,
            student_name=student.name,
            parent_name=payload.parent_name,
            class_name=class_name,
            section_name=section_name,
            fee_type=(payload.fee_type or "TUITION").upper(),
            installment_label=payload.installment_label,
            amount=float(payload.amount),
            transaction_reference=payload.transaction_reference,
            transaction_at=payload.transaction_at,
            payer_name=payload.payer_name,
            payer_upi=payload.payer_upi,
            screenshot_url=screenshot_url,
            parent_note=payload.parent_note,
            status=ManualPaymentStatus.PENDING_VERIFICATION.value,
        )
        db.add(req)
        await db.flush()

        await self._write_audit(
            db,
            payment_request=req,
            event=ManualPaymentAuditEvent.SUBMITTED,
            actor_user_id=actor_user_id,
            actor_role=actor_role,
            actor_name=actor_name,
            message=(
                f"Submitted ₹{payload.amount:,.2f} via "
                f"{(payload.fee_type or 'TUITION').upper()} — "
                f"ref {payload.transaction_reference}"
            ),
            to_status=req.status,
        )

        await db.commit()
        return await self.get_request(
            db, institution_id=institution_id, request_id=req.id,
        )

    # ── Listing ────────────────────────────────────────────────────────────

    async def list_requests(
        self,
        db: AsyncSession,
        *,
        institution_id: int,
        statuses: Optional[List[str]] = None,
        student_id: Optional[int] = None,
        class_name: Optional[str] = None,
        min_amount: Optional[float] = None,
        max_amount: Optional[float] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
        order: str = "asc",  # "asc" = oldest first (admin queue), "desc" = newest first (parent history)
    ) -> Tuple[List[ManualPaymentRequest], int, ManualPaymentSummary]:
        # Build the filter list once, then apply identically to count + list +
        # summary queries. Avoids `.subquery()` count patterns that can mis-bind
        # column refs when wrapping an ORM-entity select.
        filters = [ManualPaymentRequest.institution_id == institution_id]

        if statuses:
            filters.append(ManualPaymentRequest.status.in_(statuses))
        if student_id:
            filters.append(ManualPaymentRequest.student_id == student_id)
        if class_name:
            filters.append(
                ManualPaymentRequest.class_name.ilike(f"%{class_name.strip()}%")
            )
        if min_amount is not None:
            filters.append(ManualPaymentRequest.amount >= min_amount)
        if max_amount is not None:
            filters.append(ManualPaymentRequest.amount <= max_amount)
        if date_from:
            filters.append(
                ManualPaymentRequest.submitted_at
                >= datetime.combine(date_from, datetime.min.time())
            )
        if date_to:
            filters.append(
                ManualPaymentRequest.submitted_at
                <= datetime.combine(date_to, datetime.max.time())
            )
        if search:
            term = f"%{search.strip()}%"
            filters.append(
                (ManualPaymentRequest.student_name.ilike(term))
                | (ManualPaymentRequest.parent_name.ilike(term))
                | (ManualPaymentRequest.transaction_reference.ilike(term))
                | (ManualPaymentRequest.receipt_number.ilike(term))
            )

        # Total — straight count on the table, no subquery.
        count_stmt = select(func.count(ManualPaymentRequest.id)).where(*filters)
        total_res = await db.execute(count_stmt)
        total = int(total_res.scalar() or 0)

        order_col = (
            ManualPaymentRequest.submitted_at.asc()
            if order != "desc"
            else ManualPaymentRequest.submitted_at.desc()
        )
        list_stmt = (
            select(ManualPaymentRequest)
            .where(*filters)
            .options(selectinload(ManualPaymentRequest.audit_logs))
            .order_by(order_col)
            .offset(skip)
            .limit(limit)
        )
        items_res = await db.execute(list_stmt)
        items = list(items_res.scalars().unique().all())

        # Summary — independent of pagination, scoped to the same filters
        # except the offset/limit so cards reflect the filtered universe.
        summary = await self._build_summary(
            db,
            institution_id=institution_id,
            statuses=statuses,
            student_id=student_id,
            class_name=class_name,
            min_amount=min_amount,
            max_amount=max_amount,
            date_from=date_from,
            date_to=date_to,
            search=search,
        )

        return items, total, summary

    async def _build_summary(
        self,
        db: AsyncSession,
        *,
        institution_id: int,
        statuses: Optional[List[str]] = None,
        student_id: Optional[int] = None,
        class_name: Optional[str] = None,
        min_amount: Optional[float] = None,
        max_amount: Optional[float] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        search: Optional[str] = None,
    ) -> ManualPaymentSummary:
        # Build a filtered statement that mirrors list_requests but without
        # the status filter — the summary always shows the full breakdown.
        base = select(
            ManualPaymentRequest.status,
            func.count(ManualPaymentRequest.id),
            func.coalesce(
                func.sum(
                    func.coalesce(
                        ManualPaymentRequest.approved_amount,
                        ManualPaymentRequest.amount,
                    )
                ),
                0,
            ),
        ).where(
            ManualPaymentRequest.institution_id == institution_id,
        )

        if student_id:
            base = base.where(ManualPaymentRequest.student_id == student_id)
        if class_name:
            base = base.where(
                ManualPaymentRequest.class_name.ilike(f"%{class_name.strip()}%")
            )
        if min_amount is not None:
            base = base.where(ManualPaymentRequest.amount >= min_amount)
        if max_amount is not None:
            base = base.where(ManualPaymentRequest.amount <= max_amount)
        if date_from:
            base = base.where(
                ManualPaymentRequest.submitted_at
                >= datetime.combine(date_from, datetime.min.time())
            )
        if date_to:
            base = base.where(
                ManualPaymentRequest.submitted_at
                <= datetime.combine(date_to, datetime.max.time())
            )
        if search:
            term = f"%{search.strip()}%"
            base = base.where(
                (ManualPaymentRequest.student_name.ilike(term))
                | (ManualPaymentRequest.parent_name.ilike(term))
                | (ManualPaymentRequest.transaction_reference.ilike(term))
                | (ManualPaymentRequest.receipt_number.ilike(term))
            )

        stmt = base.group_by(ManualPaymentRequest.status)
        rows = (await db.execute(stmt)).all()

        summary = ManualPaymentSummary()
        for status_val, count, amount_total in rows:
            count = int(count or 0)
            amount_total = float(amount_total or 0.0)
            summary.total += count
            if status_val == ManualPaymentStatus.PENDING_VERIFICATION.value:
                summary.pending_verification = count
            elif status_val == ManualPaymentStatus.APPROVED.value:
                summary.approved = count
                summary.total_approved_amount += amount_total
            elif status_val == ManualPaymentStatus.PARTIAL_PAYMENT.value:
                summary.partial = count
                summary.total_approved_amount += amount_total
            elif status_val == ManualPaymentStatus.NEED_VERIFICATION.value:
                summary.need_verification = count
            elif status_val == ManualPaymentStatus.REJECTED.value:
                summary.rejected = count
            elif status_val == ManualPaymentStatus.FAILED.value:
                summary.failed = count
        return summary

    # ── Single read ────────────────────────────────────────────────────────

    async def get_request(
        self,
        db: AsyncSession,
        *,
        institution_id: int,
        request_id: int,
    ) -> ManualPaymentRequest:
        res = await db.execute(
            select(ManualPaymentRequest)
            .options(selectinload(ManualPaymentRequest.audit_logs))
            .where(
                ManualPaymentRequest.id == request_id,
                ManualPaymentRequest.institution_id == institution_id,
            )
        )
        req = res.scalars().first()
        if not req:
            raise HTTPException(status_code=404, detail="Payment request not found.")
        return req

    async def mark_admin_viewed(
        self,
        db: AsyncSession,
        *,
        request: ManualPaymentRequest,
        actor_user_id: int,
        actor_role: str,
        actor_name: str,
    ) -> None:
        """Idempotent: first time only."""
        if request.first_viewed_at is not None:
            return
        request.first_viewed_at = datetime.utcnow()
        await self._write_audit(
            db,
            payment_request=request,
            event=ManualPaymentAuditEvent.ADMIN_VIEWED,
            actor_user_id=actor_user_id,
            actor_role=actor_role,
            actor_name=actor_name,
            message="Admin opened the submission for the first time.",
        )
        await db.commit()

    # ── Admin: decision flow ───────────────────────────────────────────────

    async def apply_decision(
        self,
        db: AsyncSession,
        *,
        institution_id: int,
        request_id: int,
        decision: ManualPaymentStatus,
        approved_amount: Optional[float],
        rejection_reason: Optional[str],
        admin_note: Optional[str],
        actor_user_id: int,
        actor_role: str,
        actor_name: str,
    ) -> ManualPaymentRequest:
        if actor_role not in ("super_admin", "admin", "finance"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only finance/admin users can review manual payments.",
            )

        req = await self.get_request(
            db, institution_id=institution_id, request_id=request_id,
        )
        prior_status = req.status

        # Once a payment is approved/partial we lock it — preventing the
        # ledger from being double-decremented if an admin clicks again.
        if prior_status in _TERMINAL_POSITIVE and decision in (
            ManualPaymentStatus.APPROVED, ManualPaymentStatus.PARTIAL_PAYMENT,
        ):
            raise HTTPException(
                status_code=409,
                detail=(
                    "This payment has already been confirmed. Re-approving is "
                    "not allowed — record a new manual payment instead."
                ),
            )

        # Required-field validation per decision
        if decision in (ManualPaymentStatus.REJECTED, ManualPaymentStatus.FAILED):
            if not rejection_reason or not rejection_reason.strip():
                raise HTTPException(
                    status_code=400,
                    detail="Please provide a reason when rejecting or failing a payment.",
                )

        applied_amount: Optional[float] = None
        if decision == ManualPaymentStatus.APPROVED:
            applied_amount = (
                float(approved_amount) if approved_amount is not None else float(req.amount)
            )
            if applied_amount <= 0:
                raise HTTPException(status_code=400, detail="Approved amount must be positive.")
        elif decision == ManualPaymentStatus.PARTIAL_PAYMENT:
            if approved_amount is None:
                raise HTTPException(
                    status_code=400,
                    detail="Approved amount is required for partial-payment decisions.",
                )
            applied_amount = float(approved_amount)
            if applied_amount <= 0 or applied_amount >= float(req.amount):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Partial-payment amount must be greater than zero and "
                        "strictly less than the submitted amount."
                    ),
                )

        # Mutate
        req.status = decision.value
        req.admin_note = admin_note or req.admin_note
        req.reviewed_by_user_id = actor_user_id
        req.reviewed_at = datetime.utcnow()
        if decision in (ManualPaymentStatus.APPROVED, ManualPaymentStatus.PARTIAL_PAYMENT):
            req.approved_amount = applied_amount
            req.rejection_reason = None
        elif decision in (ManualPaymentStatus.REJECTED, ManualPaymentStatus.FAILED):
            req.rejection_reason = rejection_reason.strip() if rejection_reason else None
            req.approved_amount = None
        elif decision == ManualPaymentStatus.NEED_VERIFICATION:
            req.approved_amount = None

        # Allocate against StudentFee on positive outcomes
        if decision in (ManualPaymentStatus.APPROVED, ManualPaymentStatus.PARTIAL_PAYMENT):
            await self._reduce_student_dues(
                db,
                institution_id=institution_id,
                student_id=req.student_id,
                amount=applied_amount,
            )

        # Audit event
        event_map = {
            ManualPaymentStatus.APPROVED: ManualPaymentAuditEvent.APPROVED,
            ManualPaymentStatus.REJECTED: ManualPaymentAuditEvent.REJECTED,
            ManualPaymentStatus.NEED_VERIFICATION: ManualPaymentAuditEvent.MARKED_NEED_VERIFICATION,
            ManualPaymentStatus.PARTIAL_PAYMENT: ManualPaymentAuditEvent.MARKED_PARTIAL,
            ManualPaymentStatus.FAILED: ManualPaymentAuditEvent.MARKED_FAILED,
            ManualPaymentStatus.PENDING_VERIFICATION: ManualPaymentAuditEvent.MANUAL_OVERRIDE,
        }
        event = event_map.get(decision, ManualPaymentAuditEvent.MANUAL_OVERRIDE)
        await self._write_audit(
            db,
            payment_request=req,
            event=event,
            actor_user_id=actor_user_id,
            actor_role=actor_role,
            actor_name=actor_name,
            message=admin_note or rejection_reason or f"Status set to {decision.value}",
            from_status=prior_status,
            to_status=decision.value,
        )

        await db.commit()
        return await self.get_request(
            db, institution_id=institution_id, request_id=request_id,
        )

    async def _reduce_student_dues(
        self,
        db: AsyncSession,
        *,
        institution_id: int,
        student_id: int,
        amount: float,
    ) -> None:
        """
        Reduce the StudentFee row for `student_id` by `amount`. Mirrors the
        behaviour of `fee_service._update_student_fee` but kept private to
        this service so we never depend on internal mixin ordering.
        """
        student_res = await db.execute(
            select(Student.school_class_id).where(Student.id == student_id)
        )
        class_id = student_res.scalar()
        if not class_id:
            logger.warning(
                "MANUAL_PAY: student %s has no class — skipping fee update.",
                student_id,
            )
            return

        fee_res = await db.execute(
            select(StudentFee).where(
                StudentFee.student_id == student_id,
                StudentFee.class_id == class_id,
                StudentFee.institution_id == institution_id,
            )
        )
        fee = fee_res.scalars().first()
        if not fee:
            logger.warning(
                "MANUAL_PAY: no StudentFee for student %s class %s — "
                "approval recorded without ledger reduction.",
                student_id, class_id,
            )
            return

        new_paid = fee.amount_paid + amount
        if new_paid > fee.total_amount:
            logger.warning(
                "MANUAL_PAY: clamping overpayment for student %s — "
                "submitted %s, max %s.", student_id, new_paid, fee.total_amount,
            )
            new_paid = fee.total_amount
        fee.amount_paid = new_paid
        fee.due_amount = max(0.0, fee.total_amount - fee.amount_paid)
        if fee.due_amount <= 0:
            fee.status = StudentFeeStatus.PAID
        elif fee.amount_paid > 0:
            fee.status = StudentFeeStatus.PARTIAL
        else:
            fee.status = StudentFeeStatus.UNPAID
        await db.flush()

    # ── Notes ──────────────────────────────────────────────────────────────

    async def add_admin_note(
        self,
        db: AsyncSession,
        *,
        institution_id: int,
        request_id: int,
        note: str,
        actor_user_id: int,
        actor_role: str,
        actor_name: str,
    ) -> ManualPaymentRequest:
        if actor_role not in ("super_admin", "admin", "finance"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only finance/admin users can add internal notes.",
            )
        req = await self.get_request(
            db, institution_id=institution_id, request_id=request_id,
        )
        existing = (req.admin_note or "").strip()
        stamped = (
            f"[{datetime.utcnow().isoformat(timespec='minutes')}Z {actor_name}] "
            f"{note.strip()}"
        )
        req.admin_note = (existing + "\n\n" + stamped).strip() if existing else stamped
        await self._write_audit(
            db,
            payment_request=req,
            event=ManualPaymentAuditEvent.NOTE_ADDED,
            actor_user_id=actor_user_id,
            actor_role=actor_role,
            actor_name=actor_name,
            message=note.strip(),
        )
        await db.commit()
        return await self.get_request(
            db, institution_id=institution_id, request_id=request_id,
        )

    # ── Receipt persistence ────────────────────────────────────────────────

    async def record_receipt(
        self,
        db: AsyncSession,
        *,
        request: ManualPaymentRequest,
        receipt_number: str,
        receipt_url: Optional[str],
        actor_user_id: Optional[int],
        actor_role: Optional[str],
        actor_name: Optional[str],
    ) -> ManualPaymentRequest:
        request.receipt_number = receipt_number
        request.receipt_url = receipt_url
        request.receipt_generated_at = datetime.utcnow()
        await self._write_audit(
            db,
            payment_request=request,
            event=ManualPaymentAuditEvent.RECEIPT_GENERATED,
            actor_user_id=actor_user_id,
            actor_role=actor_role,
            actor_name=actor_name,
            message=f"Receipt {receipt_number} generated.",
        )
        await db.commit()
        return request

    # ── Helpers exposed to routes ──────────────────────────────────────────

    async def get_balance_due(
        self,
        db: AsyncSession,
        *,
        institution_id: int,
        student_id: int,
    ) -> Optional[float]:
        student_res = await db.execute(
            select(Student.school_class_id).where(
                Student.id == student_id,
                Student.institution_id == institution_id,
            )
        )
        class_id = student_res.scalar()
        if not class_id:
            return None
        fee_res = await db.execute(
            select(StudentFee.due_amount).where(
                StudentFee.student_id == student_id,
                StudentFee.class_id == class_id,
                StudentFee.institution_id == institution_id,
            )
        )
        return fee_res.scalar()

    async def generate_receipt_number(
        self, db: AsyncSession, *, institution_id: int,
    ) -> str:
        """`MR-{INST}-{YYYYMM}-{seq}` — monotonic per (institution, month)."""
        from sqlalchemy import func as _func
        yyyymm = datetime.utcnow().strftime("%Y%m")
        prefix = f"MR-{institution_id}-{yyyymm}-"
        res = await db.execute(
            select(_func.count(ManualPaymentRequest.id)).where(
                ManualPaymentRequest.institution_id == institution_id,
                ManualPaymentRequest.receipt_number.like(f"{prefix}%"),
            )
        )
        seq = (res.scalar() or 0) + 1
        return f"{prefix}{seq:05d}"


manual_payment_service = ManualPaymentService()
