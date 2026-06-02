"""
WebSocket fan-out plumbing.

Two responsibilities split across two classes:

* ``ConnectionManager`` keeps per-process state: which sockets on THIS pod
  are subscribed to which channel. Channel names are tenant-scoped
  (e.g. ``{resource}:{institution_id}:{resource_id}``) so a leak between
  schools is impossible.
* ``RedisBroadcaster`` ferries messages between pods via Redis pub/sub.
  When REDIS_URL is set, a publish in pod A is delivered to live sockets
  in pod B. When REDIS_URL is unset (single-process dev), publishes are
  delivered locally only — a clear warning is logged on first use in
  prod so a misconfigured multi-replica deploy is obvious.

Lifecycle:

* ``broadcaster.start()`` is called from the FastAPI lifespan; it lazy-
  connects to Redis and spawns a single reader task that ingests every
  subscribed message and forwards to the local manager.
* ``broadcaster.stop()`` cancels the reader task and closes the redis
  connection on shutdown.

Why one global subscriber instead of one-per-socket: Redis pub/sub has no
per-channel cost on the client beyond memory for subscription state, so
holding one persistent connection per pod is the cheapest and most
robust design. New channels are added/removed as clients connect and
disconnect.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Dict, Optional, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Per-process socket registry. Pure in-memory; no cross-pod awareness."""

    def __init__(self) -> None:
        # channel → set of live sockets on THIS pod
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, channel: str) -> bool:
        """
        Register an already-accepted socket. Returns True if this is the
        FIRST socket on this pod for the channel — callers use that signal
        to subscribe upstream (Redis) exactly once per channel-per-pod.
        """
        async with self._lock:
            first = channel not in self.active_connections
            self.active_connections.setdefault(channel, set()).add(websocket)
            return first

    async def disconnect(self, websocket: WebSocket, channel: str) -> bool:
        """
        Drop the socket. Returns True if the channel now has zero sockets
        on this pod (callers can use this to unsubscribe upstream).
        """
        async with self._lock:
            sockets = self.active_connections.get(channel)
            if not sockets:
                return False
            sockets.discard(websocket)
            if not sockets:
                self.active_connections.pop(channel, None)
                return True
            return False

    async def broadcast_local(self, channel: str, message: dict) -> None:
        """
        Send `message` to every local socket subscribed to `channel`.
        Stale sockets that raise are removed in-line so a half-closed
        client can't slow the next broadcast.
        """
        sockets = list(self.active_connections.get(channel, ()))
        if not sockets:
            return
        dead: list[WebSocket] = []
        for ws in sockets:
            try:
                await ws.send_json(message)
            except Exception as exc:  # noqa: BLE001
                logger.debug("[ws] drop stale socket on %s: %s", channel, exc)
                dead.append(ws)
        if dead:
            async with self._lock:
                bucket = self.active_connections.get(channel)
                if bucket:
                    for ws in dead:
                        bucket.discard(ws)
                    if not bucket:
                        self.active_connections.pop(channel, None)


