"""
Weekly Wednesday fee-due push notifications.

Rules (from product spec)
-------------------------
* Only fire if today is Wednesday in the configured timezone.
* Targets `StudentFee` rows where:
    - `due_amount > 0`
    - `status != PAID`
    - `due_date < today - FEE_REMINDER_OVERDUE_DAYS` (i.e. "overdue by more than a week")
    - `last_notified_at IS NULL OR last_notified_at < now - FEE_REMINDER_COOLDOWN_DAYS`
      (cooldown prevents double-sends when the dispatcher is re-triggered manually
      on the same day, e.g. after fixing a config error.)
* Each fee row that fires bumps `last_notified_at = now()`.
* Each notification is dispatched to the student's parent's user (if any)
  *and* the student's own login (parent-shared logins are the common case).
* When the fee gets paid in full, `due_amount = 0` and the selector
  automatically excludes it — no explicit "stop" event needed.

Concurrency
-----------
Acquires `cron_locks.fee_reminder_weekly` so two workers running in parallel
(multi-replica or an admin manually triggering during the cron window) cannot
both dispatch the same row.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.communication import CronLock
from app.models.core import Institution
from app.models.directory import Parent, Student
from app.models.finance import StudentFee, StudentFeeStatus
from app.services.call import call_service
from app.services.push import PushNotificationType, push_service

logger = logging.getLogger(__name__)

_LOCK_NAME = "fee_reminder_weekly"
# After this many minutes, an abandoned lock is considered stale and reclaimable.
# Long enough that even a slow dispatch on a school with thousands of overdue
# rows won't get pre-empted; short enough that a process crash mid-dispatch
# doesn't permanently block the next cron.
_LOCK_STALE_MINUTES = 30


@dataclass
class FeeReminderRunSummary:
    """Returned to the API/cron so operators can see exactly what happened."""
    triggered: bool
    skipped_reason: Optional[str]
    eligible_rows: int
    unique_students: int
    push_summary: dict
    call_summary: dict
    notified_fee_ids: List[int]

    def as_dict(self) -> dict:
        return {
            "triggered": self.triggered,
            "skipped_reason": self.skipped_reason,
            "eligible_rows": self.eligible_rows,
            "unique_students": self.unique_students,
            "push": self.push_summary,
            "calls": self.call_summary,
            "notified_fee_ids": self.notified_fee_ids,
        }


def _get_tz():
    """
    Resolve the configured TZ. Falls back to UTC if the host doesn't have
    tzdata for the requested zone (Render's Python image does, but we don't
    want to crash if someone sets a typo'd zone).
    """
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo(settings.FEE_REMINDER_TIMEZONE)
    except Exception:
        logger.warning(
            "[fee-reminder] unknown timezone %r — falling back to UTC",
            settings.FEE_REMINDER_TIMEZONE,
        )
        return timezone.utc


def _now_local() -> datetime:
    return datetime.now(_get_tz())


def is_dispatch_window(now_local: Optional[datetime] = None) -> bool:
    """
    True iff we're inside the Wednesday-at-send-hour window in the configured TZ.
    Window is 1 hour wide so a cron that fires at HH:00 ± a few minutes still
    lands inside, but two crons running at noon and 9am don't both dispatch.
    """
    now = now_local or _now_local()
    # Python weekday: Mon=0..Sun=6 → Wednesday = 2
    if now.weekday() != 2:
        return False
    return now.hour == settings.FEE_REMINDER_SEND_HOUR


class FeeReminderService:
    """
    Stateless dispatch helper. All persistence lives in StudentFee.last_notified_at
    and the cron_locks table.
    """

    async def dispatch_due_reminders(
        self,
        db: AsyncSession,
        *,
        force_day: bool = False,
        dry_run: bool = False,
    ) -> FeeReminderRunSummary:
        """
        Find every overdue student-fee row and push a reminder to the
        student's parent / student logins.

        Args:
          force_day: skip the Wednesday/hour guard. Used by the admin
                     trigger endpoint and tests.
          dry_run:   don't actually push or bump last_notified_at. Lets
                     ops preview the impact before flipping the schedule.
        """
        if not force_day:
            now_local = _now_local()
            if not is_dispatch_window(now_local):
                return FeeReminderRunSummary(
                    triggered=False,
                    skipped_reason=(
                        f"outside dispatch window "
                        f"(weekday={now_local.weekday()} hour={now_local.hour} "
                        f"tz={settings.FEE_REMINDER_TIMEZONE})"
                    ),
                    eligible_rows=0,
                    unique_students=0,
                    push_summary={},
                    call_summary={},
                    notified_fee_ids=[],
                )

        # ── acquire the distributed lock ────────────────────────────────────
        # We re-use the existing cron_locks table. INSERT-or-do-nothing pattern
        # gives us a single-row mutex without needing PG's pg_advisory_lock.
        acquired = await self._acquire_lock(db)
        if not acquired:
            return FeeReminderRunSummary(
                triggered=False,
                skipped_reason="another dispatch is already running (lock held)",
                eligible_rows=0,
                unique_students=0,
                push_summary={},
                call_summary={},
                notified_fee_ids=[],
            )

        try:
            return await self._run_locked(db, dry_run=dry_run)
        finally:
            await self._release_lock(db)

    async def _run_locked(self, db: AsyncSession, *, dry_run: bool) -> FeeReminderRunSummary:
        from datetime import date as date_type

        today_local = _now_local().date()
        overdue_cutoff: date_type = today_local - timedelta(days=settings.FEE_REMINDER_OVERDUE_DAYS)
        cooldown_cutoff: datetime = datetime.now(timezone.utc) - timedelta(days=settings.FEE_REMINDER_COOLDOWN_DAYS)

        # Eligible rows
        stmt = (
            select(StudentFee)
            .where(
                StudentFee.due_amount > 0,
                StudentFee.status != StudentFeeStatus.PAID,
                StudentFee.due_date < overdue_cutoff,
                or_(
                    StudentFee.last_notified_at.is_(None),
                    StudentFee.last_notified_at < cooldown_cutoff,
                ),
            )
            .options(
                selectinload(StudentFee.student).selectinload(Student.parent),
                selectinload(StudentFee.institution),
            )
        )
        fees = (await db.execute(stmt)).scalars().all()

        if not fees:
            return FeeReminderRunSummary(
                triggered=True,
                skipped_reason=None,
                eligible_rows=0,
                unique_students=0,
                push_summary={"sent": 0, "failed": 0, "tokens": 0},
                call_summary={"placed": 0, "failed": 0, "skipped_no_phone": 0},
                notified_fee_ids=[],
            )

        # Group by institution so each push batch belongs to one tenant.
        # Most schools will only have one row here; this is just defensive.
        by_institution: dict[int, list[StudentFee]] = {}
        for f in fees:
            by_institution.setdefault(f.institution_id, []).append(f)

        notified_ids: List[int] = []
        combined_push = {"sent": 0, "failed": 0, "tokens": 0, "invalidated": 0}
        combined_calls = {"placed": 0, "failed": 0, "skipped_no_phone": 0}
        unique_students = 0
        voice_calls_enabled = bool(settings.FEE_REMINDER_VOICE_CALLS_ENABLED)

        for institution_id, rows in by_institution.items():
            student_ids = list({r.student_id for r in rows if r.student_id is not None})
            unique_students += len(student_ids)
            if not student_ids:
                continue

            # Resolve target user_ids: parent's login + student's own login.
            parent_users = (await db.execute(
                select(Parent.user_id, Student.id)
                .join(Student, Student.parent_id == Parent.id)
                .where(Student.id.in_(student_ids))
            )).all()
            student_users = (await db.execute(
                select(Student.user_id, Student.id)
                .where(Student.id.in_(student_ids))
            )).all()

            # Index user-ids by student so each fee row can target its own family.
            users_by_student: dict[int, set[int]] = {}
            for user_id, sid in parent_users:
                if user_id is not None:
                    users_by_student.setdefault(sid, set()).add(user_id)
            for user_id, sid in student_users:
                if user_id is not None:
                    users_by_student.setdefault(sid, set()).add(user_id)

            for fee in rows:
                target_users = list(users_by_student.get(fee.student_id, set()))
                if not target_users:
                    # No login for this student / parent — flag and move on so
                    # we don't keep selecting the same dead row every week.
                    if not dry_run:
                        fee.last_notified_at = datetime.now(timezone.utc)
                        await db.flush()
                    logger.info(
                        "[fee-reminder] no logins for student %s — bumping last_notified_at to suppress",
                        fee.student_id,
                    )
                    continue

                days_overdue = (today_local - fee.due_date).days
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

                # Voice call to the parent's phone alongside the push.
                # Failures here are non-fatal — we still bump cooldown and keep
                # the run going so one bad row can't poison the whole batch.
                if voice_calls_enabled:
                    call_outcome = await self._place_overdue_call(
                        fee=fee,
                        student_name=student_name,
                        days_overdue=days_overdue,
                    )
                    combined_calls[call_outcome] = combined_calls.get(call_outcome, 0) + 1

                # Bump cooldown even if Expo had no tokens — otherwise we
                # keep re-selecting the same row every hour the scheduler ticks.
                fee.last_notified_at = datetime.now(timezone.utc)
                await db.flush()
                notified_ids.append(fee.id)

                # accumulate
                for k in ("sent", "failed", "tokens", "invalidated"):
                    combined_push[k] = combined_push.get(k, 0) + int(summary.get(k, 0) or 0)

        if not dry_run:
            await db.commit()

        return FeeReminderRunSummary(
            triggered=True,
            skipped_reason=None,
            eligible_rows=len(fees),
            unique_students=unique_students,
            push_summary=combined_push,
            call_summary=combined_calls,
            notified_fee_ids=notified_ids,
        )

    # ── voice call ──────────────────────────────────────────────────────────

    async def _place_overdue_call(
        self,
        *,
        fee: StudentFee,
        student_name: str,
        days_overdue: int,
    ) -> str:
        """
        Place the weekly overdue-fee voice call to the parent's phone.

        Returns one of: 'placed', 'failed', 'skipped_no_phone'. Never raises —
        a failed call must not block the rest of the batch.
        """
        phone = self._resolve_parent_phone(fee)
        if not phone:
            logger.info(
                "[fee-reminder] no phone on file for student %s — skipping call",
                fee.student_id,
            )
            return "skipped_no_phone"

        school_name = self._school_name_for(fee)
        # ₹ doesn't speak well in TTS, so spell out the currency.
        amount_text = f"{fee.due_amount:,.0f} rupees"
        message = (
            f"Hello, this is a fee payment reminder from {school_name}. "
            f"{student_name} has a fee of {amount_text} which is overdue by "
            f"{days_overdue} days. Please pay at your earliest convenience. "
            f"Thank you."
        )

        try:
            result = await call_service.place_call(to_number=phone, message=message)
        except Exception:
            # call_service is supposed to swallow its own errors; this is
            # belt-and-braces so an unexpected crash never aborts the batch.
            logger.exception(
                "[fee-reminder] unexpected error placing call for fee %s", fee.id,
            )
            return "failed"

        if result.success:
            logger.info(
                "[fee-reminder] call queued for fee=%s student=%s sid=%s",
                fee.id, fee.student_id, result.sid,
            )
            return "placed"

        logger.warning(
            "[fee-reminder] call failed for fee=%s student=%s error=%s vendor_code=%s",
            fee.id, fee.student_id, result.error, result.vendor_code,
        )
        return "failed"

    @staticmethod
    def _resolve_parent_phone(fee: StudentFee) -> Optional[str]:
        """
        Prefer the linked Parent.phone (canonical). Fall back to the
        denormalized Student.parent_phone — many parent logins are shared
        with the student and don't have a Parent row.
        """
        student = fee.student
        if student is None:
            return None
        parent = getattr(student, "parent", None)
        if parent and getattr(parent, "phone", None):
            return parent.phone
        if getattr(student, "parent_phone", None):
            return student.parent_phone
        return None

    @staticmethod
    def _school_name_for(fee: StudentFee) -> str:
        institution = getattr(fee, "institution", None)
        name = getattr(institution, "name", None) if institution else None
        return name or "your school"

    # ── lock helpers ────────────────────────────────────────────────────────

    async def _acquire_lock(self, db: AsyncSession) -> bool:
        """
        Try to claim the cron lock. Treats a row older than `_LOCK_STALE_MINUTES`
        as abandoned and steals it — guards against a crashed dispatcher
        leaving the row behind forever.
        """
        from sqlalchemy import delete

        # Sweep stale lock first (idempotent)
        stale_cutoff = datetime.now(timezone.utc) - timedelta(minutes=_LOCK_STALE_MINUTES)
        await db.execute(
            delete(CronLock).where(
                CronLock.name == _LOCK_NAME,
                CronLock.locked_at < stale_cutoff,
            )
        )
        await db.commit()

        try:
            db.add(CronLock(name=_LOCK_NAME))
            await db.commit()
            return True
        except Exception:
            # Unique-key violation = lock held by someone else; safe to back off.
            await db.rollback()
            return False

    async def _release_lock(self, db: AsyncSession) -> None:
        from sqlalchemy import delete
        try:
            await db.execute(delete(CronLock).where(CronLock.name == _LOCK_NAME))
            await db.commit()
        except Exception:
            logger.exception("[fee-reminder] lock release failed (will go stale)")
            await db.rollback()


fee_reminder_service = FeeReminderService()
