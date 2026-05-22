"""Lesson Plan S3 orchestration service.

This service is intentionally **storage + orchestration only**. No AI
generation runs in this repo.

* :py:meth:`upload_resources` — write uploaded files + ``metadata.json``
  to S3 under the canonical scope. Powers the **Save** button.
* :py:meth:`generate` — load ``metadata.json`` from S3, dispatch to the
  external AI microservice (async HTTP POST), then read and return the
  ``output/lesson_plan.json`` the service wrote to S3.
* :py:meth:`get_output` — read ``output/lesson_plan.json`` from S3
  without calling the AI service. Used by the standalone result page.
"""
from __future__ import annotations

from typing import List, Tuple

import httpx
from fastapi import HTTPException, UploadFile, status

from app.core.config import settings
from app.core.dependencies import UserContext
from app.core.logger import logger
from app.schemas.lesson_plan import (
    ChapterIdentity,
    ChapterListItem,
    GeneratedLessonPlan,
    LessonPlanMetadata,
    LessonPlanOutputResponse,
    UploadResponse,
)
from app.services.storage.lesson_plan_s3 import (
    ChapterScope,
    lesson_plan_s3,
    unique_input_keys,
    validate_upload,
)


def _scope(identity: ChapterIdentity) -> ChapterScope:
    return ChapterScope(
        school_id=identity.school_id,
        teacher_id=identity.teacher_id,
        grade_id=identity.grade_id,
        subject_id=identity.subject_id,
        chapter_id=identity.chapter_id,
    ).validate()


