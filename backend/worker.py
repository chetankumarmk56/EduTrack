"""
Standalone worker entrypoint for the optional fee-reminder automation loop.

Run:
    python worker.py

When started, this process forces ``FEE_REMINDER_SCHEDULER_ENABLED=true``
and spawns the per-institution automation loop. The loop polls every
5 minutes and fires the dispatcher ONLY for institutions whose admin has
opted into WEEKLY / MONTHLY reminders via the Finance UI. The default
state for every institution is DISABLED, so a freshly-bootstrapped
deployment running this worker still won't send a single push until
someone configures a schedule.

Background
----------
Fee reminders used to be a hardcoded Wednesday-at-09:00-IST cron. That
behaviour has been replaced with an admin click-to-send button in the
Finance dashboard. This worker exists only for institutions that
explicitly opt into recurring sends; it is NOT required for the
manual flow.

Production wiring
-----------------
* Web pods: ``FEE_REMINDER_SCHEDULER_ENABLED=false`` (default in render.yaml).
* Optional worker pod: launch with ``python worker.py``; run exactly one
  replica — the per-institution cron_locks row is a belt-and-braces guard
  if someone scales it up.

If no institution will ever want recurring reminders, this worker can be
omitted entirely. The admin click-to-send endpoint is the source of truth.
"""
from __future__ import annotations

import asyncio
import logging
import os
import signal
import sys

# Force the scheduler on for this process, regardless of .env.
os.environ["FEE_REMINDER_SCHEDULER_ENABLED"] = "true"

# Make sure ./app is importable when run as a script.
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.logger import setup_logging  # noqa: E402

logger = setup_logging()


async def _amain() -> None:
    from app.services.finance.fee_reminder_scheduler import (
        start_scheduler,
        stop_scheduler,
    )

    task = start_scheduler()
    if task is None:
        logger.error(
            "[worker] scheduler did not start. Check that "
            "FEE_REMINDER_SCHEDULER_ENABLED=true is reaching the process."
        )
        return

    logger.info("[worker] running. Press Ctrl+C to stop.")

    stop_event = asyncio.Event()

    def _on_signal(signame: str) -> None:
        logger.info("[worker] received %s — initiating graceful shutdown", signame)
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _on_signal, sig.name)
        except NotImplementedError:
            # Windows / restricted env — fall back to default KeyboardInterrupt.
            pass

    try:
        await stop_event.wait()
    finally:
        await stop_scheduler()
        logger.info("[worker] scheduler stopped. Bye.")


def main() -> None:
    try:
        asyncio.run(_amain())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
