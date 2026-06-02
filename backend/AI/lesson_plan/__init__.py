"""Lesson Plan feature.

Layers (top → bottom):

* :mod:`AI.lesson_plan.routes`     — FastAPI HTTP surface.
* :mod:`AI.lesson_plan.service`    — S3 orchestration + generate dispatch.
* :mod:`AI.lesson_plan.generator`  — in-process AI generation (chapter text → plan).
* :mod:`AI.lesson_plan.storage`    — S3 / local-disk key-value store.
* :mod:`AI.lesson_plan.schemas`    — Pydantic wire contract.
"""
from AI.lesson_plan.service import lesson_plan_ai_service  # noqa: F401

__all__ = ["lesson_plan_ai_service"]
