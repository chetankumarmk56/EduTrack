"""Question Bank HTTP routes.

Four surfaces live here:

* ``POST /api/question-bank/parse-file`` — legacy in-process parsing
  used by the inline OpenAI generator (kept for back-compat).
* ``POST /api/question-bank/generate``   — legacy inline generator,
  forwarded to the in-process OpenAI provider when called with the
  classic ``GenerateRequest`` body (topics + specs).
* ``POST /api/question-bank/export-pdf`` — render a question list to a
  PDF (exam paper or answer key).

S3 + external AI microservice flow (mirrors Lesson Plan):

* ``POST /api/question-bank/upload``   — save uploaded files + metadata
  JSON to S3 under ``question-bank/{scope}/``.
* ``POST /api/question-bank/generate-s3`` — load metadata from S3, call
  the external AI microservice, return ``output/question_bank.json``.
* ``GET  /api/question-bank/output``    — read the generated JSON
  directly from S3 without re-generating.
* ``GET  /api/question-bank/chapters``  — list every question bank the
  current teacher has saved.
* ``DELETE /api/question-bank/chapter`` — remove all S3 objects under a
  question bank prefix.
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_faculty, UserContext
from app.core.logger import logger
from app.schemas.question_bank import (
    DeleteQuestionBankResponse,
    DiagramUploadResponse,
    ExportPDFRequest,
    GenerateRequest,
    GenerateResponse,
    ParseFileResponse,
    QuestionBankIdentity,
    QuestionBankListResponse,
    QuestionBankOutputResponse,
    QuestionBankUploadResponse,
    SaveQuestionBankRequest,
)
from app.services.question_bank import (
    question_bank_ai_service,
    question_bank_service,
)

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


# ─── S3 + external AI microservice flow ──────────────────────────────────────
# These endpoints mirror the Lesson Plan upload/generate/output flow. The
# backend stores files + metadata in S3 and dispatches to the same external
# microservice with ``type=question_bank``; no AI generation runs here.

@router.post("/upload", response_model=QuestionBankUploadResponse)
async def upload_question_bank_resources(
    school_id: str = Form(...),
    teacher_id: str = Form(...),
    grade_id: str = Form(...),
    subject_id: str = Form(...),
    chapter_id: str = Form(...),
    subject: str = Form(...),
    grade: str = Form(...),
    chapter: str = Form(...),
    focus_topic: Optional[str] = Form(None),
    focus_percentage: Optional[int] = Form(None),
    focus_questions: Optional[int] = Form(None),
    language: str = Form("English"),
    number_of_questions: int = Form(...),
    total_marks: int = Form(...),
    extra_instructions: str = Form(""),
    files: List[UploadFile] = File(...),
    user: UserContext = Depends(require_faculty),
) -> QuestionBankUploadResponse:
    """Persist uploaded files + ``metadata.json`` under the canonical S3 scope.

    No AI is invoked. This is the **Save** action.
    """
    identity = QuestionBankIdentity(
        school_id=school_id,
        teacher_id=teacher_id,
        grade_id=grade_id,
        subject_id=subject_id,
        chapter_id=chapter_id,
    )

    return await question_bank_ai_service.upload_resources(
        user=user,
        identity=identity,
        files=files,
        subject=subject,
        grade=grade,
        chapter=chapter,
        focus_topic=focus_topic,
        focus_percentage=focus_percentage,
        focus_questions=focus_questions,
        language=language,
        number_of_questions=number_of_questions,
        total_marks=total_marks,
        extra_instructions=extra_instructions,
    )


@router.post("/generate-s3", response_model=QuestionBankOutputResponse)
async def generate_question_bank_s3(
    identity: QuestionBankIdentity,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_faculty),
) -> QuestionBankOutputResponse:
    """Load ``metadata.json`` from S3, dispatch to the external AI
    microservice, and return the generated question bank.

    The AI microservice reads the uploaded files from S3, generates the
    question bank, saves ``output/question_bank.json`` to S3, and
    returns only when done. This endpoint then reads that file and
    returns it to the client.

    After a successful generation, a row is added to the teacher's
    My Files library so the output appears alongside their uploads.

    503 if neither ``QUESTION_BANK_AI_SERVICE_URL`` nor ``LESSON_PLAN_AI_SERVICE_URL`` is configured.
    404 if metadata has not been uploaded yet.
    502 if the AI service call fails.
    """
    return await question_bank_ai_service.generate(
        user=user, identity=identity, db=db
    )


@router.get("/output", response_model=QuestionBankOutputResponse)
async def fetch_question_bank_output(
    school_id: str = Query(...),
    teacher_id: str = Query(...),
    grade_id: str = Query(...),
    subject_id: str = Query(...),
    chapter_id: str = Query(...),
    user: UserContext = Depends(require_faculty),
) -> QuestionBankOutputResponse:
    """Return ``output/question_bank.json`` from S3 for the given chapter.

    404 if the external microservice has not produced output yet.
    """
    identity = QuestionBankIdentity(
        school_id=school_id,
        teacher_id=teacher_id,
        grade_id=grade_id,
        subject_id=subject_id,
        chapter_id=chapter_id,
    )
    return await question_bank_ai_service.get_output(
        user=user, identity=identity
    )


@router.put("/output", response_model=QuestionBankOutputResponse)
async def save_question_bank_output(
    request: SaveQuestionBankRequest,
    user: UserContext = Depends(require_faculty),
) -> QuestionBankOutputResponse:
    """Persist a teacher-edited question bank back to S3.

    Overwrites ``output/question_bank.json`` and, when the request body
    includes a ``metadata`` patch, also rewrites ``metadata.json`` so
    edits to the header (subject / grade / chapter / focus / language /
    counts) survive.
    """
    identity = QuestionBankIdentity(
        school_id=request.school_id,
        teacher_id=request.teacher_id,
        grade_id=request.grade_id,
        subject_id=request.subject_id,
        chapter_id=request.chapter_id,
    )
    return await question_bank_ai_service.save_output(
        user=user,
        identity=identity,
        question_bank=request.question_bank,
        metadata_patch=request.metadata,
    )


# ─── Diagram images (per-question, teacher uploaded) ─────────────────────────
@router.post("/diagram", response_model=DiagramUploadResponse)
async def upload_question_diagram(
    school_id: str = Form(...),
    teacher_id: str = Form(...),
    grade_id: str = Form(...),
    subject_id: str = Form(...),
    chapter_id: str = Form(...),
    question_id: Optional[str] = Form(None),
    file: UploadFile = File(...),
    user: UserContext = Depends(require_faculty),
) -> DiagramUploadResponse:
    """Persist a single diagram image and return its S3 key.

    The frontend posts here once per upload (after the AI marks a
    question as ``diagram_required``), stores the returned ``key`` on
    the question, and then calls ``PUT /output`` to make the attachment
    permanent.
    """
    identity = QuestionBankIdentity(
        school_id=school_id,
        teacher_id=teacher_id,
        grade_id=grade_id,
        subject_id=subject_id,
        chapter_id=chapter_id,
    )
    return await question_bank_ai_service.upload_diagram(
        user=user, identity=identity, question_id=question_id, file=file
    )


@router.get("/diagram")
async def fetch_question_diagram(
    school_id: str = Query(...),
    teacher_id: str = Query(...),
    grade_id: str = Query(...),
    subject_id: str = Query(...),
    chapter_id: str = Query(...),
    key: str = Query(...),
    user: UserContext = Depends(require_faculty),
):
    """Stream a stored diagram image. Key must live under the chapter scope."""
    identity = QuestionBankIdentity(
        school_id=school_id,
        teacher_id=teacher_id,
        grade_id=grade_id,
        subject_id=subject_id,
        chapter_id=chapter_id,
    )
    data, mime = await question_bank_ai_service.read_diagram(
        user=user, identity=identity, key=key
    )

    def _iter():
        yield data

    return StreamingResponse(_iter(), media_type=mime)


@router.get("/chapters", response_model=QuestionBankListResponse)
async def list_question_bank_chapters(
    school_id: str = Query(...),
    teacher_id: str = Query(...),
    user: UserContext = Depends(require_faculty),
) -> QuestionBankListResponse:
    """Return every question bank the current teacher has saved."""
    chapters = await question_bank_ai_service.list_chapters(
        user=user, school_id=school_id, teacher_id=teacher_id
    )
    return QuestionBankListResponse(chapters=chapters)


@router.delete("/chapter", response_model=DeleteQuestionBankResponse)
async def delete_question_bank_chapter(
    school_id: str = Query(...),
    teacher_id: str = Query(...),
    grade_id: str = Query(...),
    subject_id: str = Query(...),
    chapter_id: str = Query(...),
    user: UserContext = Depends(require_faculty),
) -> DeleteQuestionBankResponse:
    """Remove every S3 object belonging to a question bank chapter."""
    identity = QuestionBankIdentity(
        school_id=school_id,
        teacher_id=teacher_id,
        grade_id=grade_id,
        subject_id=subject_id,
        chapter_id=chapter_id,
    )
    deleted = await question_bank_ai_service.delete_chapter(
        user=user, identity=identity
    )
    return DeleteQuestionBankResponse(deleted_keys=deleted)
