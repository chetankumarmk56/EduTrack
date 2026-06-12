"""
Gunicorn config for the FastAPI backend.

Loaded with ``gunicorn -c gunicorn_conf.py app.main:app``.

Why Gunicorn rather than ``uvicorn --workers``: gunicorn supplies a real
pre-fork master that handles graceful restarts, worker recycling on
memory leak, and the standard SIGTERM → SIGINT → SIGKILL escalation.
``uvicorn --workers`` is fine for dev but lacks the operational knobs
production wants.

Per-worker in-process state to keep in mind:

* In-memory slowapi limiter (when REDIS_URL is unset) — counter is per
  worker, so multi-worker reduces effectiveness. Set REDIS_URL in prod.
* Redis pub/sub broadcaster — every worker subscribes independently.
  Acceptable up to ~16 workers; beyond that, consider a single sidecar
  that owns the subscription and forwards via local socket.
* Fee-reminder scheduler — default is FEE_REMINDER_SCHEDULER_ENABLED=false.
  When enabled, the scheduler uses a tick-level leader election (CronLock)
  so only one worker executes each 5-minute tick regardless of worker count.
  Safe to enable in .env on a single-EC2 deployment; on multi-replica
  deployments enable it only in a dedicated worker service.

Worker count formula:
  WEB_CONCURRENCY override → respect it.
  Otherwise: max(2, min(2*cpus + 1, 8)). Cap at 8 because each worker
  holds ~150MB of bcrypt/asyncpg buffers; on a 1 GB box we
  don't want to thrash.
"""
from __future__ import annotations

import multiprocessing
import os

# Bind / port — Render sets PORT, docker-compose maps 8000 by default.
bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"

# Worker model: Uvicorn's worker = ASGI-compatible
worker_class = "uvicorn.workers.UvicornWorker"


def _resolve_workers() -> int:
    """Choose a sensible worker count, respecting overrides."""
    if "WEB_CONCURRENCY" in os.environ:
        try:
            return max(1, int(os.environ["WEB_CONCURRENCY"]))
        except ValueError:
            pass
    cpus = multiprocessing.cpu_count() or 1
    target = 2 * cpus + 1
    # Cap so a 16-core build server doesn't try to spawn 33 workers
    # in a 1 GB container.
    return max(2, min(target, 8))


workers = _resolve_workers()

# Per-worker thread-pool ceiling. We don't need many threads because
# UvicornWorker is async; the threadpool only handles `asyncio.to_thread`
# offloads (bcrypt, S3 multipart upload via boto3).
threads = 1

# Timeouts. Default 30s gunicorn timeout kills workers mid-upload on slow
# client connections. Lesson-plan generation runs SYNCHRONOUSLY in-process
# (the request blocks while OpenAI produces a full class-by-class plan —
# one detailed object per class), which for many classes can take a few
# minutes. 300s gives that path room; the OpenAI call itself is separately
# bounded by LESSON_PLAN_OPENAI_TIMEOUT (default 240s) so a stuck upstream
# still releases the worker. The async UvicornWorker keeps its heartbeat
# alive during the off-loop `asyncio.to_thread` OpenAI call, so this
# timeout is a safety ceiling, not the normal request budget.
#
# NOTE: a reverse proxy in front of gunicorn (nginx `proxy_read_timeout`,
# default 60s; Cloudflare's ~100s edge limit on non-Enterprise plans) must
# allow at least as long, or it will 504/524 before generation finishes.
# See deployment/nginx/*.conf.
timeout = 300
graceful_timeout = 30

# Keep-alive helps for parent dashboards that pull 4-5 endpoints right
# after login.
keepalive = 5

# Recycle workers periodically so a slow leak (e.g. an SDK that keeps
# growing internal caches) doesn't bring the whole pod down.
max_requests = 5000
max_requests_jitter = 250

# Logging — structured JSON output is added in Fix M9; for now keep the
# default but make access logs go to stdout where Render captures them.
accesslog = "-"
errorlog = "-"
loglevel = os.environ.get("GUNICORN_LOGLEVEL", "info")

# Proxy / forwarded-header handling. Without these, every rate-limit
# key collapses to the load-balancer IP and the limiter is defeated.
forwarded_allow_ips = "*"
proxy_protocol = False  # set true only behind PROXY-protocol LBs (HAProxy etc.)
proxy_allow_ips = "*"


def on_starting(server):  # noqa: D401 — gunicorn hook signature
    """Log the resolved worker config so it's visible in deploy logs."""
    server.log.info(
        "[gunicorn] starting with workers=%d threads=%d timeout=%ds",
        workers, threads, timeout,
    )
