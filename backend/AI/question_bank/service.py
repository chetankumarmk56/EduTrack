"""Question Bank S3 orchestration service.

Storage + orchestration. Generation runs **in-process** via
:mod:`AI.question_bank.generator` (an optional remote offload is kept as a
microservice-ready seam — see ``_generate_via_http``). This service:

* :py:meth:`upload_resources` — write uploaded files + ``metadata.json``
  to S3 under the canonical scope.
* :py:meth:`generate` — load ``metadata.json`` from S3, generate the
  question bank (in-process by default, or via the remote AI service when
  ``QUESTION_BANK_AI_SERVICE_URL`` is set), write
  ``output/question_bank.json`` to S3, and return it.
* :py:meth:`get_output` — read ``output/question_bank.json`` from S3
  without regenerating.
"""
from __future__ import annotations

import asyncio
import json
from typing import List, Optional, Tuple

import httpx
from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import UserContext
from app.core.logger import logger
from AI.config import ai_settings
from AI.question_bank.generator import generate_question_bank
from AI.question_bank.schemas import (
    DiagramUploadResponse,
    GeneratedQuestionBank,
    QuestionBankIdentity,
    QuestionBankListItem,
    QuestionBankMetadata,
    QuestionBankMetadataUpdate,
    QuestionBankOutputResponse,
    QuestionBankUploadResponse,
)
from AI.question_bank.storage import (
    QuestionBankScope,
    question_bank_s3,
    unique_input_keys,
    validate_upload,
)
from app.services.uploaded_file import uploaded_file_service  # "My Files" library (host app)


def _scope(identity: QuestionBankIdentity) -> QuestionBankScope:
    return QuestionBankScope(
        school_id=identity.school_id,
        teacher_id=identity.teacher_id,
        grade_id=identity.grade_id,
        subject_id=identity.subject_id,
        chapter_id=identity.chapter_id,
    ).validate()


def _build_display_name(metadata: QuestionBankMetadata) -> str:
    """Compose ``Subject - Grade - Chapter`` from the stored metadata.

    Falls back to IDs when the human-readable labels are missing so the
    My Files entry never ends up nameless.
    """
    subject = (metadata.subject or metadata.subject_id or "Subject").strip()
    grade = (metadata.grade or metadata.grade_id or "Grade").strip()
    chapter = (metadata.chapter or metadata.chapter_id or "Chapter").strip()
    parts = [p for p in (subject, grade, chapter) if p]
    return " - ".join(parts) if parts else "Question Bank"


