"""Question Bank feature.

Layers (top → bottom):

* :mod:`AI.question_bank.routes`        — FastAPI HTTP surface.
* :mod:`AI.question_bank.service`       — S3 orchestration + "My Files" + generate dispatch.
* :mod:`AI.question_bank.legacy_service`— inline OpenAI generator + PDF export (classic flow).
* :mod:`AI.question_bank.generator`     — in-process AI generation (PDF → questions).
* :mod:`AI.question_bank.storage`       — S3 / local-disk key-value store.
* :mod:`AI.question_bank.schemas`       — Pydantic wire contract.
"""
from AI.question_bank.legacy_service import question_bank_service  # noqa: F401
from AI.question_bank.service import question_bank_ai_service  # noqa: F401

__all__ = ["question_bank_ai_service", "question_bank_service"]
