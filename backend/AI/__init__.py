"""AI feature package — Question Bank + Lesson Plan.

This package holds **all** backend code for the two AI-powered teacher
tools. It used to live in two external microservices
(``Question_bank_microservice`` and the ``New folder`` lesson-plan
planner); that logic now runs in-process here.

Design goals (see ``README.md`` for the full extraction guide):

* **Integrated now** — the main FastAPI app mounts the two routers and
  calls the generators in-process. No external HTTP service is required.
* **Microservice-ready later** — every dependency on the host app is
  funnelled through a small set of seams:

    - :mod:`AI.config` (env / settings)
    - ``app.core`` (database, logger, auth dependencies)
    - ``app.services.file_parsing`` (shared text extraction)
    - ``app.services.uploaded_file`` (the "My Files" library)

  To extract this folder into a standalone service, copy ``AI/`` out,
  reimplement those seams, and point the host app's
  ``QUESTION_BANK_AI_SERVICE_URL`` / ``LESSON_PLAN_AI_SERVICE_URL`` at it
  (the orchestration services already fall back to an HTTP dispatch when
  those URLs are set).

The two public routers are re-exported here so ``app.main`` has a single
import site.
"""
from AI.lesson_plan.routes import router as lesson_plan_router
from AI.question_bank.routes import router as question_bank_router

__all__ = ["question_bank_router", "lesson_plan_router"]