class RedisBroadcaster:
    """
    Cross-pod fan-out via Redis pub/sub. Safe to call ``publish`` even
    when Redis is unavailable — it falls back to local-only delivery.
    """

    def __init__(self, manager: ConnectionManager, redis_url: Optional[str]) -> None:
        self._manager = manager
        self._redis_url = redis_url
        self._redis = None  # redis.asyncio.Redis
        self._pubsub = None
        self._reader_task: Optional[asyncio.Task] = None
        self._channels: Set[str] = set()
        self._lock = asyncio.Lock()
        self._warned_single_instance = False

    @property
    def is_distributed(self) -> bool:
        return self._redis is not None

    async def start(self) -> None:
        """Lazy-connect to Redis and spawn the reader task. Idempotent."""
        if self._redis_url is None:
            logger.info("[ws] RedisBroadcaster running in single-pod mode (no REDIS_URL set).")
            return
        if self._redis is not None:
            return
        try:
            import redis.asyncio as aioredis
        except ImportError:
            logger.error(
                "[ws] redis package missing — install `redis>=5.0.0`. "
                "Falling back to single-pod mode."
            )
            return
        try:
            self._redis = aioredis.from_url(self._redis_url, decode_responses=True)
            await self._redis.ping()
            self._pubsub = self._redis.pubsub(ignore_subscribe_messages=True)
            self._reader_task = asyncio.create_task(
                self._reader_loop(), name="ws-redis-reader"
            )
            logger.info("[ws] RedisBroadcaster connected; cross-pod fan-out enabled.")
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "[ws] RedisBroadcaster failed to connect (%s). "
                "Falling back to single-pod mode.", exc,
            )
            self._redis = None
            self._pubsub = None

    async def stop(self) -> None:
        if self._reader_task and not self._reader_task.done():
            self._reader_task.cancel()
            try:
                await self._reader_task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        if self._pubsub is not None:
            try:
                # redis>=5.0.1 deprecates close() in favour of aclose().
                close = getattr(self._pubsub, "aclose", None) or self._pubsub.close
                await close()
            except Exception:  # noqa: BLE001
                pass
        if self._redis is not None:
            try:
                close = getattr(self._redis, "aclose", None) or self._redis.close
                await close()
            except Exception:  # noqa: BLE001
                pass
        self._reader_task = None
        self._pubsub = None
        self._redis = None
        self._channels.clear()

    async def subscribe(self, channel: str) -> None:
        """Called when a pod gets its FIRST local socket on this channel."""
        if self._pubsub is None:
            return
        async with self._lock:
            if channel in self._channels:
                return
            try:
                await self._pubsub.subscribe(channel)
                self._channels.add(channel)
            except Exception as exc:  # noqa: BLE001
                logger.warning("[ws] subscribe(%s) failed: %s", channel, exc)

    async def unsubscribe(self, channel: str) -> None:
        """Called when a pod's LAST local socket on this channel disconnects."""
        if self._pubsub is None:
            return
        async with self._lock:
            if channel not in self._channels:
                return
            try:
                await self._pubsub.unsubscribe(channel)
                self._channels.discard(channel)
            except Exception as exc:  # noqa: BLE001
                logger.warning("[ws] unsubscribe(%s) failed: %s", channel, exc)

    async def publish(self, channel: str, message: dict) -> None:
        """
        Deliver `message` to every subscribed socket cluster-wide.

        Distributed mode: PUBLISH to Redis; every pod (including this one)
        receives the message via _reader_loop and broadcasts locally.

        Single-pod mode: broadcast directly to local sockets. Logs a warning
        on first use in prod so a misconfigured multi-replica deploy gets
        noticed.
        """
        if self._redis is None:
            from app.core.config import settings
            if settings.ENVIRONMENT == "prod" and not self._warned_single_instance:
                logger.warning(
                    "[ws] publishing on %s without Redis pub/sub — "
                    "other replicas will NOT see this message. "
                    "Set REDIS_URL to enable cross-pod fan-out.",
                    channel,
                )
                self._warned_single_instance = True
            await self._manager.broadcast_local(channel, message)
            return
        try:
            await self._redis.publish(channel, json.dumps(message))
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "[ws] redis publish failed for %s (%s); delivering locally only",
                channel, exc,
            )
            await self._manager.broadcast_local(channel, message)

    async def _reader_loop(self) -> None:
        """
        Single long-running task that drains messages from pubsub and
        fans them to local sockets. Survives transient Redis errors by
        reconnecting via `get_message` retry semantics.
        """
        assert self._pubsub is not None
        logger.info("[ws] redis reader loop started")
        try:
            while True:
                # Skip the get_message poll until at least one channel has
                # been subscribed. Otherwise the pubsub object has no
                # underlying connection yet and every poll raises
                # "pubsub connection not set", spamming the log twice a
                # second while the server is otherwise idle.
                if not self._channels:
                    await asyncio.sleep(0.5)
                    continue
                try:
                    msg = await self._pubsub.get_message(
                        ignore_subscribe_messages=True, timeout=1.0
                    )
                except asyncio.CancelledError:
                    raise
                except Exception as exc:  # noqa: BLE001
                    logger.warning("[ws] redis reader error: %s", exc)
                    await asyncio.sleep(0.5)
                    continue
                if msg is None:
                    continue
                channel = msg.get("channel")
                data_raw = msg.get("data")
                if not channel or not data_raw:
                    continue
                try:
                    payload = json.loads(data_raw)
                except (TypeError, ValueError):
                    logger.warning("[ws] dropping non-JSON message on %s", channel)
                    continue
                await self._manager.broadcast_local(channel, payload)
        except asyncio.CancelledError:
            logger.info("[ws] redis reader loop cancelled")
            raise


# Module-level singletons. These are constructed at import time so other
# modules can `from app.core.websocket import manager, broadcaster` without
# circular imports. The Redis connection is opened later in lifespan.
manager = ConnectionManager()


def _make_broadcaster() -> RedisBroadcaster:
    from app.core.config import settings
    return RedisBroadcaster(manager, getattr(settings, "REDIS_URL", None))


broadcaster = _make_broadcaster()
