"""
Provider-agnostic outbound voice-call orchestrator.

Responsibilities (kept out of the provider so swapping vendors stays cheap):
  * Phone-number normalization to E.164 (with an India-first default).
  * Retry with exponential backoff for transient provider failures.
  * Uniform success/failure logging.
  * Graceful no-op when the provider isn't configured (dev/test envs).

Public surface:
    call_service.trigger_call(to_number, message) -> bool

Callers (fee delay reminders, scheduled call triggers, etc.) don't need to
change. For richer integrations, use `place_call(...)` which returns a
structured `CallResult`.
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Optional

from app.core.config import settings

from .providers import (
    CallProvider,
    CallProviderError,
    CallResult,
    InvalidPhoneNumberError,
    MissingCredentialsError,
    TwilioCallProvider,
)

logger = logging.getLogger(__name__)

# Default country code applied when a caller passes a 10-digit local Indian
# number. Anything starting with "+" or "00" is treated as already-international
# and passed through unchanged after stripping separators.
_DEFAULT_COUNTRY_CODE = "+91"

_SEPARATORS_RE = re.compile(r"[\s\-()]+")


class CallService:
    """
    Orchestrates voice-call delivery against a pluggable `CallProvider`.

    Default provider is Twilio. Pass `provider=` to inject an alternative
    (handy for tests, or future vendor swaps).
    """

    def __init__(self, provider: Optional[CallProvider] = None):
        self.provider: CallProvider = provider or TwilioCallProvider()

    # ── public API ──────────────────────────────────────────────────────────

    async def trigger_call(self, to_number: str, message: str) -> bool:
        """
        Backwards-compatible entrypoint. Returns True iff the call was queued
        with the provider. Swallows expected failures (missing creds, bad
        numbers, vendor errors) so callers running inside batch jobs don't
        get blown up by a single bad row.

        For visibility into *why* a call failed, use `place_call`.
        """
        result = await self.place_call(to_number=to_number, message=message)
        return result.success

    async def place_call(self, *, to_number: str, message: str) -> CallResult:
        """
        Place a single call and return a structured `CallResult`. Never
        raises — all errors are folded into `CallResult.error`.
        """
        if not self.provider.is_configured():
            logger.warning(
                "CALL_SERVICE: provider %r not configured — skipping call to %s",
                self.provider.name, _mask_number(to_number),
            )
            return CallResult(
                success=False,
                provider=self.provider.name,
                error="provider not configured",
            )

        try:
            normalized = _normalize_to_e164(to_number)
        except InvalidPhoneNumberError as exc:
            logger.error("CALL_SERVICE: %s", exc)
            return CallResult(
                success=False,
                provider=self.provider.name,
                error=str(exc),
            )

        if not message or not message.strip():
            logger.error("CALL_SERVICE: refusing to place call with empty message")
            return CallResult(
                success=False,
                provider=self.provider.name,
                error="empty message",
            )

        return await self._dispatch_with_retry(to_number=normalized, message=message)

    # ── retry orchestration ─────────────────────────────────────────────────

    async def _dispatch_with_retry(self, *, to_number: str, message: str) -> CallResult:
        max_attempts = max(1, settings.TWILIO_MAX_RETRIES)
        backoff = max(0.0, settings.TWILIO_RETRY_BACKOFF_SECONDS)
        last_error: Optional[CallProviderError] = None

        for attempt in range(1, max_attempts + 1):
            try:
                logger.info(
                    "CALL_SERVICE: dispatch attempt %d/%d to=%s provider=%s",
                    attempt, max_attempts, _mask_number(to_number), self.provider.name,
                )
                return await self.provider.place_call(to_number=to_number, message=message)
            except MissingCredentialsError as exc:
                # No point retrying — creds aren't going to appear.
                logger.error("CALL_SERVICE: %s", exc)
                return CallResult(
                    success=False, provider=self.provider.name, error=str(exc),
                )
            except CallProviderError as exc:
                last_error = exc
                if not exc.retryable or attempt >= max_attempts:
                    logger.error(
                        "CALL_SERVICE: giving up after %d attempt(s) — %s",
                        attempt, exc,
                    )
                    return CallResult(
                        success=False,
                        provider=self.provider.name,
                        error=str(exc),
                        vendor_code=exc.vendor_code,
                    )
                sleep_for = backoff * (2 ** (attempt - 1))
                logger.warning(
                    "CALL_SERVICE: transient failure (%s) — retrying in %.1fs",
                    exc, sleep_for,
                )
                await asyncio.sleep(sleep_for)

        # Defensive — loop always returns above
        return CallResult(
            success=False,
            provider=self.provider.name,
            error=str(last_error) if last_error else "unknown failure",
        )


# ── helpers ─────────────────────────────────────────────────────────────────


def _normalize_to_e164(raw: str) -> str:
    """
    Best-effort normalization to E.164. Accepts:
      * "+919876543210" → "+919876543210"
      * "00919876543210" → "+919876543210"
      * "9876543210"     → "+919876543210"  (10-digit local Indian fallback)
      * "+1 (415) 555-1234" → "+14155551234"
    Raises `InvalidPhoneNumberError` for anything else.
    """
    if raw is None:
        raise InvalidPhoneNumberError("<None>")

    cleaned = _SEPARATORS_RE.sub("", raw.strip())
    if not cleaned:
        raise InvalidPhoneNumberError(raw)

    if cleaned.startswith("+"):
        digits = cleaned[1:]
        if not digits.isdigit() or not (8 <= len(digits) <= 15):
            raise InvalidPhoneNumberError(raw)
        return "+" + digits

    if cleaned.startswith("00"):
        digits = cleaned[2:]
        if not digits.isdigit() or not (8 <= len(digits) <= 15):
            raise InvalidPhoneNumberError(raw)
        return "+" + digits

    if cleaned.isdigit() and len(cleaned) == 10:
        return f"{_DEFAULT_COUNTRY_CODE}{cleaned}"

    raise InvalidPhoneNumberError(raw)


def _mask_number(number: str) -> str:
    """Mask middle digits in logs to avoid leaking PII at scale."""
    if not number:
        return "<empty>"
    if len(number) <= 4:
        return "*" * len(number)
    return number[:3] + "*" * (len(number) - 5) + number[-2:]


call_service = CallService()
