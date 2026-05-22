"""Lesson Plan HTTP routes.

Three primary surfaces drive the current Lesson Plan workflow:

* ``POST /api/lesson-plan/upload``     — **Save** uploaded files + metadata
  to S3.
* ``POST /api/lesson-plan/generate``   — load metadata from S3, call the
  external AI microservice, and return the generated lesson plan.
* ``GET  /api/lesson-plan/output``     — read ``output/lesson_plan.json``
  that the external microservice wrote to S3 (use for standalone viewing).

Supporting endpoints used by the dashboard:

* ``GET    /api/lesson-plan/chapters`` — list every chapter saved for a teacher.
* ``DELETE /api/lesson-plan/chapter``  — delete every S3 object for a chapter.

This backend NEVER generates lesson plans locally.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from typing import List, Optional

from app.core.dependencies import require_faculty, UserContext
from app.schemas.lesson_plan import (
    ChapterIdentity,
    ChapterListResponse,
    DeleteChapterResponse,
    LessonPlanOutputResponse,
    UploadResponse,
)
from app.services.lesson_plan import lesson_plan_ai_service

router = APIRouter(prefix="/api/lesson-plan", tags=["Lesson Plan"])


# ─── Save: upload files + metadata to S3 ──────────────────────────────────────
@router.post("/upload", response_model=UploadResponse)
async def upload_resources(
    school_id: str = Form(...),
    teacher_id: str = Form(...),
    grade_id: str = Form(...),
    subject_id: str = Form(...),
    chapter_id: str = Form(...),
    number_of_classes: int = Form(12),
    additional_info: str = Form(""),
    chapter_name: Optional[str] = Form(None),
    grade_label: Optional[str] = Form(None),
    section_label: Optional[str] = Form(None),
    subject_label: Optional[str] = Form(None),
    start_date: Optional[str] = Form(None),
    end_date: Optional[str] = Form(None),
    session_dates: Optional[str] = Form(None),  # JSON-encoded list of ISO dates
    color_hue: Optional[int] = Form(None),
    files: List[UploadFile] = File(...),
    user: UserContext = Depends(require_faculty),
) -> UploadResponse:
    """Persist every uploaded file + ``metadata.json`` under the
    canonical S3 scope.

    No AI is invoked. This is the **Save** action.
    """
    identity = ChapterIdentity(
        school_id=school_id,
        teacher_id=teacher_id,
        grade_id=grade_id,
        subject_id=subject_id,
        chapter_id=chapter_id,
    )

    # ``session_dates`` arrives as a JSON-encoded list (multipart form fields
    # can't carry arrays natively). Decode and validate the shape.
    parsed_session_dates: List[str] | None = None
    if session_dates:
        import json
        try:
            parsed = json.loads(session_dates)
            if isinstance(parsed, list):
                parsed_session_dates = [str(x) for x in parsed]
        except json.JSONDecodeError:
            parsed_session_dates = None

    return await lesson_plan_ai_service.upload_resources(
        user=user,
        identity=identity,
        files=files,
        number_of_classes=number_of_classes,
        additional_info=additional_info,
        chapter_name=chapter_name,
        grade_label=grade_label,
        section_label=section_label,
        subject_label=subject_label,
        start_date=start_date,
        end_date=end_date,
        session_dates=parsed_session_dates,
        color_hue=color_hue,
    )


# ─── Generate: call external AI service, then return the output ───────────────
@router.post("/generate", response_model=LessonPlanOutputResponse)
async def generate_lesson_plan(
    identity: ChapterIdentity,
    user: UserContext = Depends(require_faculty),
) -> LessonPlanOutputResponse:
    """Load ``metadata.json`` from S3, dispatch to the external AI
    microservice, and return the generated lesson plan once ready.

    The AI microservice reads the uploaded files from S3, generates the
    plan, saves ``output/lesson_plan.json`` to S3, and returns only when
    done. This endpoint then reads that file and returns it to the client.

    503 if ``LESSON_PLAN_AI_SERVICE_URL`` is not configured.
    404 if metadata has not been uploaded yet.
    502 if the AI service call fails.
    """
    return await lesson_plan_ai_service.generate(user=user, identity=identity)


# ─── Output: read the JSON the microservice wrote to S3 ───────────────────────
@router.get("/output", response_model=LessonPlanOutputResponse)
async def fetch_lesson_plan_output(
    school_id: str = Query(...),
    teacher_id: str = Query(...),
    grade_id: str = Query(...),
    subject_id: str = Query(...),
    chapter_id: str = Query(...),
    user: UserContext = Depends(require_faculty),
) -> LessonPlanOutputResponse:
    """Return ``output/lesson_plan.json`` from S3 for the given chapter.

    404 if the external microservice has not produced output yet.
    """
    identity = ChapterIdentity(
        school_id=school_id,
        teacher_id=teacher_id,
        grade_id=grade_id,
        subject_id=subject_id,
        chapter_id=chapter_id,
    )
    return await lesson_plan_ai_service.get_output(user=user, identity=identity)


# ─── List every chapter for this teacher ──────────────────────────────────────
@router.get("/chapters", response_model=ChapterListResponse)
async def list_chapters(
    school_id: str = Query(...),
    teacher_id: str = Query(...),
    user: UserContext = Depends(require_faculty),
) -> ChapterListResponse:
    """Return every chapter the current teacher has saved.

    The result includes the metadata for each chapter and, when present,
    the generated lesson plan. Chapters without a generated output are
    still included so the dashboard can show "pending generation" states.
    """
    chapters = await lesson_plan_ai_service.list_chapters(
        user=user, school_id=school_id, teacher_id=teacher_id
    )
    return ChapterListResponse(chapters=chapters)


# ─── Delete one chapter (all S3 objects under its prefix) ────────────────────
@router.delete("/chapter", response_model=DeleteChapterResponse)
async def delete_chapter(
    school_id: str = Query(...),
    teacher_id: str = Query(...),
    grade_id: str = Query(...),
    subject_id: str = Query(...),
    chapter_id: str = Query(...),
    user: UserContext = Depends(require_faculty),
) -> DeleteChapterResponse:
    """Remove every S3 object belonging to a chapter."""
    identity = ChapterIdentity(
        school_id=school_id,
        teacher_id=teacher_id,
        grade_id=grade_id,
        subject_id=subject_id,
        chapter_id=chapter_id,
    )
    deleted = await lesson_plan_ai_service.delete_chapter(
        user=user, identity=identity
    )
    return DeleteChapterResponse(deleted_keys=deleted)
