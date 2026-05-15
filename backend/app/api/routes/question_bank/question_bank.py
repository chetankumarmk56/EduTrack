"""Question Bank Generator HTTP routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from app.core.dependencies import require_faculty, UserContext
from app.core.logger import logger
from app.schemas.question_bank import (
    ExportPDFRequest,
    GenerateRequest,
    GenerateResponse,
    ParseFileResponse,
)
from app.services.question_bank import question_bank_service

router = APIRouter(prefix="/api/question-bank", tags=["Question Bank"])


@router.post("/parse-file", response_model=ParseFileResponse)
async def parse_file(
    file: UploadFile = File(...),
    _: UserContext = Depends(require_faculty),
):
    """Extract plain text from an uploaded PDF/DOCX/TXT for the generator."""
    try:
        content, filename = await question_bank_service.parse_uploaded_file(file)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return ParseFileResponse(content=content, filename=filename, chars=len(content))


@router.post("/generate", response_model=GenerateResponse)
async def generate_questions(
    request: GenerateRequest,
    _: UserContext = Depends(require_faculty),
):
    """Generate a structured question bank via OpenAI."""
    try:
        return await question_bank_service.generate(request)
    except RuntimeError as exc:
        # Configuration error (missing API key).
        raise HTTPException(status_code=503, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        logger.exception("Question Bank generation failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="Question generation failed. Please try again.",
        )


@router.post("/export-pdf")
async def export_pdf(
    request: ExportPDFRequest,
    _: UserContext = Depends(require_faculty),
):
    """Render the supplied questions to a PDF (exam paper or answer key)."""
    if not request.questions:
        raise HTTPException(status_code=400, detail="No questions to export.")
    try:
        pdf_bytes = question_bank_service.render_pdf(
            request.questions,
            request.subject,
            request.is_answer_key,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("PDF rendering failed: %s", exc)
        raise HTTPException(status_code=500, detail="Could not render PDF.")

    filename = request.filename or (
        "AnswerKey.pdf" if request.is_answer_key else "QuestionBank.pdf"
    )

    def _iter():
        yield pdf_bytes

    return StreamingResponse(
        _iter(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
