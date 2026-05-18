"""
Provider-agnostic interface for outbound voice calls.

A `CallProvider` knows how to dispatch a single TTS voice call to a phone
number. The orchestrating `CallService` is responsible for retries, number
validation, and selecting which provider to use — so swapping Twilio for
another vendor only requires adding a new subclass here.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


class CallProviderError(Exception):
    """Base for all provider-side failures. Carries an optional vendor code."""

    def __init__(self, message: str, *, vendor_code: Optional[str] = None, retryable: bool = False):
        super().__init__(message)
        self.vendor_code = vendor_code
        self.retryable = retryable


class MissingCredentialsError(CallProviderError):
    """Raised when the provider is invoked without sufficient credentials."""

    def __init__(self, message: str = "Provider credentials are not configured"):
        super().__init__(message, retryable=False)


class InvalidPhoneNumberError(CallProviderError):
    """Raised when a destination number can't be normalized to E.164."""

    def __init__(self, number: str):
        super().__init__(f"Invalid destination phone number: {number!r}", retryable=False)
        self.number = number


@dataclass
class CallResult:
    """Outcome of a single call attempt."""

    success: bool
    provider: str
    sid: Optional[str] = None       # vendor-side call identifier
    status: Optional[str] = None    # vendor-side status (e.g. "queued")
    error: Optional[str] = None     # human-readable failure description
    vendor_code: Optional[str] = None

    def as_dict(self) -> dict:
        return {
            "success": self.success,
            "provider": self.provider,
            "sid": self.sid,
            "status": self.status,
            "error": self.error,
            "vendor_code": self.vendor_code,
        }


class CallProvider(ABC):
    """Abstract base every voice-call vendor implementation must satisfy."""

    name: str = "base"

    @abstractmethod
    def is_configured(self) -> bool:
        """True if credentials are present and the provider can dispatch calls."""

    @abstractmethod
    async def place_call(self, *, to_number: str, message: str) -> CallResult:
        """
        Place a single TTS voice call.

        Args:
            to_number: destination phone number, already normalized to E.164.
            message:   plain text the provider should read out to the callee.

        Returns:
            CallResult with success=True on a 2xx response. Raises
            `CallProviderError` (with `retryable=True` where applicable) so the
            orchestrator can decide whether to retry.
        """
