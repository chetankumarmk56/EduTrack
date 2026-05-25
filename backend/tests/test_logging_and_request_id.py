"""
Verifies the M9 observability additions:

* JSON formatter emits a single JSON line per record with the right shape
  and includes request_id when the contextvar is set.
* Human formatter appends ``[req=…]`` when the contextvar is set.
* The ``X-Request-Id`` middleware:
    - generates a UUID when no inbound header is present,
    - echoes a valid inbound header,
    - rejects a malicious-looking inbound header (too long / bad chars),
    - puts the resolved ID in the response header so clients can quote it.
* The global exception handler surfaces ``request_id`` in the 500 body
  so a bug report can reference a single tag.
* Sentry init is a no-op without DSN (doesn't crash startup) and
  attempts to wire when DSN is set.
"""
import json
import logging
import os
import sys

import pytest

sys.path.append(os.getcwd())

os.environ.setdefault("SECRET_KEY", "test-secret-key-must-be-at-least-32-chars-long")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("ENVIRONMENT", "dev")
os.environ["FEE_REMINDER_SCHEDULER_ENABLED"] = "false"


# ─── Formatters ───────────────────────────────────────────────────────────


def _make_record(msg: str, level: int = logging.INFO, **extra) -> logging.LogRecord:
    rec = logging.LogRecord(
        name="app.tests", level=level, pathname="t.py", lineno=1,
        msg=msg, args=(), exc_info=None,
    )
    for k, v in extra.items():
        setattr(rec, k, v)
    return rec


def test_json_formatter_emits_single_line_object():
    from app.core.logger import _JsonFormatter

    fmt = _JsonFormatter()
    rec = _make_record("hello world")
    out = fmt.format(rec)

    payload = json.loads(out)  # must be a single JSON object
    assert payload["msg"] == "hello world"
    assert payload["level"] == "INFO"
    assert payload["logger"] == "app.tests"
    assert "ts" in payload
    # No request_id when contextvar is unset.
    assert "request_id" not in payload


def test_json_formatter_includes_request_id_when_set():
    from app.core.logger import _JsonFormatter, request_id_ctx, request_path_ctx

    fmt = _JsonFormatter()
    token = request_id_ctx.set("test-rid-abc")
    path_token = request_path_ctx.set("/api/test")
    try:
        out = fmt.format(_make_record("x"))
    finally:
        request_id_ctx.reset(token)
        request_path_ctx.reset(path_token)

    payload = json.loads(out)
    assert payload["request_id"] == "test-rid-abc"
    assert payload["path"] == "/api/test"


def test_json_formatter_merges_extras():
    from app.core.logger import _JsonFormatter

    fmt = _JsonFormatter()
    rec = _make_record("with extras", user_id=42, route="/admin")
    payload = json.loads(fmt.format(rec))
    assert payload["user_id"] == 42
    assert payload["route"] == "/admin"


def test_json_formatter_captures_exception():
    from app.core.logger import _JsonFormatter

    fmt = _JsonFormatter()
    try:
        raise ValueError("simulated boom")
    except ValueError:
        import sys as _sys
        rec = logging.LogRecord(
            "app", logging.ERROR, "x", 1, "boomed", (), exc_info=_sys.exc_info(),
        )
    payload = json.loads(fmt.format(rec))
    assert "exc" in payload
    assert "ValueError" in payload["exc"]


def test_human_formatter_appends_request_id():
    from app.core.logger import _HumanFormatter, request_id_ctx

    fmt = _HumanFormatter("%(levelname)s %(message)s")
    token = request_id_ctx.set("abc123")
    try:
        out = fmt.format(_make_record("hi"))
    finally:
        request_id_ctx.reset(token)
    assert out.endswith("[req=abc123]"), out


# ─── Request-id middleware ────────────────────────────────────────────────


async def test_request_id_generated_when_absent():
    """No inbound header → generated UUID in response."""
    import httpx
    from app.main import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/health")
    rid = r.headers.get("X-Request-Id")
    assert rid is not None and len(rid) == 32, (
        f"expected 32-char UUID hex, got {rid!r}"
    )