class LessonPlanAIService:
    # ── Save ──────────────────────────────────────────────────────────
    async def upload_resources(
        self,
        *,
        user: UserContext,
        identity: ChapterIdentity,
        files: List[UploadFile],
        number_of_classes: int,
        additional_info: str,
        chapter_name: str | None = None,
        grade_label: str | None = None,
        section_label: str | None = None,
        subject_label: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        session_dates: List[str] | None = None,
        color_hue: int | None = None,
    ) -> UploadResponse:
        if not files:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one file is required.",
            )

        try:
            scope = _scope(identity)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            )

        # Read + validate every file before any S3 round-trip so we can
        # fail fast and dedup filenames in-batch.
        prepared: List[Tuple[str, str, bytes]] = []
        for upload in files:
            filename = upload.filename or "file"
            try:
                data = await upload.read()
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Could not read {filename}: {exc}",
                )
            try:
                validate_upload(
                    filename,
                    upload.content_type or "application/octet-stream",
                    len(data),
                )
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
                )
            prepared.append(
                (filename, upload.content_type or "application/octet-stream", data)
            )

        keys = unique_input_keys(scope, (name for name, _, _ in prepared))

        resource_paths: List[str] = []
        for key, (filename, content_type, data) in zip(keys, prepared):
            try:
                await lesson_plan_s3.upload_resource_at_key(
                    key=key, content_type=content_type, data=data
                )
            except Exception as exc:  # noqa: BLE001
                logger.exception(
                    "S3 upload failed scope=%s file=%s: %s",
                    scope.base_prefix,
                    filename,
                    exc,
                )
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Could not save the uploaded file.",
                )
            resource_paths.append(key)

        metadata = LessonPlanMetadata(
            school_id=identity.school_id,
            teacher_id=identity.teacher_id,
            grade_id=identity.grade_id,
            subject_id=identity.subject_id,
            chapter_id=identity.chapter_id,
            number_of_classes=number_of_classes,
            additional_info=additional_info,
            resources=resource_paths,
            chapter_name=chapter_name,
            grade_label=grade_label,
            section_label=section_label,
            subject_label=subject_label,
            start_date=start_date,
            end_date=end_date,
            session_dates=session_dates or [],
            color_hue=color_hue,
        )
        try:
            metadata_path = await lesson_plan_s3.write_metadata(
                scope=scope, metadata=metadata.model_dump()
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("S3 metadata write failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not save the chapter details.",
            )

        logger.info(
            "Lesson plan SAVE complete user=%s scope=%s files=%d",
            user.id,
            scope.base_prefix,
            len(resource_paths),
        )
        return UploadResponse(
            resources=resource_paths, metadata_path=metadata_path
        )

    # ── Generate: call AI service → read S3 output ───────────────────
    async def generate(
        self,
        *,
        user: UserContext,
        identity: ChapterIdentity,
    ) -> LessonPlanOutputResponse:
        """Orchestrate lesson plan generation.

        1. Load ``metadata.json`` from S3.
        2. POST it to the external AI microservice.
        3. The microservice reads the uploaded files, generates the plan,
           saves ``output/lesson_plan.json`` to S3, and returns.
        4. Read ``output/lesson_plan.json`` from S3 and return it.
        """
        try:
            scope = _scope(identity)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            )

        # 1. Load metadata from S3
        try:
            metadata_dict = await lesson_plan_s3.read_metadata(scope=scope)
        except FileNotFoundError:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    "This chapter hasn't been saved yet. "
                    "Save the chapter before generating."
                ),
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("S3 metadata read failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not read the chapter details.",
            )

        # 2. Call external AI microservice
        ai_url = settings.LESSON_PLAN_AI_SERVICE_URL
        if not ai_url:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "LESSON_PLAN_AI_SERVICE_URL is not configured. "
                    "Set it in your environment to enable AI generation."
                ),
            )

        ai_payload = {
            **metadata_dict,
            "output_key": scope.output_key,
            "bucket": settings.AWS_S3_BUCKET or "",
        }
        logger.info(
            "Lesson plan GENERATE dispatch user=%s scope=%s ai_url=%s",
            user.id,
            scope.base_prefix,
            ai_url,
        )
        try:
            async with httpx.AsyncClient(
                timeout=settings.LESSON_PLAN_AI_SERVICE_TIMEOUT
            ) as client:
                response = await client.post(ai_url, json=ai_payload)
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.error(
                "AI service HTTP error %s for scope=%s: %s",
                exc.response.status_code,
                scope.base_prefix,
                exc.response.text[:500],
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    f"External AI service returned {exc.response.status_code}. "
                    "Check the microservice logs."
                ),
            )
        except httpx.TimeoutException:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail=(
                    f"External AI service did not respond within "
                    f"{settings.LESSON_PLAN_AI_SERVICE_TIMEOUT:.0f}s."
                ),
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("AI service call failed scope=%s: %s", scope.base_prefix, exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Could not reach external AI service: {exc}",
            )

        # 3. Read output/lesson_plan.json the AI service wrote to S3
        try:
            payload = await lesson_plan_s3.read_output(scope=scope)
        except FileNotFoundError:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    "Generation finished but the lesson plan output is missing. "
                    "Please try again."
                ),
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("S3 output read failed after generation: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not read the generated lesson plan.",
            )

        # 4. Parse and return
        return self._parse_output_payload(payload, identity, scope)

    # ── Generate (read-only from S3) ──────────────────────────────────
    async def get_output(
        self,
        *,
        user: UserContext,
        identity: ChapterIdentity,
    ) -> LessonPlanOutputResponse:
        """Fetch the lesson plan JSON the external microservice wrote.

        The external service is responsible for placing
        ``output/lesson_plan.json`` under the chapter's scope; this
        method only re-hydrates it.
        """
        try:
            scope = _scope(identity)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            )

        try:
            payload = await lesson_plan_s3.read_output(scope=scope)
        except FileNotFoundError:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    "This chapter hasn't been generated yet. "
                    "Run Generate to create the lesson plan."
                ),
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("S3 output read failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not read the generated lesson plan.",
            )

        result = self._parse_output_payload(payload, identity, scope)
        logger.info(
            "Lesson plan FETCH ok user=%s scope=%s",
            user.id,
            scope.base_prefix,
        )
        return result


    # ── Shared helper ─────────────────────────────────────────────────
    def _parse_output_payload(
        self,
        payload: dict,
        identity: ChapterIdentity,
        scope: ChapterScope,
    ) -> LessonPlanOutputResponse:
        """Accept either a bare lesson plan or an envelope from S3."""
        if isinstance(payload, dict) and "lesson_plan" in payload:
            lp_dict = payload.get("lesson_plan") or {}
            meta_dict = payload.get("metadata") or identity.model_dump()
            provider_meta = payload.get("provider_meta", {})
        else:
            lp_dict = payload
            meta_dict = identity.model_dump()
            provider_meta = {}

        try:
            metadata = LessonPlanMetadata.model_validate(
                {
                    **identity.model_dump(),
                    **{
                        k: v
                        for k, v in meta_dict.items()
                        if k in LessonPlanMetadata.model_fields
                    },
                }
            )
            lesson_plan = GeneratedLessonPlan.model_validate(lp_dict)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Stored lesson plan is malformed: {exc}",
            )

        return LessonPlanOutputResponse(
            output_path=scope.output_key,
            metadata=metadata,
            lesson_plan=lesson_plan,
            provider_meta=provider_meta,
        )

    # ── List chapters for a teacher ───────────────────────────────────
    async def list_chapters(
        self,
        *,
        user: UserContext,
        school_id: str,
        teacher_id: str,
    ) -> List[ChapterListItem]:
        """Enumerate every chapter saved under this teacher's S3 prefix.

        Walks every key under ``lesson-plan/{school_id}/{teacher_id}/``,
        groups by chapter prefix, and reads ``metadata.json`` (required)
        and ``output/lesson_plan.json`` (optional) for each one.
        """
        try:
            prefix = lesson_plan_s3.teacher_prefix(school_id, teacher_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            )

        try:
            infos = await lesson_plan_s3.list_keys(prefix)
        except Exception as exc:  # noqa: BLE001
            logger.exception("S3 list failed prefix=%s: %s", prefix, exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not load your lesson plans.",
            )

        # Each key looks like:
        #   lesson-plan/{school}/{teacher}/{grade}/{subject}/{chapter}/<...>
        # Group by the first six path segments.
        groups: dict[tuple[str, ...], dict] = {}
        for info in infos:
            parts = info.key.split("/")
            if len(parts) < 7:
                # Not under a complete chapter scope yet — skip.
                continue
            chapter_key = tuple(parts[:6])  # lesson-plan/.../chapter
            bucket = groups.setdefault(
                chapter_key,
                {
                    "has_metadata": False,
                    "has_output": False,
                    "last_modified": None,
                },
            )
            tail = "/".join(parts[6:])
            if tail.startswith("metadata/"):
                bucket["has_metadata"] = True
            elif tail.startswith("output/"):
                bucket["has_output"] = True
            if info.last_modified and (
                bucket["last_modified"] is None
                or info.last_modified > bucket["last_modified"]
            ):
                bucket["last_modified"] = info.last_modified

        chapters: List[ChapterListItem] = []
        for parts, flags in groups.items():
            if not flags["has_metadata"]:
                continue
            _, school, teacher, grade, subject, chapter = parts
            identity = ChapterIdentity(
                school_id=school,
                teacher_id=teacher,
                grade_id=grade,
                subject_id=subject,
                chapter_id=chapter,
            )
            try:
                scope = _scope(identity)
                meta_dict = await lesson_plan_s3.read_metadata(scope=scope)
            except FileNotFoundError:
                continue
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Skipping chapter due to metadata read error scope=%s: %s",
                    "/".join(parts),
                    exc,
                )
                continue
            try:
                metadata = LessonPlanMetadata.model_validate(meta_dict)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Skipping chapter due to bad metadata scope=%s: %s",
                    "/".join(parts),
                    exc,
                )
                continue

            lesson_plan = None
            if flags["has_output"]:
                try:
                    payload = await lesson_plan_s3.read_output(scope=scope)
                    if isinstance(payload, dict) and "lesson_plan" in payload:
                        payload = payload.get("lesson_plan") or {}
                    lesson_plan = GeneratedLessonPlan.model_validate(payload)
                except Exception as exc:  # noqa: BLE001
                    logger.warning(
                        "Could not parse output for chapter scope=%s: %s",
                        scope.base_prefix,
                        exc,
                    )
                    lesson_plan = None

            chapters.append(
                ChapterListItem(
                    metadata=metadata,
                    lesson_plan=lesson_plan,
                    has_output=lesson_plan is not None,
                    last_modified=flags["last_modified"],
                )
            )

        # Sort by start_date if available, else by last_modified descending.
        def _sort_key(c: ChapterListItem) -> tuple:
            return (
                c.metadata.start_date or "",
                c.last_modified or "",
            )

        chapters.sort(key=_sort_key)
        logger.info(
            "Lesson plan LIST ok user=%s prefix=%s chapters=%d",
            user.id,
            prefix,
            len(chapters),
        )
        return chapters

    # ── Delete a chapter ──────────────────────────────────────────────
    async def delete_chapter(
        self,
        *,
        user: UserContext,
        identity: ChapterIdentity,
    ) -> int:
        """Remove the entire S3 prefix for a chapter."""
        try:
            scope = _scope(identity)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            )

        try:
            removed = await lesson_plan_s3.delete_prefix(
                f"{scope.base_prefix}/"
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("S3 delete failed scope=%s: %s", scope.base_prefix, exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not delete the chapter.",
            )

        if removed == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chapter not found.",
            )
        logger.info(
            "Lesson plan DELETE ok user=%s scope=%s removed=%d",
            user.id,
            scope.base_prefix,
            removed,
        )
        return removed


lesson_plan_ai_service = LessonPlanAIService()
