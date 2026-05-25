"""
Verifies the M2 user-status cache.

Two surfaces under test:

1. ``UserStatusCache`` itself — set / get / invalidate semantics work
   in BOTH single-pod (in-memory) mode and Redis-backed (multi-pod)
   mode. TTL expiry honoured.

2. ``get_current_user`` — second consecutive authenticated request
   for the same user must skip the DB SELECT. Catches the regression
   "cache exists but is never read."

The fan-out test uses fakeredis to simulate a shared broker across two
processes, mirroring the websocket-fanout test approach.
"""
import asyncio
import os
import sys

import pytest

sys.path.append(os.getcwd())

os.environ.setdefault("SECRET_KEY", "test-secret-key-must-be-at-least-32-chars-long")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("ENVIRONMENT", "dev")
os.environ["FEE_REMINDER_SCHEDULER_ENABLED"] = "false"


# ─── In-memory fallback ──────────────────────────────────────────────────


async def test_inmemory_set_get_roundtrip():
    from app.core.user_cache import UserStatusCache

    cache = UserStatusCache(ttl_seconds=60)
    await cache.set(42, {"is_active": True, "name": "Alice"})
    got = await cache.get(42)
    assert got == {"is_active": True, "name": "Alice"}


async def test_inmemory_returns_none_on_miss():
    from app.core.user_cache import UserStatusCache

    cache = UserStatusCache()
    assert await cache.get(999) is None


async def test_inmemory_invalidate_drops_entry():
    from app.core.user_cache import UserStatusCache

    cache = UserStatusCache()
    await cache.set(1, {"is_active": True, "name": "X"})
    await cache.invalidate(1)
    assert await cache.get(1) is None


async def test_inmemory_ttl_expiry():
    """A 1-second TTL must yield None after the window passes."""
    from app.core.user_cache import UserStatusCache

    cache = UserStatusCache(ttl_seconds=1)
    await cache.set(7, {"is_active": True, "name": "Temp"}, ttl=1)
    assert await cache.get(7) == {"is_active": True, "name": "Temp"}
    await asyncio.sleep(1.1)
    assert await cache.get(7) is None, "TTL expiry not honoured"


# ─── Redis-backed (fakeredis) ────────────────────────────────────────────


async def test_redis_backed_set_get_invalidate():
    """
    A Redis-backed cache instance must round-trip and invalidate
    correctly. We bypass the URL-based init by injecting fakeredis on
    the singleton so we don't depend on env vars at test time.
    """
    fakeredis = pytest.importorskip("fakeredis.aioredis")

    from app.core.user_cache import UserStatusCache

    cache = UserStatusCache(ttl_seconds=60)
    # Skip the lazy init and inject a fake client. Mark _tried_redis_init
    # True so _ensure_redis short-circuits to "yes, we have a client".
    cache._redis = fakeredis.FakeRedis(decode_responses=True)
    cache._tried_redis_init = True

    await cache.set(99, {"is_active": False, "name": "Banned Bob"})
    got = await cache.get(99)
    assert got == {"is_active": False, "name": "Banned Bob"}

    await cache.invalidate(99)
    assert await cache.get(99) is None


# ─── Integration: get_current_user skips DB on cache hit ─────────────────


