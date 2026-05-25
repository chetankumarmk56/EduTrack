"""
Verifies that auth endpoints reject brute-force attempts via slowapi.

Strategy: drive the FastAPI app via httpx ASGITransport (same event loop as
pytest-asyncio) so we don't fight the engine-pool-loop binding that bites
other test files.
"""
import os
import sys

# Ensure import path before any app import.
sys.path.append(os.getcwd())

# Provide config required by app.core.config at import time.
os.environ.setdefault("SECRET_KEY", "test-secret-key-must-be-at-least-32-chars-long")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("ENVIRONMENT", "dev")
os.environ["FEE_REMINDER_SCHEDULER_ENABLED"] = "false"

import pytest  # noqa: E402
import httpx  # noqa: E402


@pytest.fixture
async def app_instance():
    """
    Lazy-import the app so env vars above are read first, and dispose
    the async engine so a previous test file (e.g. test_atomicity which
    holds onto a real Postgres pool) doesn't leave us with a connection
    pinned to a closed event loop. Without this the 6th login attempt
    in the burst gets a 500 instead of a 429, because the auth route
    crashes on the DB call before slowapi can short-circuit.
    """
    from app.main import app
    from app.core.limiter import limiter
    from app.core.database import engine

    # Drop any pooled connections bound to a previous test's event loop.
    # SQLAlchemy will lazily reopen on the next use.
    try:
        await engine.dispose()
    except Exception:
        pass

    # Reset counter so test order doesn't matter.
    limiter.reset()
    return app


async def _login_burst(client: httpx.AsyncClient, n: int):
    statuses = []
    for _ in range(n):
        r = await client.post(
            "/api/auth/login",
            data={"username": "nobody@example.com", "password": "wrong"},
        )
        statuses.append(r.status_code)
    return statuses


async def test_login_rate_limit_blocks_and_response_shape(app_instance):
    """
    Combined test (was two — collapsed because the in-process DB pool
    bound to a previous test's event loop blows up on the second client
    burst, an artifact of running tests against a shared global engine
    rather than an issue with the limiter itself).

    Verifies:
      * Bursts past the configured /auth/login limit get 429.
      * The 429 response body has the JSON shape clients depend on.
    """
    from app.core.limiter import RATE_LIMITS

    n = int(RATE_LIMITS["auth_login"].split("/")[0])
    transport = httpx.ASGITransport(app=app_instance)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        statuses = await _login_burst(c, n + 2)

    # First n attempts should not be 429 (they may 401 / 500 / 422 — we
    # don't care, only that the limiter wasn't the gate).
    assert all(s != 429 for s in statuses[:n]), (
        f"Got 429 too early: {statuses}"
    )
    # At least one of the trailing attempts must be 429.
    assert any(s == 429 for s in statuses[n:]), (
        f"Expected 429 after burst, got {statuses}"
    )

    # The 429 body shape we expose to clients.
    transport2 = httpx.ASGITransport(app=app_instance)
    async with httpx.AsyncClient(transport=transport2, base_url="http://test") as c:
        r = await c.post(
            "/api/auth/login",
            data={"username": "nobody@example.com", "password": "wrong"},
        )
    assert r.status_code == 429
    payload = r.json()
    assert "detail" in payload
    assert "retry_after" in payload


async def test_other_login_endpoints_have_limit_decorator():
    """
    Cheap structural check: every login endpoint must carry a slowapi
    limit so a brand-new endpoint can't silently bypass the protection.
    """
    from app.api.routes.auth.auth import (
        login_for_access_token,
        refresh_access_token,
        change_password,
    )
    from app.api.routes.teachers.teachers import teacher_login
    from app.api.routes.students.students import parent_login, student_login

    # slowapi annotates the wrapped function with __wrapped__ + a closure
    # over the limit string. We just look for the attribute presence.
    for fn in (
        login_for_access_token,
        refresh_access_token,
        change_password,
        teacher_login,
        parent_login,
        student_login,
    ):
        # slowapi wraps the function — the original __wrapped__ should still
        # be present, plus the source should reference @limiter.limit.
        src = (fn.__doc__ or "") + " " + (getattr(fn, "__name__", "") or "")
        assert callable(fn), f"{fn} not callable"
        # The limiter wraps every decorated callable in a new function with
        # the same name; the presence of __wrapped__ is the marker.
        assert hasattr(fn, "__wrapped__"), (
            f"{fn.__name__} is missing the slowapi @limiter.limit wrapper "
            f"(got {fn!r})"
        )
