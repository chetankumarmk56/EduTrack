"""
Expo push-notification dispatch.

Design notes
------------
* Tokens live in `device_tokens`. A single user can have multiple active
  tokens (parent + spouse on shared login, phone + tablet, etc).
* We do NOT call Firebase / APNs directly. Expo's HTTPS API takes
  `ExponentPushToken[...]` strings and fans the message out to FCM/APNs
  itself — that's the whole point of using Expo.
* Every dispatch attempt is recorded in `push_delivery_logs` so the
  operator can answer "why didn't parent X get the message?" without
  polling Expo's receipt API directly.
* Invalid tokens (Expo says `DeviceNotRegistered`, `InvalidCredentials`,
  or similar) are auto-marked `is_active=False` so we stop hammering
  them. Mobile clients re-register on next launch, which flips them
  back on (or creates a new row if the token was rotated).
* Retries are limited to transient network failures. HTTP 4xx errors
  from Expo are treated as terminal — they reflect a real intent,
  retrying just compounds the bug.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Iterable, List, Optional, Sequence

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.communication import DeviceToken, PushDeliveryLog

logger = logging.getLogger(__name__)


class PushNotificationType(str, Enum):
    """
    Stable identifiers for each feature that emits push notifications.
    Added here (rather than per-feature) so cross-cutting consumers
    (logging dashboards, retry workers) can switch on a single enum.
    """
    ANNOUNCEMENT = "announcement"
    FEE_REMINDER = "fee_reminder"
    ATTENDANCE_ALERT = "attendance_alert"
    CIRCULAR = "circular"
    GENERIC = "generic"


# Expo error codes that mean "this token is dead, don't retry"
# https://docs.expo.dev/push-notifications/sending-notifications/#individual-errors
_INVALID_TOKEN_ERRORS = frozenset({
    "DeviceNotRegistered",
    "InvalidCredentials",
    "ExpoError",  # rare catch-all, but Expo's docs flag it as terminal
})

_MAX_NETWORK_RETRIES = 2
_RETRY_BACKOFF_SECONDS = (1.0, 3.0)


@dataclass
class _PushAttempt:
    """One device-token-scoped attempt. Lives only inside a single dispatch."""
    log_id: int
    token: str
    device_token_id: int


class PushService:
    """
    Single-flight dispatch helper. Stateless apart from the shared HTTP client.
    """

    @staticmethod
    def _is_valid_expo_token(token: str) -> bool:
        """Cheap sanity check — Expo tokens are always wrapped like ExponentPushToken[...]."""
        return token.startswith("ExponentPushToken[") and token.endswith("]")

    # ── token management ────────────────────────────────────────────────────

    async def register_token(
        self,
        db: AsyncSession,
        *,
        user_id: int,
        institution_id: int,
        expo_push_token: str,
        platform: str,
        device_name: Optional[str] = None,
    ) -> DeviceToken:
        """
        Idempotent register. Re-registering the same token re-activates it
        and bumps `last_used_at` so the next dispatch picks it up. If the
        token is in use by a different user (shared-device handoff,
        re-login on a hand-me-down phone), we move it.
        """
        if not self._is_valid_expo_token(expo_push_token):
            raise ValueError("Not a valid Expo push token")

        existing = (await db.execute(
            select(DeviceToken).where(DeviceToken.expo_push_token == expo_push_token)
        )).scalars().first()

        now = datetime.now(timezone.utc)
        if existing:
            existing.user_id = user_id
            existing.institution_id = institution_id
            existing.platform = platform
            existing.device_name = device_name or existing.device_name
            existing.is_active = True
            existing.invalidated_at = None
            existing.last_used_at = now
            await db.commit()
            await db.refresh(existing)
            return existing

        token = DeviceToken(
            user_id=user_id,
            institution_id=institution_id,
            expo_push_token=expo_push_token,
            platform=platform,
            device_name=device_name,
            is_active=True,
            last_used_at=now,
        )
        db.add(token)
        await db.commit()
        await db.refresh(token)
        return token

    async def unregister_token(
        self,
        db: AsyncSession,
        *,
        user_id: int,
        expo_push_token: str,
    ) -> bool:
        """
        Soft-delete a token. Called on logout. We don't hard-delete so the
        delivery log still has a stable FK target for forensics.
        """
        result = await db.execute(
            update(DeviceToken)
            .where(
                DeviceToken.expo_push_token == expo_push_token,
                DeviceToken.user_id == user_id,
            )
            .values(is_active=False, invalidated_at=datetime.now(timezone.utc))
        )
        await db.commit()
        return result.rowcount > 0

    async def list_user_tokens(
        self,
        db: AsyncSession,
        *,
        user_id: int,
        active_only: bool = True,
    ) -> List[DeviceToken]:
        stmt = select(DeviceToken).where(DeviceToken.user_id == user_id)
        if active_only:
            stmt = stmt.where(DeviceToken.is_active.is_(True))
        return list((await db.execute(stmt)).scalars().all())

    # ── dispatch ────────────────────────────────────────────────────────────

    async def send_to_users(
        self,
        db: AsyncSession,
        *,
        institution_id: int,
        user_ids: Sequence[int],
        title: str,
        body: str,
        data: Optional[dict] = None,
        notification_type: PushNotificationType = PushNotificationType.GENERIC,
        reference_id: Optional[str] = None,
        priority: str = "high",
    ) -> dict:
        """
        Fan out a notification to all active device tokens of the given users.

        Returns a summary dict so background-task callers can log it.
        """
        if not user_ids:
            return {"sent": 0, "failed": 0, "tokens": 0, "skipped": "no users"}

        # Fetch active tokens for the target user set in one query
        tokens_q = (await db.execute(
            select(DeviceToken).where(
                DeviceToken.user_id.in_(list(set(user_ids))),
                DeviceToken.is_active.is_(True),
            )
        )).scalars().all()

        if not tokens_q:
            logger.info(
                "[push] no active device tokens for %d user(s) — skipping dispatch (%s)",
                len(user_ids), notification_type.value,
            )
            return {"sent": 0, "failed": 0, "tokens": 0, "skipped": "no tokens"}

        # Build messages + log rows
        attempts: List[_PushAttempt] = []
        for dt in tokens_q:
            log = PushDeliveryLog(
                institution_id=institution_id,
                notification_type=notification_type.value,
                reference_id=reference_id,
                device_token_id=dt.id,
                user_id=dt.user_id,
                status="queued",
            )
            db.add(log)
            await db.flush()  # populates log.id without committing
            attempts.append(_PushAttempt(
                log_id=log.id,
                token=dt.expo_push_token,
                device_token_id=dt.id,
            ))
        await db.commit()

        messages: List[dict] = []
        for a in attempts:
            msg = {
                "to": a.token,
                "title": title,
                "body": body,
                "sound": "default",
                "priority": priority,
                "data": data or {},
            }
            messages.append(msg)

        # Dispatch in batches
        batch_size = settings.EXPO_BATCH_SIZE
        sent = 0
        failed = 0
        invalid_token_ids: List[int] = []

        for i in range(0, len(messages), batch_size):
            batch_msgs = messages[i:i + batch_size]
            batch_atts = attempts[i:i + batch_size]
            try:
                tickets = await self._post_to_expo(batch_msgs)
            except httpx.HTTPError as exc:
                # The whole batch failed at transport level. Mark each row
                # as failed but leave the tokens alive — a transient
                # network blip shouldn't deactivate working devices.
                logger.exception("[push] Expo dispatch failed for batch starting at %d", i)
                await self._mark_batch_failed(db, batch_atts, str(exc))
                failed += len(batch_atts)
                continue

            # Per-message result handling
            for att, ticket in zip(batch_atts, tickets):
                if ticket.get("status") == "ok":
                    await self._mark_sent(db, att.log_id, ticket.get("id"))
                    sent += 1
                else:
                    err_details = ticket.get("details") or {}
                    err_code = err_details.get("error") if isinstance(err_details, dict) else None
                    err_message = ticket.get("message") or "Expo returned non-ok status"
                    await self._mark_failed(
                        db, att.log_id,
                        error=err_message,
                        invalid_token=err_code in _INVALID_TOKEN_ERRORS,
                    )
                    failed += 1
                    if err_code in _INVALID_TOKEN_ERRORS:
                        invalid_token_ids.append(att.device_token_id)

        # Deactivate all flagged-as-dead tokens in one statement
        if invalid_token_ids:
            await db.execute(
                update(DeviceToken)
                .where(DeviceToken.id.in_(invalid_token_ids))
                .values(is_active=False, invalidated_at=datetime.now(timezone.utc))
            )
            await db.commit()
            logger.info("[push] deactivated %d invalid token(s)", len(invalid_token_ids))

        return {
            "sent": sent,
            "failed": failed,
            "tokens": len(attempts),
            "invalidated": len(invalid_token_ids),
        }

    # ── HTTP plumbing ───────────────────────────────────────────────────────

    async def _post_to_expo(self, messages: List[dict]) -> List[dict]:
        """
        Hit Expo's push API with retries for *transport-level* failures only.
        Expo returns one `ticket` per message in `data` (same order).
        """
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate",
        }
        if settings.EXPO_ACCESS_TOKEN:
            headers["Authorization"] = f"Bearer {settings.EXPO_ACCESS_TOKEN}"

        attempt = 0
        last_exc: Optional[BaseException] = None
        while attempt <= _MAX_NETWORK_RETRIES:
            try:
                async with httpx.AsyncClient(timeout=settings.EXPO_REQUEST_TIMEOUT_SECONDS) as client:
                    resp = await client.post(
                        settings.EXPO_PUSH_URL,
                        json=messages,
                        headers=headers,
                    )
                resp.raise_for_status()
                payload = resp.json()
                data = payload.get("data")
                if not isinstance(data, list):
                    raise httpx.HTTPError(f"Unexpected Expo response shape: {payload}")
                # Pad short responses just in case — should not happen.
                if len(data) < len(messages):
                    data = data + [{"status": "error", "message": "missing-ticket"}] * (len(messages) - len(data))
                return data
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                last_exc = exc
                if attempt >= _MAX_NETWORK_RETRIES:
                    break
                backoff = _RETRY_BACKOFF_SECONDS[min(attempt, len(_RETRY_BACKOFF_SECONDS) - 1)]
                logger.warning(
                    "[push] transient Expo error (attempt %d/%d): %s — retrying in %.1fs",
                    attempt + 1, _MAX_NETWORK_RETRIES + 1, exc, backoff,
                )
                await asyncio.sleep(backoff)
                attempt += 1
            except httpx.HTTPStatusError as exc:
                # Real response (4xx/5xx). Don't retry — Expo means it.
                logger.error("[push] Expo returned %s: %s", exc.response.status_code, exc.response.text[:500])
                raise
        # Exhausted retries
        assert last_exc is not None
        raise last_exc

    # ── log helpers ─────────────────────────────────────────────────────────

    async def _mark_sent(self, db: AsyncSession, log_id: int, expo_ticket_id: Optional[str]) -> None:
        await db.execute(
            update(PushDeliveryLog)
            .where(PushDeliveryLog.id == log_id)
            .values(status="sent", expo_ticket_id=expo_ticket_id, sent_at=datetime.now(timezone.utc))
        )
        await db.commit()

    async def _mark_failed(
        self,
        db: AsyncSession,
        log_id: int,
        *,
        error: str,
        invalid_token: bool,
    ) -> None:
        await db.execute(
            update(PushDeliveryLog)
            .where(PushDeliveryLog.id == log_id)
            .values(
                status="invalid_token" if invalid_token else "failed",
                error_message=error[:2000],
                sent_at=datetime.now(timezone.utc),
            )
        )
        await db.commit()

    async def _mark_batch_failed(
        self,
        db: AsyncSession,
        attempts: Iterable[_PushAttempt],
        error: str,
    ) -> None:
        log_ids = [a.log_id for a in attempts]
        if not log_ids:
            return
        await db.execute(
            update(PushDeliveryLog)
            .where(PushDeliveryLog.id.in_(log_ids))
            .values(status="failed", error_message=error[:2000], sent_at=datetime.now(timezone.utc))
        )
        await db.commit()


push_service = PushService()
