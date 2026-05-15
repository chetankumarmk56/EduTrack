"""Lesson Plan HTTP routes (PDF export)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.core.dependencies import require_faculty, UserContext
from app.core.logger import logger
from app.schemas.lesson_plan import ExportLessonPlanPDFRequest
from app.services.lesson_plan import lesson_plan_service

router = APIRouter(prefix="/api/lesson-plan", tags=["Lesson Plan"])


@router.post("/export-pdf")
async def export_pdf(
    request: ExportLessonPlanPDFRequest,
    _: UserContext = Depends(require_faculty),
):
    """Render the supplied lesson plan to a PDF."""
    if not request.lesson_plan:
        raise HTTPException(status_code=400, detail="Lesson plan is empty.")
    try:
        pdf_bytes = lesson_plan_service.render_pdf(
            lesson_plan=request.lesson_plan,
            subject=request.subject,
            start_date=request.start_date,
            end_date=request.end_date,
            warning_message=request.warning_message,
            document_name=request.document_name,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Lesson plan PDF rendering failed: %s", exc)
        raise HTTPException(status_code=500, detail="Could not render PDF.")

    filename = request.filename or "LessonPlan.pdf"

    def _iter():
        yield pdf_bytes

    return StreamingResponse(
        _iter(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
