"""S3 storage utility dedicated to the Question Bank feature.

Mirrors :mod:`app.services.storage.lesson_plan_s3` but under a separate
``question-bank/`` root prefix. The underlying S3 backend + local-dev
fallback are reused from the lesson-plan module — they are generic
key-value adapters, not lesson-plan-specific.

Production path layout::

    question-bank/{school_id}/{teacher_id}/{grade_id}/{subject_id}/{chapter_id}/
        metadata/metadata.json
        input/<sanitized_filename>
        output/question_bank.json
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Iterable, List

from app.core.config import settings
from app.core.logger import logger
from app.services.storage.lesson_plan_s3 import (
    KeyInfo,
    _LessonPlanLocalDevStore,
    _LessonPlanS3Backend,
    _s3_configured,
    assert_valid_id,
    sanitize_filename,
    validate_upload,
)

# ── Public root prefix ────────────────────────────────────────────────────────
ROOT_PREFIX = "question-bank"
METADATA_FILENAME = "metadata.json"
OUTPUT_FILENAME = "question_bank.json"

# ── Diagram image constraints ────────────────────────────────────────────────
MAX_DIAGRAM_BYTES = 8 * 1024 * 1024  # 8 MB per image — enough for hand-drawn JPGs
DIAGRAM_EXT_TO_MIME = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "webp": "image/webp",
    "svg": "image/svg+xml",
}


def _diagram_ext(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def validate_diagram_upload(
    filename: str, content_type: str, size_bytes: int
) -> str:
    """Reject non-image uploads up-front and return the resolved MIME.

    Teachers might pick a PDF or a doc by mistake; we don't want those
    living under ``output/diagrams/`` because the read endpoint serves
    them with image content types.
    """
    if size_bytes <= 0:
        raise ValueError("Uploaded diagram is empty.")
    if size_bytes > MAX_DIAGRAM_BYTES:
        mb = MAX_DIAGRAM_BYTES // (1024 * 1024)
        raise ValueError(f"Diagram image too large (max {mb} MB).")
    ext = _diagram_ext(filename)
    if ext not in DIAGRAM_EXT_TO_MIME:
        allowed = ", ".join(sorted(DIAGRAM_EXT_TO_MIME))
        raise ValueError(
            f"Unsupported diagram type '.{ext}'. Allowed: {allowed}."
        )
    # Prefer the browser-provided content_type when it's a sensible
    # image/*; otherwise fall back to the extension map.
    if content_type.startswith("image/"):
        return content_type
    return DIAGRAM_EXT_TO_MIME[ext]


def diagram_mime_for_key(key: str) -> str:
    ext = _diagram_ext(key)
    return DIAGRAM_EXT_TO_MIME.get(ext, "application/octet-stream")


# ── Key builders ─────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class QuestionBankScope:
    """The five IDs that pin a question bank to its S3 namespace."""

    school_id: str
    teacher_id: str
    grade_id: str
    subject_id: str
    chapter_id: str

    def validate(self) -> "QuestionBankScope":
        assert_valid_id("school_id", self.school_id)
        assert_valid_id("teacher_id", self.teacher_id)
        assert_valid_id("grade_id", self.grade_id)
        assert_valid_id("subject_id", self.subject_id)
        assert_valid_id("chapter_id", self.chapter_id)
        return self

    @property
    def base_prefix(self) -> str:
        return (
            f"{ROOT_PREFIX}/{self.school_id}/{self.teacher_id}/"
            f"{self.grade_id}/{self.subject_id}/{self.chapter_id}"
        )

    @property
    def metadata_key(self) -> str:
        return f"{self.base_prefix}/metadata/{METADATA_FILENAME}"

    @property
    def output_key(self) -> str:
        return f"{self.base_prefix}/output/{OUTPUT_FILENAME}"

    def input_key(self, filename: str) -> str:
        return f"{self.base_prefix}/input/{sanitize_filename(filename)}"

    @property
    def diagram_prefix(self) -> str:
        """All teacher-uploaded diagram images for this question bank."""
        return f"{self.base_prefix}/output/diagrams/"

    def diagram_key(self, filename: str) -> str:
        return f"{self.diagram_prefix}{sanitize_filename(filename)}"


def unique_input_keys(
    scope: QuestionBankScope, filenames: Iterable[str]
) -> List[str]:
    """Resolve in-batch filename collisions deterministically."""
    used: set[str] = set()
    out: List[str] = []
    for name in filenames:
        safe = sanitize_filename(name)
        stem, dot, ext = safe.rpartition(".")
        candidate = safe
        idx = 2
        while candidate in used:
            if dot:
                candidate = f"{stem}_{idx}.{ext}"
            else:
                candidate = f"{safe}_{idx}"
            idx += 1
        used.add(candidate)
        out.append(scope.input_key(candidate))
    return out


# ── Public service ───────────────────────────────────────────────────────────
class QuestionBankS3Service:
    """High-level API used by the question-bank service layer."""

    def __init__(self) -> None:
        if _s3_configured():
            self._backend = _LessonPlanS3Backend()
            self._mode = "s3"
        elif settings.ENVIRONMENT == "prod":
            raise RuntimeError(
                "S3 is not configured but ENVIRONMENT=prod. "
                "Set AWS_S3_BUCKET / AWS_S3_REGION / AWS_ACCESS_KEY_ID / "
                "AWS_SECRET_ACCESS_KEY."
            )
        else:
            logger.warning(
                "Question bank storage: S3 not configured — falling back to "
                "local-disk dev store. Do not deploy this way."
            )
            self._backend = _LessonPlanLocalDevStore()
            self._mode = "local"

    @property
    def mode(self) -> str:
        return self._mode

    @property
    def backend_name(self) -> str:
        return self._backend.name

    # ── Resource upload ───────────────────────────────────────────────
    async def upload_resource(
        self,
        *,
        scope: QuestionBankScope,
        filename: str,
        content_type: str,
        data: bytes,
    ) -> str:
        validate_upload(filename, content_type, len(data))
        scope.validate()
        key = scope.input_key(filename)
        await self._backend.put_object(
            key=key, data=data, content_type=content_type
        )
        return key

    async def upload_resource_at_key(
        self,
        *,
        key: str,
        content_type: str,
        data: bytes,
    ) -> str:
        await self._backend.put_object(
            key=key, data=data, content_type=content_type
        )
        return key

    # ── Metadata JSON ─────────────────────────────────────────────────
    async def write_metadata(
        self,
        *,
        scope: QuestionBankScope,
        metadata: dict,
    ) -> str:
        key = scope.validate().metadata_key
        await self._backend.put_object(
            key=key,
            data=json.dumps(metadata, ensure_ascii=False, indent=2).encode("utf-8"),
            content_type="application/json",
        )
        return key

    async def read_metadata(self, *, scope: QuestionBankScope) -> dict:
        key = scope.validate().metadata_key
        try:
            raw = await self._backend.get_object(key)
        except FileNotFoundError as exc:
            raise FileNotFoundError(f"metadata not found at {key}") from exc
        return json.loads(raw.decode("utf-8"))

    # ── Output JSON ───────────────────────────────────────────────────
    async def write_output(
        self,
        *,
        scope: QuestionBankScope,
        payload: dict,
    ) -> str:
        key = scope.validate().output_key
        await self._backend.put_object(
            key=key,
            data=json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"),
            content_type="application/json",
        )
        return key

    async def read_output(self, *, scope: QuestionBankScope) -> dict:
        scope = scope.validate()
        key = scope.output_key
        try:
            raw = await self._backend.get_object(key)
        except FileNotFoundError:
            # The external AI microservice has historically written the file
            # under variant names (e.g. "Question-bank.json"). S3 is case-
            # sensitive, so a strict match misses it. Fall back to scanning
            # the output/ folder for the first .json sibling.
            output_prefix = f"{scope.base_prefix}/output/"
            siblings = await self._backend.list_keys(output_prefix)
            fallback = next(
                (
                    info.key for info in siblings
                    if info.key.lower().endswith(".json") and info.key != key
                ),
                None,
            )
            if not fallback:
                raise FileNotFoundError(f"question bank not found at {key}")
            logger.warning(
                "read_output fell back to non-canonical key %s (expected %s)",
                fallback, key,
            )
            raw = await self._backend.get_object(fallback)
        return json.loads(raw.decode("utf-8"))

    # ── Diagram images (per-question, teacher uploaded) ──────────────
    async def upload_diagram(
        self,
        *,
        scope: QuestionBankScope,
        filename: str,
        content_type: str,
        data: bytes,
    ) -> tuple[str, str]:
        """Validate + persist one diagram image. Returns (key, mime)."""
        resolved_mime = validate_diagram_upload(filename, content_type, len(data))
        scope.validate()
        key = scope.diagram_key(filename)
        await self._backend.put_object(
            key=key, data=data, content_type=resolved_mime
        )
        return key, resolved_mime

    async def read_diagram(
        self, *, scope: QuestionBankScope, key: str
    ) -> tuple[bytes, str]:
        """Read a diagram by key, asserting it lives under this scope.

        Refusing keys outside ``<scope>/output/diagrams/`` stops one
        teacher from streaming another teacher's images by crafting a
        URL.
        """
        scope.validate()
        if not key.startswith(scope.diagram_prefix):
            raise PermissionError(
                f"key {key!r} is not under {scope.diagram_prefix!r}"
            )
        raw = await self._backend.get_object(key)
        return raw, diagram_mime_for_key(key)

    # ── Raw fetch ─────────────────────────────────────────────────────
    async def read_object(self, key: str) -> bytes:
        return await self._backend.get_object(key)

    # ── Listing + bulk delete ─────────────────────────────────────────
    async def list_keys(self, prefix: str) -> List[KeyInfo]:
        return await self._backend.list_keys(prefix)

    async def delete_prefix(self, prefix: str) -> int:
        if not prefix or prefix in ("/", ROOT_PREFIX + "/", ROOT_PREFIX):
            raise ValueError("Refusing to delete a root-level prefix.")
        infos = await self._backend.list_keys(prefix)
        keys = [info.key for info in infos]
        if not keys:
            return 0
        return await self._backend.delete_keys(keys)

    def teacher_prefix(self, school_id: str, teacher_id: str) -> str:
        assert_valid_id("school_id", school_id)
        assert_valid_id("teacher_id", teacher_id)
        return f"{ROOT_PREFIX}/{school_id}/{teacher_id}/"


question_bank_s3 = QuestionBankS3Service()

# Re-exports for typed imports in the service layer.
__all__ = [
    "QuestionBankScope",
    "QuestionBankS3Service",
    "question_bank_s3",
    "unique_input_keys",
    "validate_upload",
    "validate_diagram_upload",
    "diagram_mime_for_key",
    "MAX_DIAGRAM_BYTES",
    "ROOT_PREFIX",
]
