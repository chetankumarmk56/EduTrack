"""
Verifies the H10 changes:

* Login sets BOTH access and refresh cookies as HttpOnly.
* ``get_current_user`` accepts the token from either an Authorization
  header (mobile) or the access cookie (web).
* When both are present, the header wins (so a WebView with a logged-in
  web user can't accidentally adopt the wrong identity).
* CSP header is applied to API responses, not to /docs.
* A logout call clears both cookies for the caller's role+user_id.

These are the security-critical behaviors. Drift on any of them
re-opens the XSS-to-token-exfiltration path that H10 closed.
"""
import os
import sys

import pytest

sys.path.append(os.getcwd())

os.environ.setdefault("SECRET_KEY", "test-secret-key-must-be-at-least-32-chars-long")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("ENVIRONMENT", "dev")
os.environ["FEE_REMINDER_SCHEDULER_ENABLED"] = "false"


def _make_token(sub=42, role="admin", inst_id=1, name="Test"):
    """Mint a real JWT so the auth dependency's decode succeeds."""
    from app.core.security import create_access_token
    return create_access_token(data={
        "sub": str(sub),
        "role": role,
        "institution_id": inst_id,
        "name": name,
    })


# ─── set_auth_cookies stamps the right shape ─────────────────────────────


def test_set_auth_cookies_emits_httponly_pair():
    """Cookie attributes must be HttpOnly + SameSite=Lax + role-keyed name."""
    from fastapi.responses import Response
    from app.services.auth.auth_service import set_auth_cookies

    resp = Response()
    set_auth_cookies(
        resp,
        role="teacher",
        user_id=99,
        access_token="access.jwt.value",
        refresh_token="refresh.jwt.value",
    )
    raw_cookies = resp.raw_headers
    headers = [v.decode("latin1") for k, v in raw_cookies if k == b"set-cookie"]

    access_headers = [h for h in headers if h.startswith("edu_access_teacher_99=")]
    refresh_headers = [h for h in headers if h.startswith("edu_refresh_teacher_99=")]
    assert access_headers, f"no access cookie in headers: {headers}"
    assert refresh_headers, f"no refresh cookie in headers: {headers}"

    for h in access_headers + refresh_headers:
        assert "HttpOnly" in h, f"cookie missing HttpOnly attr: {h}"
        # samesite=lax in starlette is case-insensitive on the wire.
        assert "SameSite=lax" in h.lower().replace("samesite=", "SameSite=").lower() or \
               "samesite=lax" in h.lower(), f"cookie missing SameSite=Lax: {h}"


# ─── Dependency: cookie vs header sources ────────────────────────────────


def test_get_current_user_accepts_cookie():
    """
    Web path: HttpOnly cookie only, no Authorization header.
    Probed at the extractor level — see _bearer_when_no_cookie for rationale.
    """
    from app.core.dependencies import _extract_access_token

    class _StubReq:
        cookies = {"edu_access_admin_42": "cookie.jwt.value"}
        headers = {"X-Portal-Role": "admin"}

    chosen = _extract_access_token(_StubReq(), bearer_token=None)
    assert chosen == "cookie.jwt.value", (
        f"cookie must be returned when no bearer present, got {chosen!r}"
    )


def test_extractor_walks_cookies_without_portal_role():
    """
    Without X-Portal-Role, the extractor falls back to a generic scan
    over any cookie that starts with edu_access_. Catches the
    "fast-path-only" regression where the header is mandatory.
    """
    from app.core.dependencies import _extract_access_token

    class _StubReq:
        cookies = {
            "unrelated": "ignore-me",
            "edu_access_admin": "admin.token",
        }
        headers = {}

    chosen = _extract_access_token(_StubReq(), bearer_token=None)
    assert chosen == "admin.token"


def test_extractor_returns_none_when_no_credentials():
    """No bearer, no cookies → None (caller raises 401)."""
    from app.core.dependencies import _extract_access_token

    class _StubReq:
        cookies = {}
        headers = {}

    chosen = _extract_access_token(_StubReq(), bearer_token=None)
    assert chosen is None


def test_get_current_user_accepts_bearer_when_no_cookie():
    """
    Mobile path: Authorization header only. We probe the extractor
    directly rather than driving the full app because get_current_user
    follows up with a DB lookup that depends on a Postgres engine — out
    of scope for this assertion.
    """
    from app.core.dependencies import _extract_access_token

    class _StubReq:
        cookies: dict = {}
        headers: dict = {}

    chosen = _extract_access_token(_StubReq(), bearer_token="header.jwt.value")
    assert chosen == "header.jwt.value", (
        f"bearer must be returned when no cookie present, got {chosen!r}"
    )


async def test_header_wins_when_both_present():
    """
    Header > cookie. Catches the reverse-priority regression where a
    WebView with a logged-in web user could adopt the wrong identity
    via stale cookies.
    """
    import httpx
    from app.main import app
    from app.core.security import decode_access_token

    cookie_token = _make_token(sub=11, role="admin", name="CookieUser")
    header_token = _make_token(sub=22, role="admin", name="HeaderUser")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test",
        cookies={"edu_access_admin_11": cookie_token},
    ) as c:
        r = await c.get(
            "/api/auth/me",
            headers={
                "Authorization": f"Bearer {header_token}",
                "X-Portal-Role": "admin",
            },
        )
    # Even though both reach the dependency, the bearer/header path must
    # be the one decoded. Without a real DB we can't fully assert on
    # user_id, but we can re-verify the dependency's resolver directly.
    from app.core.dependencies import _extract_access_token

    class _StubReq:
        def __init__(self, cookies, headers=None):
            self.cookies = cookies
            self.headers = headers or {}

    req = _StubReq({"edu_access_admin_11": cookie_token},
                   {"X-Portal-Role": "admin"})
    chosen = _extract_access_token(req, bearer_token=header_token)
    assert chosen == header_token, "header must take precedence over cookie"
    # And the decoded sub should be 22, proving the header path identity.
    assert decode_access_token(chosen)["sub"] == "22"


# ─── CSP header ──────────────────────────────────────────────────────────


async def test_csp_header_on_api_responses():
    import httpx
    from app.main import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/health")
    assert "Content-Security-Policy" in r.headers, r.headers
    csp = r.headers["Content-Security-Policy"]
    # Spot-check the directives that actually bound XSS impact.
    for directive in ("default-src 'self'", "object-src 'none'",
                      "frame-ancestors 'self'", "base-uri 'self'"):
        assert directive in csp, f"missing CSP directive {directive!r}: {csp}"


async def test_csp_skipped_for_docs():
    """Swagger UI needs unsafe-inline scripts to render — keep it out."""
    import httpx
    from app.main import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/docs")
    assert r.status_code == 200, r.text
    assert "Content-Security-Policy" not in r.headers, (
        "docs route must NOT carry strict CSP — Swagger UI breaks"
    )


# ─── clear_auth_cookies ──────────────────────────────────────────────────


def test_clear_auth_cookies_emits_delete_headers():
    from fastapi.responses import Response
    from app.services.auth.auth_service import clear_auth_cookies

    resp = Response()
    clear_auth_cookies(resp, role="parent", user_id=7)
    headers = [v.decode("latin1") for k, v in resp.raw_headers if k == b"set-cookie"]
    # delete_cookie emits Set-Cookie with Max-Age=0 / past Expires for the named key.
    assert any("edu_access_parent_7=" in h for h in headers), headers
    assert any("edu_refresh_parent_7=" in h for h in headers), headers