async def test_get_current_user_uses_cache_on_second_call():
    """
    First call: cache miss, DB hit, populate.
    Second call: cache hit, NO DB hit.

    We probe by counting db.execute calls on a stub session.
    """
    from app.core.dependencies import get_current_user
    from app.core.security import create_access_token
    from app.core.user_cache import user_cache

    # Mint a real JWT so the decode succeeds.
    token = create_access_token(data={
        "sub": "1234",
        "role": "admin",
        "institution_id": 1,
        "name": "Cached User",
    })

    # Stub Request + Session.
    class _Req:
        cookies = {}
        headers = {}

    class _StubResult:
        def __init__(self, user):
            self._user = user

        def scalars(self):
            class _Scalars:
                def __init__(self_inner, u):
                    self_inner._u = u
                def first(self_inner):
                    return self_inner._u
            return _Scalars(self._user)

    class _StubUser:
        def __init__(self):
            self.id = 1234
            self.name = "Cached User"
            self.is_active = True

    class _Session:
        def __init__(self):
            self.execute_calls = 0

        async def execute(self, stmt):
            self.execute_calls += 1
            return _StubResult(_StubUser())

    # Start from a known-clean cache state.
    await user_cache.invalidate(1234)

    session = _Session()

    # First call → DB hit + populate.
    ctx1 = await get_current_user(_Req(), bearer_token=token, db=session)
    assert ctx1.id == 1234
    assert session.execute_calls == 1

    # Second call → cache hit, NO new DB call.
    ctx2 = await get_current_user(_Req(), bearer_token=token, db=session)
    assert ctx2.id == 1234
    assert session.execute_calls == 1, (
        f"second call hit the DB {session.execute_calls} times — cache miss "
        f"regression. The fix in get_current_user must read user_cache.get() "
        f"before falling back to SELECT."
    )

    # Cleanup.
    await user_cache.invalidate(1234)


async def test_get_current_user_invalidation_forces_refetch():
    """After invalidate(), the next call must hit the DB again."""
    from app.core.dependencies import get_current_user
    from app.core.security import create_access_token
    from app.core.user_cache import user_cache

    token = create_access_token(data={
        "sub": "5555",
        "role": "admin",
        "institution_id": 1,
        "name": "Probe",
    })

    class _Req:
        cookies = {}
        headers = {}

    class _StubScalarsList:
        def __init__(self, u):
            self._u = u
        def first(self):
            return self._u

    class _StubResult:
        def __init__(self, user):
            self._user = user
        def scalars(self):
            return _StubScalarsList(self._user)

    class _StubUser:
        id = 5555
        name = "Probe"
        is_active = True

    class _Session:
        def __init__(self):
            self.execute_calls = 0
        async def execute(self, stmt):
            self.execute_calls += 1
            return _StubResult(_StubUser())

    await user_cache.invalidate(5555)
    session = _Session()
    await get_current_user(_Req(), bearer_token=token, db=session)
    await get_current_user(_Req(), bearer_token=token, db=session)
    # First populated, second was cache hit → 1 execute total.
    assert session.execute_calls == 1

    # Operator deactivates the user → cache cleared by admin write path.
    await user_cache.invalidate(5555)

    await get_current_user(_Req(), bearer_token=token, db=session)
    assert session.execute_calls == 2, (
        f"invalidation didn't force refetch; total db calls = {session.execute_calls}"
    )
    await user_cache.invalidate(5555)


async def test_get_current_user_drops_cache_on_deactivation():
    """
    If a cached row's ``is_active`` becomes False (e.g. it was True at
    populate time, then the cache entry was tampered with), the
    dependency must clear the cache before raising 403 — otherwise a
    stale True could come back from a parallel populate.
    """
    from fastapi import HTTPException
    from app.core.dependencies import get_current_user
    from app.core.security import create_access_token
    from app.core.user_cache import user_cache

    token = create_access_token(data={
        "sub": "9009",
        "role": "admin",
        "institution_id": 1,
        "name": "Disabled",
    })

    class _Req:
        cookies = {}
        headers = {}

    # Plant an is_active=False entry directly into the cache.
    await user_cache.set(9009, {"is_active": False, "name": "Disabled"})

    class _Session:
        async def execute(self, stmt):
            raise AssertionError("DB must NOT be hit when cache says inactive")

    with pytest.raises(HTTPException) as exc:
        await get_current_user(_Req(), bearer_token=token, db=_Session())
    assert exc.value.status_code == 403

    # Cache was wiped as a belt-and-braces measure.
    assert await user_cache.get(9009) is None
