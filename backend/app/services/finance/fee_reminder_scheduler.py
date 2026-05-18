"""
Lightweight in-process scheduler for the weekly Wednesday fee-reminder push.

Why not APScheduler? It works fine but adds a dep + a thread/event-loop story.
For a single small process the loop below is enough and uses no extra deps.

Behaviour
---------
* On startup we compute the next Wednesday-at-`FEE_REMINDER_SEND_HOUR` in the
  configured TZ and sleep until then. After firing, we sleep another 7 days.
* The dispatch itself is gated by:
    - `is_dispatch_window` (the service double-checks the day/hour)
    - `cron_locks.fee_reminder_weekly` (multi-replica safe)
    - `StudentFee.last_notified_at` cooldown (idempotent per row)
  So duplicate firings can never produce duplicate sends.
* Errors are caught + logged; the loop never exits on transient failure.

Wired into the FastAPI lifespan in app/main.py. Disabled when
`FEE_REMINDER_SCHEDULER_ENABLED=false` — for ops that prefer to trigger
via an external cron hitting POST /api/finance/fee-reminders/dispatch.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.config import settings
from app.services.finance.fee_reminder_service import _get_tz, fee_reminder_service

logger = logging.getLogger(__name__)

_scheduler_task: Optional[asyncio.Task] = None


def _next_wednesday(now_local: datetime) -> datetime:
    """
    The next Wednesday-at-SEND_HOUR strictly in the future.
    If today is Wednesday but the send hour has already passed, returns
    next week's Wednesday. If today is Wednesday and we're before the send
    hour, returns today at the send hour.
    """
    send_hour = settings.FEE_REMINDER_SEND_HOUR
    today_target = now_local.replace(hour=send_hour, minute=0, second=0, microsecond=0)

    # Python weekday: Mon=0..Sun=6 → Wednesday = 2
    days_until_wed = (2 - now_local.weekday()) % 7

    if days_until_wed == 0:
        # It's Wednesday today
        if now_local < today_target:
            return today_target
        return today_target + timedelta(days=7)

    return today_target + timedelta(days=days_until_wed)


async def _run_one_dispatch() -> None:
    """One iteration of the scheduler — opens its own session."""
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        try:
            # `force_day=False` keeps the service's safety guard in play, so
            # if the host clock is wrong and we somehow get here on a Tuesday,
            # the service still no-ops.
            summary = await fee_reminder_service.dispatch_due_reminders(session)
            logger.info("[fee-reminder] scheduled run finished: %s", summary.as_dict())
        except Exception:
            logger.exception("[fee-reminder] scheduled run errored — will retry next cycle")


async def _scheduler_loop() -> None:
    tz = _get_tz()
    logger.info(
        "[fee-reminder] scheduler started (tz=%s, send_hour=%d, overdue=%dd, cooldown=%dd)",
        settings.FEE_REMINDER_TIMEZONE,
        settings.FEE_REMINDER_SEND_HOUR,
        settings.FEE_REMINDER_OVERDUE_DAYS,
        settings.FEE_REMINDER_COOLDOWN_DAYS,
    )

    while True:
        now = datetime.now(tz)
        next_fire = _next_wednesday(now)
        sleep_seconds = max(60.0, (next_fire - now).total_seconds())
        logger.info("[fee-reminder] next dispatch scheduled for %s (in %.1f hours)",
                    next_fire.isoformat(), sleep_seconds / 3600)

        try:
            await asyncio.sleep(sleep_seconds)
        except asyncio.CancelledError:
            logger.info("[fee-reminder] scheduler cancelled — exiting cleanly")
            raise

        await _run_one_dispatch()
        # After a successful dispatch, sleep a minute so we don't immediately
        # re-enter the dispatch window on a fast loop iteration.
        await asyncio.sleep(60)


def start_scheduler() -> Optional[asyncio.Task]:
    """
    Spawn the scheduler task if enabled. Idempotent — calling twice is a no-op.
    Returns the task handle for the lifespan to cancel on shutdown.
    """
    global _scheduler_task

    if not settings.FEE_REMINDER_SCHEDULER_ENABLED:
        logger.info("[fee-reminder] scheduler disabled by config (FEE_REMINDER_SCHEDULER_ENABLED=false)")
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
