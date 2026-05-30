"""
Fee-reminder dispatch engine.

Reminders go out when:
  * an admin clicks "Send Fee Reminders" in the Finance UI (primary path), or
  * the optional per-institution scheduler decides it's time (opt-in only)

This module does NOT decide *when* to fire. It only resolves who is eligible
and pushes (+ optionally voice-calls). Schedule is owned by
`FeeReminderSettings` on the institution and by the scheduler loop in
`fee_reminder_scheduler.py`.

Eligibility rules (unchanged from the previous cron-only version):
  - `StudentFee.due_amount > 0`
  - `StudentFee.status != PAID`
  - `due_date < today − overdue_days`
  - `last_notified_at IS NULL OR last_notified_at < now − cooldown_days`

Each row that fires bumps `last_notified_at = now()` so admins can mash the
button without spamming parents.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.communication import CronLock
from app.models.directory import Parent, Student
from app.models.finance import (
    StudentFee, StudentFeeStatus,
    FeeReminderSettings, FeeReminderAutomationMode,
)
from app.services.call import call_service
from app.services.push import PushNotificationType, push_service

logger = logging.getLogger(__name__)


# Per-institution lock so two institutions can dispatch in parallel but a
# single institution can never double-dispatch (admin click + scheduler
# tick + a second admin click within seconds of each other).
def _lock_name(institution_id: int) -> str:
    return f"fee_reminder_dispatch_inst_{institution_id}"


_LOCK_STALE_MINUTES = 30


@dataclass
class FeeReminderRunSummary:
    """Returned to the API so admins can see exactly what happened."""
    triggered: bool
    skipped_reason: Optional[str]
    eligible_rows: int
    unique_students: int
    skipped_no_target: int
    push_summary: dict
    call_summary: dict
    notified_fee_ids: List[int]
    # First vendor error encountered during the run — surfaced so the
    # admin UI can show "Twilio trial account: number unverified" instead
    # of just a silent "0 calls placed". None when no call errored.
    first_call_error: Optional[str] = None

    def as_dict(self) -> dict:
        return {
            "triggered": self.triggered,
            "skipped_reason": self.skipped_reason,
            "eligible_rows": self.eligible_rows,
            "unique_students": self.unique_students,
            "skipped_no_target": self.skipped_no_target,
            "push": self.push_summary,
            "calls": self.call_summary,
            "notified_fee_ids": self.notified_fee_ids,
            "first_call_error": self.first_call_error,
        }


@dataclass
class EligibleFeePreview:
    """
    Lightweight row returned by the preview endpoint.

    The preview lists every overdue, unpaid fee — even those currently
    blocked by cooldown or missing a login target — so admins can see
    the full picture instead of an opaque 0. `eligible_now` reflects
    whether THIS row would actually be notified if the admin clicked
    Send right now; the UI buckets rows on that flag.
    """
    student_fee_id: int
    student_id: int
    student_name: str
    class_name: Optional[str]
    parent_name: Optional[str]
    parent_phone: Optional[str]
    due_amount: float
    due_date: str   # ISO date
    days_overdue: int
    last_notified_at: Optional[str]  # ISO datetime or None
    has_login_target: bool
    has_phone: bool
    in_cooldown: bool
    eligible_now: bool
    skip_reason: Optional[str]  # human-readable: "in cooldown", "no parent/student login", etc.


def _get_tz(tz_name: Optional[str] = None):
    """Resolve a tz name. Falls back to UTC for unknown names."""
    name = tz_name or settings.FEE_REMINDER_TIMEZONE
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo(name)
    except Exception:
        logger.warning("[fee-reminder] unknown timezone %r — falling back to UTC", name)
        return timezone.utc


def _now_local(tz_name: Optional[str] = None) -> datetime:
    return datetime.now(_get_tz(tz_name))


class FeeReminderService:
    """
    Stateless dispatch helper. Persistence lives in StudentFee.last_notified_at
    and cron_locks. Per-institution config lives in FeeReminderSettings.
    """

    # ── settings helpers ────────────────────────────────────────────────────

    async def get_or_create_settings(
        self, db: AsyncSession, institution_id: int,
    ) -> FeeReminderSettings:
        """
        Lazily create a DISABLED row for institutions that have never
        touched the settings UI. Single round-trip on the hot path.
        """
        res = await db.execute(
            select(FeeReminderSettings).where(
                FeeReminderSettings.institution_id == institution_id
            )
        )
        row = res.scalars().first()
        if row:
            return row

        row = FeeReminderSettings(
            institution_id=institution_id,
            automation_mode=FeeReminderAutomationMode.DISABLED.value,
            send_hour=settings.FEE_REMINDER_SEND_HOUR,
            timezone=settings.FEE_REMINDER_TIMEZONE,
            voice_calls_enabled=settings.FEE_REMINDER_VOICE_CALLS_ENABLED,
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row

    def _effective_overdue_days(self, s: FeeReminderSettings) -> int:
        return s.overdue_days if s.overdue_days is not None else settings.FEE_REMINDER_OVERDUE_DAYS

    def _effective_cooldown_days(self, s: FeeReminderSettings) -> int:
        return s.cooldown_days if s.cooldown_days is not None else settings.FEE_REMINDER_COOLDOWN_DAYS

    # ── preview ─────────────────────────────────────────────────────────────

    async def preview_eligible(
        self, db: AsyncSession, *, institution_id: int,
    ) -> List[EligibleFeePreview]:
        """
        Return every overdue, unpaid StudentFee row for this institution
        — including rows currently blocked by cooldown or missing a login
        target. Each row carries `eligible_now` + `skip_reason` so the admin
        UI can show the full population and explain why specific rows would
        be skipped if they hit Send right now.

        The actual dispatch call uses the stricter `_select_eligible_rows`
        and only notifies rows where `eligible_now == True`.
        """
        s = await self.get_or_create_settings(db, institution_id)
        rows = await self._select_overdue_rows(db, institution_id=institution_id, s=s)

        # Resolve target users in bulk so we can flag has_login on the preview.
        student_ids = [r.student_id for r in rows if r.student_id is not None]
        users_by_student: dict[int, set[int]] = {}
        if student_ids:
            parent_users = (await db.execute(
                select(Parent.user_id, Student.id)
                .join(Student, Student.parent_id == Parent.id)
                .where(Student.id.in_(student_ids))
            )).all()
            student_users = (await db.execute(
                select(Student.user_id, Student.id)
                .where(Student.id.in_(student_ids))
            )).all()
            for user_id, sid in parent_users:
                if user_id is not None:
                    users_by_student.setdefault(sid, set()).add(user_id)
            for user_id, sid in student_users:
                if user_id is not None:
                    users_by_student.setdefault(sid, set()).add(user_id)

        today = _now_local(s.timezone).date()
        cooldown_cutoff = datetime.now(timezone.utc) - timedelta(
            days=self._effective_cooldown_days(s)
        )

        previews: List[EligibleFeePreview] = []
        for fee in rows:
            student = fee.student
            student_name = student.name if student else f"Student #{fee.student_id}"
            class_name: Optional[str] = None
            parent_name: Optional[str] = None
            parent_phone: Optional[str] = None

            if student:
                sc = getattr(student, "school_class", None)
                class_name = getattr(sc, "display_name", None) if sc else None
                parent = getattr(student, "parent", None)
                if parent:
                    parent_name = getattr(parent, "name", None)
                    parent_phone = getattr(parent, "primary_phone", None) or getattr(parent, "secondary_phone", None)

            has_login = bool(users_by_student.get(fee.student_id))
            in_cooldown = (
                fee.last_notified_at is not None
                and fee.last_notified_at >= cooldown_cutoff
            )

            # Skip reasons follow the same order the dispatcher uses, so
            # `skip_reason` matches what would actually have happened.
            skip_reason: Optional[str] = None
            if in_cooldown:
                skip_reason = "in cooldown"
            elif not has_login:
                skip_reason = "no parent/student login linked"

            eligible_now = skip_reason is None

            days_overdue = max(0, (today - fee.due_date).days) if fee.due_date else 0

            previews.append(EligibleFeePreview(
                student_fee_id=fee.id,
                student_id=fee.student_id,
                student_name=student_name,
                class_name=class_name,
                parent_name=parent_name,
                parent_phone=parent_phone,
                due_amount=float(fee.due_amount or 0.0),
                due_date=fee.due_date.isoformat() if fee.due_date else "",
                days_overdue=days_overdue,
                last_notified_at=fee.last_notified_at.isoformat() if fee.last_notified_at else None,
                has_login_target=has_login,
                has_phone=bool(parent_phone),
                in_cooldown=in_cooldown,
                eligible_now=eligible_now,
                skip_reason=skip_reason,
            ))

        # Eligible-now first; then by most overdue; then highest amount; then name.
        previews.sort(key=lambda p: (
            0 if p.eligible_now else 1,
            -p.days_overdue,
            -p.due_amount,
            p.student_name,
        ))
        return previews

    # ── dispatch ────────────────────────────────────────────────────────────

    async def dispatch_due_reminders(
        self,
        db: AsyncSession,
        *,
        institution_id: int,
        triggered_by: str = "manual",
        dry_run: bool = False,
    ) -> FeeReminderRunSummary:
        """
        Push a reminder to every overdue family at this institution.

        Always proceeds — no Wednesday / hour gate. The schedule decision
        belongs to the caller (admin click, scheduler tick). Lock + cooldown
        guarantee that mashing the button can't double-send.

        Args:
          institution_id: tenant scope (required).
          triggered_by:   audit tag stored on settings.last_run_triggered_by.
                          Use "manual" for admin clicks, "automatic" for
                          scheduler firings.
          dry_run:        compute eligibility + targets without sending or
                          bumping last_notified_at. Returned summary mirrors
                          what a real run would have produced.
        """
        acquired = await self._acquire_lock(db, institution_id)
        if not acquired:
            return FeeReminderRunSummary(
                triggered=False,
                skipped_reason="another dispatch is already running for this institution",
                eligible_rows=0,
                unique_students=0,
                skipped_no_target=0,
                push_summary={},
                call_summary={},
                notified_fee_ids=[],
            )

        try:
            summary = await self._run_locked(
                db, institution_id=institution_id, dry_run=dry_run,
            )
        finally:
            await self._release_lock(db, institution_id)

        if not dry_run:
            await self._record_run(
                db,
                institution_id=institution_id,
                summary=summary,
                triggered_by=triggered_by,
            )
        return summary

    async def _select_overdue_rows(
        self,
        db: AsyncSession,
        *,
        institution_id: int,
        s: FeeReminderSettings,
    ) -> List[StudentFee]:
        """
        Every overdue, unpaid fee for this institution — does NOT apply the
        cooldown filter. Used by the preview so the admin sees the full
        population, including rows currently silenced by cooldown.
        """
        from datetime import date as date_type

        today_local = _now_local(s.timezone).date()
        overdue_cutoff: date_type = today_local - timedelta(
            days=self._effective_overdue_days(s)
        )

        stmt = (
            select(StudentFee)
            .where(
                StudentFee.institution_id == institution_id,
                StudentFee.due_amount > 0,
                StudentFee.status != StudentFeeStatus.PAID,
                StudentFee.due_date < overdue_cutoff,
            )
            .options(
                selectinload(StudentFee.student).selectinload(Student.parent),
                selectinload(StudentFee.school_class),
                selectinload(StudentFee.institution),
            )
        )
        return list((await db.execute(stmt)).scalars().all())

    async def _select_eligible_rows(
        self,
        db: AsyncSession,
        *,
        institution_id: int,
        s: FeeReminderSettings,
    ) -> List[StudentFee]:
        """
        Rows that will ACTUALLY be notified by the next dispatch: overdue
        AND outside the cooldown window. Caller still has to gate on
        whether each row has a login target before pushing.
        """
        cooldown_cutoff: datetime = datetime.now(timezone.utc) - timedelta(
            days=self._effective_cooldown_days(s)
        )
        overdue_rows = await self._select_overdue_rows(
            db, institution_id=institution_id, s=s,
        )
        return [
            f for f in overdue_rows
            if f.last_notified_at is None or f.last_notified_at < cooldown_cutoff
        ]

    async def _run_locked(
        self,
        db: AsyncSession,
        *,
        institution_id: int,
        dry_run: bool,
    ) -> FeeReminderRunSummary:
        s = await self.get_or_create_settings(db, institution_id)
        fees = await self._select_eligible_rows(
            db, institution_id=institution_id, s=s,
        )

        if not fees:
            return FeeReminderRunSummary(
                triggered=True,
                skipped_reason=None,
                eligible_rows=0,
                unique_students=0,
                skipped_no_target=0,
                push_summary={"sent": 0, "failed": 0, "tokens": 0},
                call_summary={"placed": 0, "failed": 0, "skipped_no_phone": 0},
                notified_fee_ids=[],
            )

        from datetime import date as date_type
        today_local = _now_local(s.timezone).date()
        voice_calls_enabled = bool(s.voice_calls_enabled)

        # Resolve user_ids: parent's login + student's own login.
        student_ids = list({r.student_id for r in fees if r.student_id is not None})
        parent_users = (await db.execute(
            select(Parent.user_id, Student.id)
            .join(Student, Student.parent_id == Parent.id)
            .where(Student.id.in_(student_ids))
        )).all()
        student_users = (await db.execute(
            select(Student.user_id, Student.id)
            .where(Student.id.in_(student_ids))
        )).all()

        users_by_student: dict[int, set[int]] = {}
        for user_id, sid in parent_users:
            if user_id is not None:
                users_by_student.setdefault(sid, set()).add(user_id)
        for user_id, sid in student_users:
            if user_id is not None:
                users_by_student.setdefault(sid, set()).add(user_id)

        notified_ids: List[int] = []
        skipped_no_target = 0
        combined_push = {"sent": 0, "failed": 0, "tokens": 0, "invalidated": 0}
        combined_calls = {"placed": 0, "failed": 0, "skipped_no_phone": 0}
        first_call_error: Optional[str] = None
        unique_students = len(student_ids)

        for fee in fees:
            target_users = list(users_by_student.get(fee.student_id, set()))
            if not target_users:
                # No login for this student / parent — surface as a real
                # data gap instead of silently consuming cooldown. Admin
                # needs to link a Parent / Student.user_id row before any
                # push can reach them.
                skipped_no_target += 1
                logger.info(
                    "[fee-reminder] no logins for student %s — skipping (not bumping cooldown)",
                    fee.student_id,
                )
                continue

            days_overdue = max(0, (today_local - fee.due_date).days) if fee.due_date else 0
            student_name = fee.student.name if fee.student else "your ward"
            title = "Fee payment overdue"
            body = (
                f"{student_name} has ₹{fee.due_amount:,.0f} due "
                f"({days_overdue} days overdue). Tap to pay."
            )
            data_payload = {
                "type": PushNotificationType.FEE_REMINDER.value,
                "student_id": fee.student_id,
                "student_fee_id": fee.id,
                "due_amount": float(fee.due_amount),
                "due_date": fee.due_date.isoformat() if fee.due_date else None,
                "days_overdue": days_overdue,
                "screen": "/(parent)/fees",
            }

            if dry_run:
                notified_ids.append(fee.id)
                continue

            summary = await push_service.send_to_users(
                db,
                institution_id=institution_id,
                user_ids=target_users,
                title=title,
                body=body,
                data=data_payload,
                notification_type=PushNotificationType.FEE_REMINDER,
                reference_id=str(fee.id),
                priority="high",
            )

            if voice_calls_enabled:
                call_outcome, call_error = await self._place_overdue_call(
                    fee=fee,
                    student_name=student_name,
                    days_overdue=days_overdue,
                )
                combined_calls[call_outcome] = combined_calls.get(call_outcome, 0) + 1
                if call_outcome == "failed" and first_call_error is None:
                    first_call_error = call_error

            fee.last_notified_at = datetime.now(timezone.utc)
            await db.flush()
            notified_ids.append(fee.id)

            for k in ("sent", "failed", "tokens", "invalidated"):
                combined_push[k] = combined_push.get(k, 0) + int(summary.get(k, 0) or 0)

        if not dry_run:
            await db.commit()

        return FeeReminderRunSummary(
            triggered=True,
            skipped_reason=None,
            eligible_rows=len(fees),
            unique_students=unique_students,
            skipped_no_target=skipped_no_target,
            push_summary=combined_push,
            call_summary=combined_calls,
            notified_fee_ids=notified_ids,
            first_call_error=first_call_error,
        )

    async def _record_run(
        self,
        db: AsyncSession,
        *,
        institution_id: int,
        summary: FeeReminderRunSummary,
        triggered_by: str,
    ) -> None:
        s = await self.get_or_create_settings(db, institution_id)
        s.last_run_at = datetime.now(timezone.utc)
        s.last_run_summary = json.dumps(summary.as_dict(), default=str)
        s.last_run_triggered_by = triggered_by
        await db.commit()

    # ── voice call ──────────────────────────────────────────────────────────

    async def _place_overdue_call(
        self,
        *,
        fee: StudentFee,
        student_name: str,
        days_overdue: int,
    ) -> tuple[str, Optional[str]]:
        """
        Place an overdue-fee voice call. Returns (outcome, error_message).
        outcome is one of: 'placed', 'failed', 'skipped_no_phone'.
        error_message is the vendor error string when outcome == 'failed',
        otherwise None. Never raises.
        """
        phone = self._resolve_parent_phone(fee)
        if not phone:
            logger.info(
                "[fee-reminder] no phone for student %s — skipping call",
                fee.student_id,
            )
            return "skipped_no_phone", None

        school_name = self._school_name_for(fee)
        amount_text = f"{fee.due_amount:,.0f} rupees"
        message = (
            f"Hello, this is a fee payment reminder from {school_name}. "
            f"{student_name} has a fee of {amount_text} which is overdue by "
            f"{days_overdue} days. Please pay at your earliest convenience. "
            f"Thank you."
        )

        try:
            result = await call_service.place_call(to_number=phone, message=message)
        except Exception as e:  # noqa: BLE001
            logger.exception(
                "[fee-reminder] unexpected error placing call for fee %s", fee.id,
            )
            return "failed", f"unexpected error: {e}"

        if result.success:
            return "placed", None
        logger.warning(
            "[fee-reminder] call failed for fee=%s student=%s error=%s vendor_code=%s",
            fee.id, fee.student_id, result.error, result.vendor_code,
        )
        return "failed", result.error or "vendor returned no detail"

    @staticmethod
    def _resolve_parent_phone(fee: StudentFee) -> Optional[str]:
        student = fee.student
        if student is None:
            return None
        parent = getattr(student, "parent", None)
        if parent:
            return getattr(parent, "primary_phone", None) or getattr(parent, "secondary_phone", None)
        return None

    @staticmethod
    def _school_name_for(fee: StudentFee) -> str:
        institution = getattr(fee, "institution", None)
        name = getattr(institution, "name", None) if institution else None
        return name or "your school"

    # ── lock helpers (per-institution) ──────────────────────────────────────

    async def _acquire_lock(self, db: AsyncSession, institution_id: int) -> bool:
        from sqlalchemy import delete

        name = _lock_name(institution_id)
        stale_cutoff = datetime.now(timezone.utc) - timedelta(minutes=_LOCK_STALE_MINUTES)
        await db.execute(
            delete(CronLock).where(
                CronLock.name == name,
                CronLock.locked_at < stale_cutoff,
            )
        )
        await db.commit()

        try:
            db.add(CronLock(name=name))
            await db.commit()
            return True
        except Exception:
            await db.rollback()
            return False

    async def _release_lock(self, db: AsyncSession, institution_id: int) -> None:
        from sqlalchemy import delete
        name = _lock_name(institution_id)
        try:
            await db.execute(delete(CronLock).where(CronLock.name == name))
            await db.commit()
        except Exception:
            logger.exception("[fee-reminder] lock release failed (will go stale)")
            await db.rollback()


fee_reminder_service = FeeReminderService()
