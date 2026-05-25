"""
Standalone worker entrypoint.

Runs the in-process schedulers (currently just the Wednesday fee-reminder
loop) outside the web replicas. Use this when you have a real process
supervisor — docker-compose, ECS, Kubernetes — and want one dedicated
container for background work instead of an external cron pinging an
HTTP endpoint.

Run:
    python worker.py

The worker forces ``FEE_REMINDER_SCHEDULER_ENABLED=true`` regardless of
the env file, since the whole point of running this process is to have
the scheduler on.

Production wiring
-----------------
* Web pods: ``FEE_REMINDER_SCHEDULER_ENABLED=false`` (set in render.yaml).
* This worker pod / service: launched via ``python worker.py``; runs one
  replica only — the cron_locks table is a belt-and-braces guard in case
  someone scales it up.

Why this rather than an external HTTP cron:
  * No external dependency on the platform's scheduler.
  * No need to manage a long-lived secret on a separate system.
  * Same code path as the in-process scheduler we already wrote.

Render alternative (HTTP cron) lives alongside this in render.yaml — it's
fine to use just the HTTP route and skip this worker entirely. Pick one.
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
