"""
Optional automation loop for fee reminders.

Default state: NO institution has automation enabled. This loop spins
every `_TICK_INTERVAL_SECONDS` and only fires for institutions whose
`FeeReminderSettings.automation_mode != DISABLED` AND whose configured
schedule says "now is the time". Admin click-to-send remains the primary
path — this loop is purely belt-and-braces convenience for institutions
that opt into recurring sends.

Three modes per institution:
  * DISABLED — loop ignores this institution entirely
  * WEEKLY   — fires on `day_of_week` at `send_hour` (institution's TZ)
  * MONTHLY  — fires on `day_of_month` at `send_hour` (institution's TZ)
  * CUSTOM   — admin-managed: dispatch lives in the loop only when the
               admin pokes `last_run_at` to NULL or via an admin endpoint;
               this mode is reserved and currently behaves like DISABLED
               so we never spam without an explicit schedule the user
               configured.

Why a poll loop instead of cron expressions / APScheduler:
  * Schedules are per-institution and rare events (weekly/monthly at most).
    A 5-minute polling tick is far cheaper than maintaining N cron jobs.
  * No extra dependency; the existing FastAPI lifespan + asyncio is enough.
  * Self-heals after process restart — re-reads settings on every tick.

Disabled entirely when `FEE_REMINDER_SCHEDULER_ENABLED=false`.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select

from app.core.config import settings
from app.services.finance.fee_reminder_service import (
    _get_tz, fee_reminder_service,
)

logger = logging.getLogger(__name__)

_scheduler_task: Optional[asyncio.Task] = None

# How often the loop wakes up to inspect institution settings. 5 minutes is
# fine-grained enough to hit an HH:00 send window within ~5 minutes of the
# intended hour, and infrequent enough that a 1000-school deployment runs
# 12 cheap SELECTs per hour instead of one per minute.
_TICK_INTERVAL_SECONDS = 300

# After firing, wait at least this long before this institution can fire
# again in the same loop pass — defence-in-depth on top of the per-row
# `last_notified_at` cooldown.
_MIN_RUN_GAP = timedelta(hours=22)


async def _is_due(s, now_utc: datetime) -> bool:
    """
    True iff the institution's schedule says we should dispatch right now.
    Caller must have already verified `automation_mode != DISABLED`.
    """
    from app.models.finance import FeeReminderAutomationMode

    mode = s.automation_mode
    if mode == FeeReminderAutomationMode.DISABLED.value:
        return False
    if mode == FeeReminderAutomationMode.CUSTOM.value:
        # Reserved — no schedule semantics defined yet, so refuse to fire.
        return False

    tz = _get_tz(s.timezone)
    now_local = now_utc.astimezone(tz)

    if now_local.hour != int(s.send_hour or 9):
        return False

    if mode == FeeReminderAutomationMode.WEEKLY.value:
        if s.day_of_week is None:
            return False
        if now_local.weekday() != int(s.day_of_week):
            return False
    elif mode == FeeReminderAutomationMode.MONTHLY.value:
        if s.day_of_month is None:
            return False
        # Cap at 28 so February doesn't get skipped — admins setting "31st"
        # would otherwise never fire in Feb/Apr/Jun/Sep/Nov.
        target_dom = min(int(s.day_of_month), 28)
        if now_local.day != target_dom:
            return False
    else:
        return False

    # Don't re-fire if we already ran in the last 22h.
    if s.last_run_at and (now_utc - s.last_run_at) < _MIN_RUN_GAP:
        return False

    return True


async def _tick() -> None:
    """One pass of the scheduler. Opens its own DB session."""
    from app.core.database import AsyncSessionLocal
    from app.models.finance import FeeReminderSettings, FeeReminderAutomationMode

    async with AsyncSessionLocal() as session:
        try:
            res = await session.execute(
                select(FeeReminderSettings).where(
                    FeeReminderSettings.automation_mode
                    != FeeReminderAutomationMode.DISABLED.value
                )
            )
            candidates = list(res.scalars().all())
        except Exception:
            logger.exception("[fee-reminder] settings lookup failed — skipping tick")
            return

        if not candidates:
            return

        now_utc = datetime.now(timezone.utc)
        for s in candidates:
            try:
                due = await _is_due(s, now_utc)
            except Exception:
                logger.exception(
                    "[fee-reminder] schedule check failed for institution %s",
                    s.institution_id,
                )
                continue
            if not due:
                continue

            logger.info(
                "[fee-reminder] automation firing for institution %s (mode=%s)",
                s.institution_id, s.automation_mode,
            )
            try:
                summary = await fee_reminder_service.dispatch_due_reminders(
                    session,
                    institution_id=s.institution_id,
                    triggered_by="automatic",
                )
                logger.info(
                    "[fee-reminder] automatic run finished for institution %s: %s",
                    s.institution_id, summary.as_dict(),
                )
            except Exception:
                logger.exception(
                    "[fee-reminder] automatic run errored for institution %s",
                    s.institution_id,
                )


async def _scheduler_loop() -> None:
    logger.info(
        "[fee-reminder] scheduler loop running (tick=%ds). Default per-institution "
        "automation is DISABLED — admin click-to-send is the primary path.",
        _TICK_INTERVAL_SECONDS,
    )
    while True:
        try:
            await _tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("[fee-reminder] unexpected error in tick loop")

        try:
            await asyncio.sleep(_TICK_INTERVAL_SECONDS)
        except asyncio.CancelledError:
            logger.info("[fee-reminder] scheduler cancelled — exiting cleanly")
            raise


def start_scheduler() -> Optional[asyncio.Task]:
    """Spawn the automation loop iff config allows. Idempotent."""
    global _scheduler_task

    if not settings.FEE_REMINDER_SCHEDULER_ENABLED:
        logger.info(
            "[fee-reminder] automation loop disabled by config "
            "(FEE_REMINDER_SCHEDULER_ENABLED=false). Admin click-to-send still works."
        )
        return None

    if _scheduler_task and not _scheduler_task.done():
        return _scheduler_task

    _scheduler_task = asyncio.create_task(_scheduler_loop(), name="fee-reminder-scheduler")
    return _scheduler_task


async def stop_scheduler() -> None:
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        try:
            await _scheduler_task
        except asyncio.CancelledError:
            pass
    _scheduler_task = None