async def test_request_id_echoed_from_inbound_header():
    """Valid inbound X-Request-Id is echoed back unchanged."""
    import httpx
    from app.main import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/health", headers={"X-Request-Id": "trace-from-edge-001"})
    assert r.headers.get("X-Request-Id") == "trace-from-edge-001"


async def test_request_id_rejects_malicious_inbound():
    """
    Inbound IDs longer than 64 chars or with non-alnum/-/_ characters
    must NOT be echoed — they'd inflate log lines if accepted.
    """
    import httpx
    from app.main import app

    transport = httpx.ASGITransport(app=app)
    bad_ids = [
        "A" * 1000,                              # too long
        "<script>alert(1)</script>",             # XSS-like
        "id with spaces",                        # spaces
        "../../etc/passwd",                      # path traversal-ish
    ]
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        for bad in bad_ids:
            r = await c.get("/health", headers={"X-Request-Id": bad})
            received = r.headers.get("X-Request-Id")
            assert received and received != bad, (
                f"server echoed malicious id {bad!r} → {received!r}"
            )
            # And the substitute must look like a generated UUID.
            assert len(received) == 32


# ─── Error responses include request_id ──────────────────────────────────


async def test_500_response_includes_request_id():
    """
    Force an unhandled exception via a stub route, confirm the 500
    body carries the same request_id the middleware put in the header.

    ``raise_app_exceptions=False`` makes ASGITransport return the response
    that the global exception handler built instead of re-raising up
    into pytest. That mirrors the prod-server behaviour (uvicorn never
    re-raises; it always sends a response back to the client).
    """
    import httpx
    from app.main import app

    @app.get("/__test_explode")
    async def _explode():
        raise RuntimeError("simulated panic")

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get(
            "/__test_explode",
            headers={"X-Request-Id": "trace-explode-001"},
        )

    assert r.status_code == 500
    body = r.json()
    assert body.get("request_id") == "trace-explode-001", body
    assert r.headers.get("X-Request-Id") == "trace-explode-001"


# ─── Sentry init guards ──────────────────────────────────────────────────


def test_sentry_init_noop_without_dsn(monkeypatch):
    """Logging setup must not raise when SENTRY_DSN is unset."""
    from app.core import config as cfg
    from app.core.logger import _init_sentry

    monkeypatch.setattr(cfg.settings, "SENTRY_DSN", None)
    _init_sentry()  # must not raise


def test_sentry_init_calls_sdk_when_dsn_set(monkeypatch):
    """
    With a DSN configured, _init_sentry attempts to call sentry_sdk.init.
    We patch the sentry_sdk module on import so the test doesn't actually
    open a network connection to Sentry's ingest.
    """
    from app.core import config as cfg
    from app.core import logger as logger_mod

    monkeypatch.setattr(cfg.settings, "SENTRY_DSN", "https://fake@sentry.io/1")

    calls: dict = {}

    class _FakeSentry:
        @staticmethod
        def init(**kwargs):
            calls["init"] = kwargs

    class _FakeIntegration:
        def __init__(self, *a, **kw):
            pass

    # Provide stubs for the modules sentry_sdk normally pulls in.
    import sys as _sys
    _sys.modules["sentry_sdk"] = _FakeSentry  # type: ignore[assignment]
    _sys.modules["sentry_sdk.integrations.fastapi"] = type(
        "M", (), {"FastApiIntegration": _FakeIntegration},
    )
    _sys.modules["sentry_sdk.integrations.starlette"] = type(
        "M", (), {"StarletteIntegration": _FakeIntegration},
    )

    try:
        logger_mod._init_sentry()
        assert "init" in calls
        assert calls["init"]["dsn"] == "https://fake@sentry.io/1"
        assert calls["init"]["environment"] == cfg.settings.ENVIRONMENT
    finally:
        # Clean up the stubs so other tests aren't affected.
        for k in ("sentry_sdk", "sentry_sdk.integrations.fastapi",
                  "sentry_sdk.integrations.starlette"):
            _sys.modules.pop(k, None)
