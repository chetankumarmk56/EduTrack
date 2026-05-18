"""
Twilio Programmable Voice implementation of `CallProvider`.

Uses Twilio's REST API directly via httpx so the rest of the stack stays
async-native (the official `twilio` SDK is sync-only). We send inline TwiML
via the `Twiml` form parameter so callers don't have to host a public
callback URL just to read a message out.

Twilio API reference:
    POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Calls.json
"""
from __future__ import annotations

import logging
from typing import Optional
from xml.sax.saxutils import escape as xml_escape

import httpx

from app.core.config import settings

from .base import CallProvider, CallProviderError, CallResult, MissingCredentialsError

logger = logging.getLogger(__name__)

# Twilio classifies these HTTP responses as transient on the carrier side.
# 408 (timeout), 429 (rate limit), 5xx (Twilio outage) — safe to retry.
_RETRYABLE_STATUS_CODES = {408, 429, 500, 502, 503, 504}


class TwilioCallProvider(CallProvider):
    name = "twilio"

    def __init__(
        self,
        *,
        account_sid: Optional[str] = None,
        auth_token: Optional[str] = None,
        from_number: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
    ):
        self.account_sid = account_sid if account_sid is not None else settings.TWILIO_ACCOUNT_SID
        self.auth_token = auth_token if auth_token is not None else settings.TWILIO_AUTH_TOKEN
        self.from_number = from_number if from_number is not None else settings.TWILIO_FROM_NUMBER
        self.base_url = (base_url or settings.TWILIO_API_BASE_URL).rstrip("/")
        self.timeout_seconds = (
            timeout_seconds if timeout_seconds is not None else settings.TWILIO_REQUEST_TIMEOUT_SECONDS
        )

    # ── public API ──────────────────────────────────────────────────────────

    def is_configured(self) -> bool:
        return bool(self.account_sid and self.auth_token and self.from_number)

    async def place_call(self, *, to_number: str, message: str) -> CallResult:
        if not self.is_configured():
            raise MissingCredentialsError(
                "Twilio credentials missing — set TWILIO_ACCOUNT_SID, "
                "TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER"
            )

        url = f"{self.base_url}/2010-04-01/Accounts/{self.account_sid}/Calls.json"
        payload = {
            "To": to_number,
            "From": self.from_number,
            "Twiml": self._build_twiml(message),
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    url,
                    auth=(self.account_sid, self.auth_token),
                    data=payload,
                )
        except httpx.TimeoutException as exc:
            raise CallProviderError(
                f"Twilio API timed out after {self.timeout_seconds}s",
                retryable=True,
            ) from exc
        except httpx.RequestError as exc:
            raise CallProviderError(
                f"Twilio API network error: {exc}",
                retryable=True,
            ) from exc

        return self._handle_response(response, to_number)

    # ── internals ───────────────────────────────────────────────────────────

    def _build_twiml(self, message: str) -> str:
        """Wrap the message in a minimal <Say>...</Say> TwiML document."""
        safe_message = xml_escape(message or "")
        return (
            f'<Response>'
            f'<Say voice="{xml_escape(settings.TWILIO_TTS_VOICE)}" '
            f'language="{xml_escape(settings.TWILIO_TTS_LANGUAGE)}">'
            f'{safe_message}</Say>'
            f'</Response>'
        )

    def _handle_response(self, response: httpx.Response, to_number: str) -> CallResult:
        if response.status_code in (200, 201):
            try:
                body = response.json()
            except ValueError:
                body = {}
            sid = body.get("sid")
            status = body.get("status")
            logger.info(
                "CALL_SERVICE[twilio]: call queued sid=%s status=%s to=%s",
                sid, status, to_number,
            )
            return CallResult(success=True, provider=self.name, sid=sid, status=status)

        # Non-2xx: pull Twilio's structured error info if available
        vendor_code, vendor_message = self._parse_error(response)
        retryable = response.status_code in _RETRYABLE_STATUS_CODES
        logger.error(
            "CALL_SERVICE[twilio]: API error http=%s code=%s message=%s to=%s",
            response.status_code, vendor_code, vendor_message, to_number,
        )
        raise CallProviderError(
            f"Twilio API error (HTTP {response.status_code}): {vendor_message}",
            vendor_code=vendor_code,
            retryable=retryable,
        )

    @staticmethod
    def _parse_error(response: httpx.Response) -> tuple[Optional[str], str]:
        try:
            body = response.json()
        except ValueError:
            return None, (response.text or "<empty response body>")[:500]
        code = body.get("code")
        message = body.get("message") or body.get("more_info") or "Unknown Twilio error"
        return (str(code) if code is not None else None), message