class QuestionBankAIService:
    # ── Save ──────────────────────────────────────────────────────────
    async def upload_resources(
        self,
        *,
        user: UserContext,
        identity: QuestionBankIdentity,
        files: List[UploadFile],
        subject: str,
        grade: str,
        chapter: str,
        number_of_questions: int,
        total_marks: int,
        focus_topic: str | None = None,
        focus_percentage: int | None = None,
        focus_questions: int | None = None,
        language: str = "English",
        extra_instructions: str = "",
    ) -> QuestionBankUploadResponse:
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
                await question_bank_s3.upload_resource_at_key(
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

        # Build the metadata envelope. Pydantic enforces the flat
        # contract; the model validator nulls focus_percentage whenever
        # focus_questions is supplied so the microservice always sees a
        # single source of truth.
        try:
            metadata = QuestionBankMetadata(
                school_id=identity.school_id,
                teacher_id=identity.teacher_id,
                grade_id=identity.grade_id,
                subject_id=identity.subject_id,
                chapter_id=identity.chapter_id,
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
                resources=resource_paths,
            )
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid question bank metadata: {exc}",
            )

        try:
            metadata_path = await question_bank_s3.write_metadata(
                scope=scope, metadata=metadata.model_dump()
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("S3 metadata write failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not save the question bank details.",
            )

        logger.info(
            "Question bank SAVE complete user=%s scope=%s files=%d",
            user.id,
            scope.base_prefix,
            len(resource_paths),
        )
        return QuestionBankUploadResponse(
            resources=resource_paths, metadata_path=metadata_path
        )

    # ── Generate: call AI service → read S3 output ───────────────────
    async def generate(
        self,
        *,
        user: UserContext,
        identity: QuestionBankIdentity,
        db: Optional[AsyncSession] = None,
    ) -> QuestionBankOutputResponse:
        """Orchestrate question bank generation.

        1. Load ``metadata.json`` from S3.
        2. POST to the external AI microservice with ``type=question_bank``.
        3. The microservice reads input files, generates questions, saves
           ``output/question_bank.json`` to S3, and returns.
        4. Read ``output/question_bank.json`` from S3 and return it.
        5. When ``db`` is supplied, register a "My Files" row pointing at
           the generated JSON so the teacher can re-open it later. The
           registration is best-effort: a failure here is logged but does
           not abort the response.
        """
        try:
            scope = _scope(identity)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            )

        # 1. Load metadata from S3
        try:
            metadata_dict = await question_bank_s3.read_metadata(scope=scope)
        except FileNotFoundError:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    "This question bank hasn't been saved yet. "
                    "Save the inputs before generating."
                ),
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("S3 metadata read failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not read the question bank details.",
            )

        # 2. Confirm at least one source document is attached.
        resources = metadata_dict.get("resources") or []
        if not resources:
            # The save step always writes at least one resource; if we get
            # here the metadata is corrupt or pre-dates the current contract.
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "No source documents are attached to this question bank. "
                    "Re-upload the chapter PDF and try again."
                ),
            )

        # 3. Generate.
        #
        # Default: in-process via :mod:`AI.question_bank.generator` (no
        # external dependency). Microservice-ready seam: when
        # QUESTION_BANK_AI_SERVICE_URL (or LESSON_PLAN_AI_SERVICE_URL) is
        # set, generation is offloaded over HTTP to a remote copy of this
        # package. Both paths return the same flat output payload, which is
        # also written to ``output/question_bank.json`` in S3.
        ai_url = ai_settings.question_bank_service_url
        if ai_url:
            payload = await self._generate_via_http(
                ai_url=ai_url, scope=scope, resources=resources, user=user
            )
        else:
            payload = await self._generate_in_process(
                scope=scope,
                metadata_dict=metadata_dict,
                resources=resources,
                user=user,
            )

        result = self._parse_output_payload(
            payload, identity, scope, meta_dict=metadata_dict
        )

        # 5. Register this generation in My Files (best-effort).
        if db is not None:
            try:
                await self._register_in_my_files(
                    db=db,
                    user=user,
                    metadata=result.metadata,
                    output_key=scope.output_key,
                    payload=payload,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "My Files registration failed scope=%s: %s",
                    scope.base_prefix,
                    exc,
                )

        return result

    # ── Generation paths ──────────────────────────────────────────────
    async def _generate_in_process(
        self,
        *,
        scope: QuestionBankScope,
        metadata_dict: dict,
        resources: List[str],
        user: UserContext,
    ) -> dict:
        """Generate the question bank locally and persist it to S3.

        Reads the first uploaded PDF from storage, runs the OpenAI call on
        a worker thread (the OpenAI SDK call is blocking), writes the flat
        output JSON to ``output/question_bank.json``, and returns it so the
        caller can reuse it inline (no extra S3 read).
        """
        if not ai_settings.question_bank_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "OPENAI_API_KEY (or QUESTION_BANK_OPENAI_API_KEY) is not "
                    "configured. Set it in the backend environment to enable "
                    "Question Bank generation."
                ),
            )

        try:
            pdf_bytes = await question_bank_s3.read_object(resources[0])
        except FileNotFoundError:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "The uploaded source document is missing from storage. "
                    "Re-upload the chapter PDF and try again."
                ),
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "QB read source failed scope=%s key=%s: %s",
                scope.base_prefix,
                resources[0],
                exc,
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not read the uploaded document.",
            )

        source = {"pdf_key": resources[0], "metadata_key": scope.metadata_key}
        try:
            payload = await asyncio.to_thread(
                generate_question_bank,
                metadata_dict=metadata_dict,
                pdf_bytes=pdf_bytes,
                source=source,
            )
        except HTTPException:
            raise
        except RuntimeError as exc:
            # Empty/invalid model output, or OpenAI misconfiguration.
            logger.exception(
                "In-process QB generation failed scope=%s: %s",
                scope.base_prefix,
                exc,
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Question generation failed: {exc}",
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "In-process QB generation crashed scope=%s: %s",
                scope.base_prefix,
                exc,
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Question generation failed. Please try again.",
            )

        # Persist the output at the canonical key so GET /output and the
        # My Files entry resolve to the same artifact the microservice wrote.
        try:
            await question_bank_s3.write_output(scope=scope, payload=payload)
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "S3 output write failed after in-process generation: %s", exc
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not save the generated question bank.",
            )

        logger.info(
            "Question bank GENERATE in-process user=%s scope=%s questions=%d",
            user.id,
            scope.base_prefix,
            len(payload.get("questions") or []),
        )
        return payload

    async def _generate_via_http(
        self,
        *,
        ai_url: str,
        scope: QuestionBankScope,
        resources: List[str],
        user: UserContext,
    ) -> dict:
        """Offload generation to a remote copy of this package over HTTP.

        Kept as the microservice-ready seam: set
        ``QUESTION_BANK_AI_SERVICE_URL`` (or ``LESSON_PLAN_AI_SERVICE_URL``)
        to route generation to a standalone service instead of running it
        in-process. The remote service reads the PDF + metadata from S3,
        writes ``output/question_bank.json`` back, and returns it inline.
        """
        ai_timeout = ai_settings.question_bank_service_timeout

        # The remote service has a strict request schema
        # (additionalProperties=false): pdf_bucket, pdf_key, metadata_key
        # required; metadata_bucket, output_bucket optional.
        bucket = ai_settings.s3_bucket or ""
        if not bucket:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "AWS_S3_BUCKET is not configured. The remote AI service "
                    "needs an S3 bucket to read the uploaded PDF and metadata."
                ),
            )

        ai_payload = {
            "pdf_bucket": bucket,
            "pdf_key": resources[0],
            "metadata_bucket": bucket,
            "metadata_key": scope.metadata_key,
            "output_bucket": bucket,
        }
        logger.info(
            "Question bank GENERATE dispatch user=%s scope=%s ai_url=%s "
            "pdf_key=%s metadata_key=%s resources=%d",
            user.id,
            scope.base_prefix,
            ai_url,
            ai_payload["pdf_key"],
            ai_payload["metadata_key"],
            len(resources),
        )
        try:
            async with httpx.AsyncClient(timeout=ai_timeout) as client:
                response = await client.post(ai_url, json=ai_payload)
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            body_preview = exc.response.text[:1000] if exc.response is not None else ""
            logger.error(
                "AI service HTTP error %s for scope=%s payload=%s body=%s",
                exc.response.status_code,
                scope.base_prefix,
                ai_payload,
                body_preview,
            )
            detail = (
                f"External AI service returned {exc.response.status_code}. "
                f"{body_preview}"
            ).strip()
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=detail,
            )
        except httpx.TimeoutException:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail=(
                    f"External AI service did not respond within {ai_timeout:.0f}s."
                ),
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "AI service call failed scope=%s: %s", scope.base_prefix, exc
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Could not reach external AI service: {exc}",
            )

        # Prefer the inline payload (one less S3 round trip); fall back to
        # reading the file the remote service wrote.
        try:
            response_json = response.json()
        except Exception:  # noqa: BLE001
            response_json = {}

        inline_qb = (
            response_json.get("question_bank")
            if isinstance(response_json, dict)
            else None
        )
        if inline_qb:
            logger.info(
                "Question bank GENERATE inline payload user=%s scope=%s output_key=%s",
                user.id,
                scope.base_prefix,
                response_json.get("output_key") or scope.output_key,
            )
            return inline_qb

        try:
            return await question_bank_s3.read_output(scope=scope)
        except FileNotFoundError:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    "Generation finished but the question bank output is missing. "
                    "Please try again."
                ),
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("S3 output read failed after generation: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not read the generated question bank.",
            )

    async def _register_in_my_files(
        self,
        *,
        db: AsyncSession,
        user: UserContext,
        metadata: QuestionBankMetadata,
        output_key: str,
        payload: dict,
    ) -> None:
        """Create a My Files row for the freshly generated question bank.

        Resolves the teacher_id from the user context (admins are skipped
        — they don't own a file library). Uses
        :py:meth:`UploadedFileService.register_generated_artifact` so the
        version-on-duplicate logic lives in one place.
        """
        try:
            teacher_id = await uploaded_file_service.resolve_teacher_for_user(
                db, user
            )
        except HTTPException as exc:
            # Admin / super_admin users have no teacher library. Skip
            # silently — they can still view the JSON via the result page.
            logger.info(
                "Skipping My Files registration (no teacher library): %s",
                exc.detail,
            )
            return

        base_name = _build_display_name(metadata)
        # Approximate file size from the serialized payload — the exact
        # S3 ContentLength isn't worth a HEAD round-trip just for display.
        try:
            file_size = len(
                json.dumps(payload, ensure_ascii=False).encode("utf-8")
            )
        except Exception:  # noqa: BLE001
            file_size = 0

        row = await uploaded_file_service.register_generated_artifact(
            db,
            teacher_id=teacher_id,
            institution_id=user.institution_id,
            file_type="question_bank",
            base_name=base_name,
            storage_key=output_key,
            storage_backend="s3",
            file_size=file_size,
            mime_type="application/json",
            subject=metadata.subject or metadata.subject_id,
            category="question_bank",
            tags=["question-bank"],
            source_school_id=metadata.school_id,
            source_teacher_id=metadata.teacher_id,
            source_grade_id=metadata.grade_id,
            source_subject_id=metadata.subject_id,
            source_chapter_id=metadata.chapter_id,
        )
        await db.commit()
        logger.info(
            "My Files registered question_bank row=%s name=%s v%d",
            row.id,
            row.display_name,
            row.version,
        )

    # ── Output (read-only from S3) ────────────────────────────────────
    async def get_output(
        self,
        *,
        user: UserContext,
        identity: QuestionBankIdentity,
    ) -> QuestionBankOutputResponse:
        try:
            scope = _scope(identity)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            )

        try:
            payload = await question_bank_s3.read_output(scope=scope)
        except FileNotFoundError:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    "This question bank hasn't been generated yet. "
                    "Run Generate to create it."
                ),
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("S3 output read failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not read the generated question bank.",
            )

        # Metadata.json is the authoritative source for the contract
        # fields (subject/grade/chapter/number_of_questions/total_marks).
        # The output JSON only carries the generated questions.
        try:
            meta_dict = await question_bank_s3.read_metadata(scope=scope)
        except FileNotFoundError:
            meta_dict = {}
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not load metadata while reading output: %s", exc)
            meta_dict = {}

        result = self._parse_output_payload(
            payload, identity, scope, meta_dict=meta_dict
        )
        logger.info(
            "Question bank FETCH ok user=%s scope=%s",
            user.id,
            scope.base_prefix,
        )
        return result

    async def save_output(
        self,
        *,
        user: UserContext,
        identity: QuestionBankIdentity,
        question_bank: GeneratedQuestionBank,
        metadata_patch: QuestionBankMetadataUpdate | None = None,
    ) -> QuestionBankOutputResponse:
        """Persist a teacher-edited question bank back to S3.

        Writes the canonical ``output/question_bank.json`` and, when
        ``metadata_patch`` carries any non-null field, also rewrites
        ``metadata/metadata.json`` so the header edits the teacher made
        on the Result page survive across reloads.

        The merged metadata is validated through
        :class:`QuestionBankMetadata`, so the focus_topic /
        focus_questions / focus_percentage rules enforced at save-time
        also apply to header edits.
        """
        try:
            scope = _scope(identity)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            )

        payload = question_bank.model_dump(exclude_none=False)
        # Recompute totals from the edited questions so the header stats
        # stay in sync with what's actually saved.
        questions = payload.get("questions") or []
        payload["number_of_questions"] = len(questions)
        payload["total_marks"] = sum(
            int(q.get("marks") or 0) for q in questions if isinstance(q, dict)
        )

        # Load the existing metadata so we can patch it before any
        # write. We don't fail the whole save if metadata is missing —
        # the teacher might have deleted it manually; just skip the
        # metadata write in that case.
        try:
            stored_meta = await question_bank_s3.read_metadata(scope=scope)
        except FileNotFoundError:
            stored_meta = {}
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not load metadata while saving output: %s", exc)
            stored_meta = {}

        merged_meta = dict(stored_meta)
        if metadata_patch is not None and stored_meta:
            patch = metadata_patch.model_dump(exclude_unset=True)
            # Treat empty-string focus_topic as a clear, not a no-op, so
            # the teacher can fully remove the focus from the bank.
            for key, value in patch.items():
                if key == "focus_topic" and isinstance(value, str) and not value.strip():
                    merged_meta[key] = None
                else:
                    merged_meta[key] = value
            try:
                validated = QuestionBankMetadata.model_validate(merged_meta)
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid metadata patch: {exc}",
                )
            merged_meta = validated.model_dump()
            try:
                await question_bank_s3.write_metadata(
                    scope=scope, metadata=merged_meta
                )
            except Exception as exc:  # noqa: BLE001
                logger.exception("S3 metadata write failed: %s", exc)
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Could not save the question bank details.",
                )

        try:
            await question_bank_s3.write_output(scope=scope, payload=payload)
        except Exception as exc:  # noqa: BLE001
            logger.exception("S3 output write failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not save the question bank.",
            )

        logger.info(
            "Question bank SAVE ok user=%s scope=%s questions=%d meta_patch=%s",
            user.id,
            scope.base_prefix,
            len(questions),
            metadata_patch is not None and metadata_patch.model_fields_set,
        )
        return self._parse_output_payload(
            payload, identity, scope, meta_dict=merged_meta
        )

    # ── Diagram images (per-question) ─────────────────────────────────
    async def upload_diagram(
        self,
        *,
        user: UserContext,
        identity: QuestionBankIdentity,
        question_id: str | None,
        file: UploadFile,
    ) -> DiagramUploadResponse:
        """Persist a teacher-uploaded diagram for one question.

        The frontend posts here once per upload; it then stores the
        returned ``key`` on the matching question and calls ``save_output``
        to make the attachment permanent.
        """
        try:
            scope = _scope(identity)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            )

        if not file or not file.filename:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No image file provided.",
            )

        try:
            data = await file.read()
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Could not read uploaded diagram: {exc}",
            )

        # Namespace the stored object with the question_id (when given)
        # so a teacher uploading the same image name for two questions
        # doesn't accidentally overwrite their own earlier upload.
        prefix = (question_id or "diagram").strip() or "diagram"
        import time
        stamped = f"{prefix}-{int(time.time() * 1000)}-{file.filename}"

        try:
            key, mime = await question_bank_s3.upload_diagram(
                scope=scope,
                filename=stamped,
                content_type=file.content_type or "application/octet-stream",
                data=data,
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "S3 diagram upload failed scope=%s: %s", scope.base_prefix, exc
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not save the diagram image.",
            )

        logger.info(
            "Diagram upload ok user=%s scope=%s key=%s size=%d",
            user.id, scope.base_prefix, key, len(data),
        )
        return DiagramUploadResponse(
            key=key,
            question_id=question_id,
            content_type=mime,
            size_bytes=len(data),
        )

    async def read_diagram(
        self,
        *,
        user: UserContext,
        identity: QuestionBankIdentity,
        key: str,
    ) -> tuple[bytes, str]:
        """Return the bytes + MIME of a stored diagram image."""
        try:
            scope = _scope(identity)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            )
        try:
            return await question_bank_s3.read_diagram(scope=scope, key=key)
        except PermissionError as exc:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)
            )
        except FileNotFoundError:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Diagram image not found.",
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "Diagram read failed user=%s scope=%s key=%s: %s",
                user.id, scope.base_prefix, key, exc,
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not read the diagram image.",
            )

    # ── Shared helper ─────────────────────────────────────────────────
    def _parse_output_payload(
        self,
        payload: dict,
        identity: QuestionBankIdentity,
        scope: QuestionBankScope,
        meta_dict: dict | None = None,
    ) -> QuestionBankOutputResponse:
        """Build the response by merging metadata.json + output JSON.

        ``payload`` is the output JSON (a bare question bank or an
        envelope ``{"question_bank": ..., "metadata": ..., "provider_meta": ...}``).
        ``meta_dict`` is the metadata.json the caller loaded from S3; it
        provides the contract fields (subject/grade/chapter/…), with any
        per-output metadata in the envelope taking precedence.
        """
        if isinstance(payload, dict) and "question_bank" in payload:
            qb_dict = payload.get("question_bank") or {}
            envelope_meta = payload.get("metadata") or {}
            provider_meta = payload.get("provider_meta", {})
        else:
            qb_dict = payload
            envelope_meta = {}
            provider_meta = {}

        # Microservice now returns the flat contract directly: a single
        # ``questions[]`` array at the top level. We still normalize each
        # question's ``type`` so older ``question_type`` fields work.
        qb_dict = self._normalize_questions(qb_dict)

        # Merge precedence (last wins): identity → envelope → metadata.json.
        # metadata.json is the canonical contract source, so it overrides
        # any partial metadata that may be embedded in the output JSON.
        merged_meta: dict = {}
        for source in (identity.model_dump(), envelope_meta, meta_dict or {}):
            for k, v in source.items():
                if k in QuestionBankMetadata.model_fields and v is not None:
                    merged_meta[k] = v

        try:
            metadata = QuestionBankMetadata.model_validate(merged_meta)
            question_bank = GeneratedQuestionBank.model_validate(qb_dict)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Stored question bank is malformed: {exc}",
            )

        return QuestionBankOutputResponse(
            output_path=scope.output_key,
            metadata=metadata,
            question_bank=question_bank,
            provider_meta=provider_meta,
        )

    @staticmethod
    def _normalize_questions(qb_dict: dict) -> dict:
        """Light-touch normalisation for the flat microservice payload.

        Maps ``question_type`` → ``type`` per item so the frontend's
        existing renderer keeps working. Everything else is passed
        through untouched (the schema uses ``extra=allow``).
        """
        if not isinstance(qb_dict, dict):
            return qb_dict

        out = dict(qb_dict)
        normalized: list[dict] = []
        for q in out.get("questions") or []:
            if not isinstance(q, dict):
                continue
            q2 = dict(q)
            if not q2.get("type") and q2.get("question_type"):
                q2["type"] = q2["question_type"]
            normalized.append(q2)
        out["questions"] = normalized
        return out

    # ── List question banks for a teacher ─────────────────────────────
    async def list_chapters(
        self,
        *,
        user: UserContext,
        school_id: str,
        teacher_id: str,
    ) -> List[QuestionBankListItem]:
        try:
            prefix = question_bank_s3.teacher_prefix(school_id, teacher_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            )

        try:
            infos = await question_bank_s3.list_keys(prefix)
        except Exception as exc:  # noqa: BLE001
            logger.exception("S3 list failed prefix=%s: %s", prefix, exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not load your question banks.",
            )

        # Each key looks like:
        #   question-bank/{school}/{teacher}/{grade}/{subject}/{chapter}/<...>
        groups: dict[tuple[str, ...], dict] = {}
        for info in infos:
            parts = info.key.split("/")
            if len(parts) < 7:
                continue
            chapter_key = tuple(parts[:6])
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

        chapters: List[QuestionBankListItem] = []
        for parts, flags in groups.items():
            if not flags["has_metadata"]:
                continue
            _, school, teacher, grade, subject, chapter = parts
            identity = QuestionBankIdentity(
                school_id=school,
                teacher_id=teacher,
                grade_id=grade,
                subject_id=subject,
                chapter_id=chapter,
            )
            try:
                scope = _scope(identity)
                meta_dict = await question_bank_s3.read_metadata(scope=scope)
            except FileNotFoundError:
                continue
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Skipping question bank due to metadata read error scope=%s: %s",
                    "/".join(parts),
                    exc,
                )
                continue
            try:
                metadata = QuestionBankMetadata.model_validate(meta_dict)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Skipping question bank due to bad metadata scope=%s: %s",
                    "/".join(parts),
                    exc,
                )
                continue

            question_bank = None
            if flags["has_output"]:
                try:
                    payload = await question_bank_s3.read_output(scope=scope)
                    if (
                        isinstance(payload, dict)
                        and "question_bank" in payload
                    ):
                        payload = payload.get("question_bank") or {}
                    question_bank = GeneratedQuestionBank.model_validate(payload)
                except Exception as exc:  # noqa: BLE001
                    logger.warning(
                        "Could not parse output for question bank scope=%s: %s",
                        scope.base_prefix,
                        exc,
                    )
                    question_bank = None

            chapters.append(
                QuestionBankListItem(
                    metadata=metadata,
                    question_bank=question_bank,
                    has_output=question_bank is not None,
                    last_modified=flags["last_modified"],
                )
            )

        chapters.sort(key=lambda c: c.last_modified or "", reverse=True)
        logger.info(
            "Question bank LIST ok user=%s prefix=%s chapters=%d",
            user.id,
            prefix,
            len(chapters),
        )
        return chapters

    # ── Delete one question bank ──────────────────────────────────────
    async def delete_chapter(
        self,
        *,
        user: UserContext,
        identity: QuestionBankIdentity,
    ) -> int:
        try:
            scope = _scope(identity)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            )

        try:
            removed = await question_bank_s3.delete_prefix(
                f"{scope.base_prefix}/"
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "S3 delete failed scope=%s: %s", scope.base_prefix, exc
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not delete the question bank.",
            )

        if removed == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Question bank not found.",
            )
        logger.info(
            "Question bank DELETE ok user=%s scope=%s removed=%d",
            user.id,
            scope.base_prefix,
            removed,
        )
        return removed


question_bank_ai_service = QuestionBankAIService()
