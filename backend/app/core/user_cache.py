"""
Per-request user-status cache.

``get_current_user`` runs on every authenticated request. The JWT decode
is cheap (~50µs) but the follow-up ``SELECT * FROM users WHERE id = ?``
to confirm ``is_active`` was costing one DB round-trip per request — at
100 RPS that's an extra 100 QPS on Postgres for what is effectively a
boolean flag check.

This module caches ``(is_active, name)`` per user_id. Storage is
Redis-backed when ``settings.REDIS_URL`` is set (shared across replicas)
with an in-memory TTLCache fallback for dev / single-pod runs.

TTL is 60s by default. Operators that need *immediate* revocation
(deactivating a compromised account) call ``invalidate(user_id)`` from
the relevant admin write path — see app/services/admin/admin_service.py.

Cache semantics:
  * Miss / read-error → caller falls back to a DB SELECT and re-populates.
  * Hit → caller skips the SELECT entirely.
  * The cache is advisory; correctness still ultimately lives in Postgres.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Optional, TypedDict

from app.core.config import settings

logger = logging.getLogger(__name__)


DEFAULT_TTL_SECONDS = 60
KEY_PREFIX = "user_status:"


class UserStatusPayload(TypedDict):
    is_active: bool
    name: str


class UserStatusCache:
    """
    Two-tier cache. Redis when configured (shared across pods), else a
    process-local TTL dict.

    The class is safe to call from multiple coroutines on the same loop:
    the in-memory path is guarded by ``_mem_lock`` to keep concurrent
    populates from racing on the same key.
    """

    def __init__(self, ttl_seconds: int = DEFAULT_TTL_SECONDS) -> None:
        self._ttl = ttl_seconds
        self._redis = None  # redis.asyncio.Redis, lazy
        self._mem: dict[int, tuple[float, UserStatusPayload]] = {}
        self._mem_lock = asyncio.Lock()
        self._tried_redis_init = False

    # ── Redis client lifecycle ──────────────────────────────────────────

    async def _ensure_redis(self) -> bool:
        """
        Lazy-connect to Redis on first use. Returns True iff the client
        is healthy. Subsequent calls short-circuit. On connection
        failure we mark the attempt done and never retry (Redis hiccups
        shouldn't add latency on every cache miss).
        """
        if self._redis is not None:
            return True
        if self._tried_redis_init:
            return False
        self._tried_redis_init = True

        url = getattr(settings, "REDIS_URL", None)
        if not url:
            logger.info("[user-cache] REDIS_URL unset — using in-memory fallback.")
            return False
        try:
            import redis.asyncio as aioredis
            self._redis = aioredis.from_url(url, decode_responses=True)
            await self._redis.ping()
            logger.info("[user-cache] Redis backend connected.")
            return True
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "[user-cache] Redis init failed (%s) — falling back to in-memory.",
                exc,
            )
            self._redis = None
            return False

    # ── Public API ──────────────────────────────────────────────────────

    async def get(self, user_id: int) -> Optional[UserStatusPayload]:
        """Return cached status or None on miss."""
        if await self._ensure_redis():
            try:
                raw = await self._redis.get(self._key(user_id))
                if raw is None:
                    return None
                return json.loads(raw)
            except Exception as exc:  # noqa: BLE001
                logger.debug("[user-cache] redis get failed (%s); reading mem", exc)
                # Fall through to in-memory read so a Redis blip doesn't
                # force a DB hit on every request.
        return self._mem_get(user_id)

    async def set(
        self,
        user_id: int,
        payload: UserStatusPayload,
        ttl: Optional[int] = None,
    ) -> None:
        """Store status. TTL defaults to DEFAULT_TTL_SECONDS."""
        ttl = ttl or self._ttl
        if await self._ensure_redis():
            try:
                await self._redis.setex(
                    self._key(user_id),
                    ttl,
                    json.dumps(payload),
                )
                return
            except Exception as exc:  # noqa: BLE001
                logger.debug("[user-cache] redis set failed (%s); writing mem", exc)
        # Always also populate mem so a subsequent Redis flap doesn't
        # leave us cold.
        await self._mem_set(user_id, payload, ttl)

    async def invalidate(self, user_id: int) -> None:
        """
        Drop the cache entry. Called from admin write paths when a user
        is deactivated / updated so the next authenticated request
        re-reads from Postgres instead of waiting up to ``ttl`` seconds.
        """
        if await self._ensure_redis():
            try:
                await self._redis.delete(self._key(user_id))
            except Exception as exc:  # noqa: BLE001
                logger.debug("[user-cache] redis del failed (%s)", exc)
        async with self._mem_lock:
            self._mem.pop(user_id, None)

    # ── Helpers ─────────────────────────────────────────────────────────

    @staticmethod
    def _key(user_id: int) -> str:
        return f"{KEY_PREFIX}{user_id}"

    def _mem_get(self, user_id: int) -> Optional[UserStatusPayload]:
        entry = self._mem.get(user_id)
        if entry is None:
            return None
        expires_at, payload = entry
        if expires_at < time.monotonic():
            # Expired — drop it. We don't take the lock for the read+drop
            # because a concurrent set will overwrite us anyway; worst
            # case is one extra DB hit, which is harmless.
            self._mem.pop(user_id, None)
            return None
        return payload

    async def _mem_set(
        self,
        user_id: int,
        payload: UserStatusPayload,
        ttl: int,
    ) -> None:
        async with self._mem_lock:
            self._mem[user_id] = (time.monotonic() + ttl, payload)


# Module-level singleton. Import as ``from app.core.user_cache import user_cache``.
user_cache = UserStatusCache()
