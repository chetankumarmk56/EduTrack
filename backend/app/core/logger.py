"""
Structured logging.

Two output formats:
  * Human-readable (dev): ``[ts] [level] [logger] [req_id] - msg``
  * JSON (prod):          ``{"ts": …, "level": …, "logger": …, "msg": …,
                            "request_id": …, "method": …, "path": …}``

Format is chosen at startup based on ``settings.LOG_JSON``:
  * True  → JSON
  * False → human-readable
  * None  → JSON in prod, human in dev (the default)

Request correlation:
  Every request gets a unique ``request_id`` injected by the
  ``request_id_middleware`` in main.py. The middleware sets a
  ``contextvars.ContextVar`` which the formatter reads, so every log
  line emitted while handling that request carries the same ID
  regardless of which module logs it. The ID also goes back in the
  ``X-Request-Id`` response header so clients can quote it in bug
  reports.

Why stdlib + a 30-line formatter instead of structlog: the logging
properties we need (JSON, request_id correlation, level filtering)
are all available from stdlib. Adding structlog as a dependency
would change every log call site in the codebase; the audit's
requirements don't justify that surgery.
"""
from __future__ import annotations

import contextvars
import json
import logging
import sys
import time
from typing import Any, Optional

from app.core.config import settings

# Per-request correlation handle. Read by the JSON formatter and the
# human formatter; set by request_id_middleware in main.py.
request_id_ctx: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "request_id", default=None,
)
# Optional method + path so error logs include "where" without the
# request itself having to log them.
request_method_ctx: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "request_method", default=None,
)
request_path_ctx: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "request_path", default=None,
)


class _JsonFormatter(logging.Formatter):
    """
    Minimal JSON formatter. Each line is a single JSON object; no
    pretty-printing because log aggregators want one record per line.

    Reserved fields: ts, level, logger, msg, request_id, method, path.
    Extra keyword args passed via ``logger.info(..., extra={...})``
    are merged in at the top level.
    """

    _STD_RECORD_ATTRS = frozenset({
        "args", "asctime", "created", "exc_info", "exc_text", "filename",
        "funcName", "levelname", "levelno", "lineno", "message", "module",
        "msecs", "msg", "name", "pathname", "process", "processName",
        "relativeCreated", "stack_info", "thread", "threadName",
        # Our own injected attrs handled separately:
        "request_id", "request_method", "request_path", "taskName",
    })

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        rid = request_id_ctx.get()
        if rid:
            payload["request_id"] = rid
        method = request_method_ctx.get()
        if method:
            payload["method"] = method
        path = request_path_ctx.get()
        if path:
            payload["path"] = path

        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)

        # Surface any extra={…} a caller passed into logger.x(...). We
        # iterate the record's __dict__ rather than relying on a hidden
        # attribute so this works across Python versions.
        for k, v in record.__dict__.items():
            if k in self._STD_RECORD_ATTRS or k.startswith("_"):
                continue
            try:
                json.dumps(v)  # cheap roundtrip-safety check
                payload[k] = v
            except (TypeError, ValueError):
                payload[k] = repr(v)

        return json.dumps(payload, default=str)


class _HumanFormatter(logging.Formatter):
    """Plain text with request_id appended when available."""

    def format(self, record: logging.LogRecord) -> str:
        base = super().format(record)
        rid = request_id_ctx.get()
        if rid:
            return f"{base} [req={rid}]"
        return base


def _should_use_json() -> bool:
    """Resolve LOG_JSON to a concrete bool. None → JSON in prod only."""
    if settings.LOG_JSON is not None:
        return bool(settings.LOG_JSON)
    return settings.ENVIRONMENT == "prod"


def setup_logging() -> logging.Logger:
    """
    Configure root logging once at process start. Subsequent calls are
    idempotent — the existing handlers stay.
    """
    root = logging.getLogger()
    if getattr(root, "_edutrack_configured", False):
        return logging.getLogger("app")

    # Clear any default handlers (uvicorn / gunicorn install their own
    # before this function runs).
    for h in list(root.handlers):
        root.removeHandler(h)

    handler = logging.StreamHandler(sys.stdout)
    if _should_use_json():
        handler.setFormatter(_JsonFormatter())
    else:
        handler.setFormatter(_HumanFormatter(
            "[%(asctime)s] [%(levelname)s] [%(name)s] - %(message)s"
        ))

    root.addHandler(handler)
    root.setLevel(logging.INFO)

    # Quiet noisy third-party libs.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

    # Initialise Sentry lazily; failures must not crash startup.
    _init_sentry()

    setattr(root, "_edutrack_configured", True)

    logger = logging.getLogger("app")
    logger.info(
        "Logging initialised",
        extra={"env": settings.ENVIRONMENT, "json": _should_use_json()},
    )
    return logger


def _init_sentry() -> None:
    """Wire Sentry if SENTRY_DSN is set. No-op otherwise."""
    dsn = settings.SENTRY_DSN
    if not dsn:
        return
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        sentry_sdk.init(
            dsn=dsn,
            environment=settings.ENVIRONMENT,
            release=settings.VERSION,
            traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
            integrations=[
                FastApiIntegration(),
                StarletteIntegration(),
            ],
        )
        logging.getLogger("app").info(
            "Sentry initialised",
            extra={"env": settings.ENVIRONMENT, "release": settings.VERSION},
        )
    except ImportError:
        logging.getLogger("app").warning(
            "SENTRY_DSN is set but sentry-sdk is not installed — skipping Sentry init"
        )
    except Exception as exc:  # noqa: BLE001
        logging.getLogger("app").error(
            "Sentry init failed", extra={"error": str(exc)}
        )


# Singleton logger instance for ``from app.core.logger import logger``.
logger = logging.getLogger("app")
