"""
Mobile token-refresh support.

Native mobile has no cookie jar, so:
  * login returns the refresh token in the body ONLY for mobile (X-Client:
    mobile); web stays cookie-only (refresh_token=null).
  * /api/auth/refresh accepts the refresh token via the X-Refresh-Token
    header (in addition to the web cookie path), validated identically.

These tests pin the new header path and prove the web cookie path still
works — the /auth/refresh endpoint is stateless (no DB), so it runs under a
plain ASGI transport.
"""
import os
import sys

import pytest

sys.path.append(os.getcwd())

os.environ.setdefault("SECRET_KEY", "test-secret-key-must-be-at-least-32-chars-long")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("ENVIRONMENT", "dev")
os.environ["FEE_REMINDER_SCHEDULER_ENABLED"] = "false"


def _refresh_token(role="teacher", sub=7, inst=1, name="T"):
    from app.core.security import create_refresh_token
    return create_refresh_token(
        {"sub": str(sub), "role": role, "institution_id": inst, "name": name}
    )


# ─── is_mobile_client helper ─────────────────────────────────────────────


def test_is_mobile_client_detects_header():
    from app.services.auth.auth_service import is_mobile_client

    class Req:
        def __init__(self, headers):
            self.headers = headers

    assert is_mobile_client(Req({"X-Client": "mobile"})) is True
    assert is_mobile_client(Req({"X-Client": "MOBILE"})) is True  # case-insensitive
    assert is_mobile_client(Req({"X-Client": "web"})) is False
    assert is_mobile_client(Req({})) is False


# ─── /auth/refresh header path (mobile) ──────────────────────────────────


async def test_refresh_accepts_x_refresh_token_header():
    import httpx
    from app.main import app
    from app.core.security import decode_access_token

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/api/auth/refresh",
            headers={
                "X-Refresh-Token": _refresh_token(role="teacher"),
                "X-Portal-Role": "teacher",
                "X-Client": "mobile",
            },
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["access_token"]
    # Minted access token carries the identity from the refresh token.
    decoded = decode_access_token(body["access_token"])
    assert decoded["role"] == "teacher"
    assert decoded["sub"] == "7"


async def test_refresh_rejects_role_mismatch_via_header():
    import httpx
    from app.main import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/api/auth/refresh",
            headers={
                # token says teacher, but the portal claims parent → reject
                "X-Refresh-Token": _refresh_token(role="teacher"),
                "X-Portal-Role": "parent",
            },
        )
    assert r.status_code == 401, r.text


async def test_refresh_rejects_an_access_token_in_the_refresh_header():
    """Only `type=refresh` tokens are accepted — an access token must fail."""
    import httpx
    from app.main import app
    from app.core.security import create_access_token

    access = create_access_token(
        {"sub": "7", "role": "teacher", "institution_id": 1, "name": "T"}
    )
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/api/auth/refresh",
            headers={"X-Refresh-Token": access, "X-Portal-Role": "teacher"},
        )
    assert r.status_code == 401, r.text


async def test_refresh_with_no_token_anywhere_is_401():
    import httpx
    from app.main import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post("/api/auth/refresh", headers={"X-Portal-Role": "teacher"})
    assert r.status_code == 401, r.text


async def test_refresh_still_works_via_cookie_web_path():
    """Regression: the web HttpOnly-cookie path must be untouched by the
    mobile header addition."""
    import httpx
    from app.main import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://test",
        cookies={"edu_refresh_teacher_7": _refresh_token(role="teacher")},
    ) as c:
        r = await c.post("/api/auth/refresh", headers={"X-Portal-Role": "teacher"})
    assert r.status_code == 200, r.text
    assert r.json()["access_token"]
