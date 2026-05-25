"""
Verifies the cron-or-admin authentication path used by /fee-reminders/dispatch.

The scheduler now runs out-of-process — either via the standalone
``worker.py`` or via an external cron (Render Cron Job, EventBridge,
GitHub Actions) hitting the HTTPS endpoint. Both paths need to be
guarded:

* Cron callers send ``X-Cron-Secret`` (no JWT lifecycle to manage).
* Operators running ad-hoc dispatches use their admin Bearer token.

Anyone else MUST be rejected with 401 — otherwise an unauthenticated
caller could trigger every parent's phone to ring every minute.
"""
import os
import sys

sys.path.append(os.getcwd())

os.environ.setdefault("SECRET_KEY", "test-secret-key-must-be-at-least-32-chars-long")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("ENVIRONMENT", "dev")
os.environ["FEE_REMINDER_SCHEDULER_ENABLED"] = "false"
os.environ["CRON_SECRET"] = "test-cron-secret-value"

import pytest  # noqa: E402
from fastapi import FastAPI, Depends, Request, HTTPException  # noqa: E402


def _mini_app():
    """
    Build a tiny FastAPI app that mounts ONLY the dependency under test
    against a stub endpoint. Avoids dragging the real DB / engine in.
    """
    # Re-read settings to pick up CRON_SECRET we set above.
    from app.core import config as _cfg
    _cfg.settings.CRON_SECRET = "test-cron-secret-value"

    from app.core.dependencies import require_cron_or_admin

    app = FastAPI()

    @app.post("/protected")
    async def protected(caller: str = Depends(require_cron_or_admin)):
        return {"caller": caller}

    return app


@pytest.fixture
def app_instance():
    return _mini_app()


async def _post(app, headers=None):
    import httpx
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        return await c.post("/protected", headers=headers or {})


async def test_rejects_without_credentials(app_instance):
    r = await _post(app_instance)
    assert r.status_code == 401, r.text


async def test_accepts_valid_cron_secret(app_instance):
    r = await _post(app_instance, {"X-Cron-Secret": "test-cron-secret-value"})
    assert r.status_code == 200, r.text
    assert r.json()["caller"] == "cron-secret"


async def test_rejects_wrong_cron_secret(app_instance):
    r = await _post(app_instance, {"X-Cron-Secret": "wrong-secret"})
    assert r.status_code == 401, r.text


async def test_rejects_bogus_bearer(app_instance):
    r = await _post(app_instance, {"Authorization": "Bearer not-a-real-token"})
    assert r.status_code == 401, r.text


async def test_accepts_admin_jwt(app_instance):
    """
    Mint a real admin JWT using the same security helper the API uses,
    so this catches "we changed the algorithm and the cron path stopped
    accepting tokens" regressions.
    """
    from app.core.security import create_access_token

    token = create_access_token(data={
        "sub": "42",
        "role": "admin",
        "institution_id": 1,
        "name": "Test Admin",
    })
    r = await _post(app_instance, {"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    assert r.json()["caller"].startswith("jwt:42:admin")


async def test_rejects_non_admin_jwt(app_instance):
    """A teacher/parent token must NOT be able to fire fee reminders."""
    from app.core.security import create_access_token

    token = create_access_token(data={
        "sub": "99",
        "role": "teacher",
        "institution_id": 1,
        "name": "Test Teacher",
    })
    r = await _post(app_instance, {"Authorization": f"Bearer {token}"})
    assert r.status_code == 401, r.text


def test_dispatch_endpoint_uses_cron_dependency():
    """
    Structural guard: the dispatch endpoint must wire through
    require_cron_or_admin. Catches "someone reverts to require_payment_admin
    and accidentally locks out the cron job" regressions.
    """
    from app.api.routes.finance.finance import dispatch_fee_reminders
    # The dependency object lives on the parameter default in the wrapped function.
    import inspect
    sig = inspect.signature(dispatch_fee_reminders)
    caller_param = sig.parameters.get("caller")
    assert caller_param is not None, (
        "dispatch_fee_reminders no longer has a `caller` parameter — "
        "did the cron auth wiring get removed?"
    )
    # FastAPI's Depends stores the callable on .dependency.
    dep = caller_param.default
    assert hasattr(dep, "dependency"), "expected fastapi.Depends instance"
    assert dep.dependency.__name__ == "require_cron_or_admin", (
        f"dispatch endpoint is gated by {dep.dependency.__name__}, "
        f"expected require_cron_or_admin"
    )
