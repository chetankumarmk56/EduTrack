"""Configuration seam for the AI package.

Every environment-driven value the AI package needs is read **through
this module**, not directly from :mod:`app.core.config`. While the
package lives inside the monolith we proxy the host app's ``settings``
so there is a single source of environment truth. To lift ``AI/`` into a
standalone microservice, replace the body of this module with its own
``pydantic-settings`` ``BaseSettings`` — the public ``ai_settings``
attribute names below are the only contract the rest of the package
relies on.
"""
from __future__ import annotations

from typing import Optional

from app.core.config import settings as _settings


class _AISettings:
    """Read-only view of the AI-relevant configuration."""

    # ── OpenAI ────────────────────────────────────────────────────────
    @property
    def openai_api_key(self) -> Optional[str]:
        """Shared OpenAI key (fallback for both tools + legacy generator)."""
        return _settings.OPENAI_API_KEY

    @property
    def question_bank_api_key(self) -> Optional[str]:
        """Key for the Question Bank generator (its own, else the shared key)."""
        return _settings.QUESTION_BANK_OPENAI_API_KEY or _settings.OPENAI_API_KEY

    @property
    def lesson_plan_api_key(self) -> Optional[str]:
        """Key for the Lesson Plan generator (its own, else the shared key)."""
        return _settings.LESSON_PLAN_OPENAI_API_KEY or _settings.OPENAI_API_KEY

    @property
    def question_bank_model(self) -> str:
        """Model used by the Question Bank generator (PDF → questions)."""
        return _settings.QUESTION_BANK_OPENAI_MODEL

    @property
    def lesson_plan_model(self) -> str:
        """Model used by the Lesson Plan generator (chapter text → plan)."""
        return _settings.LESSON_PLAN_OPENAI_MODEL

    # ── Storage ───────────────────────────────────────────────────────
    @property
    def s3_bucket(self) -> Optional[str]:
        return _settings.AWS_S3_BUCKET

    # ── Optional external offload (microservice-ready seam) ───────────
    @property
    def question_bank_service_url(self) -> Optional[str]:
        """When set, Question Bank generation is dispatched over HTTP to a
        remote copy of this package instead of running in-process."""
        return (
            _settings.QUESTION_BANK_AI_SERVICE_URL
            or _settings.LESSON_PLAN_AI_SERVICE_URL
        )

    @property
    def question_bank_service_timeout(self) -> float:
        return (
            _settings.QUESTION_BANK_AI_SERVICE_TIMEOUT
            or _settings.LESSON_PLAN_AI_SERVICE_TIMEOUT
        )

    @property
    def lesson_plan_service_url(self) -> Optional[str]:
        return _settings.LESSON_PLAN_AI_SERVICE_URL

    @property
    def lesson_plan_service_timeout(self) -> float:
        return _settings.LESSON_PLAN_AI_SERVICE_TIMEOUT


ai_settings = _AISettings()

__all__ = ["ai_settings"]
