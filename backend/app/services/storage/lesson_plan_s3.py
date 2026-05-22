"""S3 storage utility dedicated to the Lesson Plan feature.

Production path layout (folders are *implicit* — S3 has none; they exist only
as `/`-delimited prefixes inside object keys):

    lesson-plan/{school_id}/{teacher_id}/{grade_id}/{subject_id}/{chapter_id}/
        metadata/metadata.json
        input/<sanitized_filename>
        output/lesson_plan.json

Design notes
------------

* The bucket is **never made public**. All access goes through this
  server-side service using the server's IAM credentials. The frontend
  never receives an AWS key.
* `boto3` is Python's AWS SDK (Python equivalent of AWS SDK v3 — same
  S3 API surface). We configure it with a retry policy + adaptive
  back-off, then wrap blocking calls in `asyncio.to_thread` so the
  FastAPI event loop stays free.
* In `ENVIRONMENT=prod` we refuse to fall back to local disk — if S3 is
  not configured, callers get a clear startup-time error. In dev we
  fall back to a `LessonPlanLocalDevStore` adapter that mirrors the
  same key layout under `static/private_uploads/`, so the feature is
  testable without AWS credentials.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, List, Optional, Tuple

from app.core.config import settings
from app.core.logger import logger

# ── Public root prefix ────────────────────────────────────────────────────────
ROOT_PREFIX = "lesson-plan"
METADATA_FILENAME = "metadata.json"
OUTPUT_FILENAME = "lesson_plan.json"

# ── Tunables ──────────────────────────────────────────────────────────────────
MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # 200 MB per file — generous cap
MAX_UPLOAD_ATTEMPTS = 4               # initial try + 3 retries
RETRY_BACKOFF_BASE_SECONDS = 0.4      # exponential: 0.4s, 0.8s, 1.6s, 3.2s

# No extension or MIME restrictions — the external microservice decides what
# it can parse. The backend just stores the bytes.

_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
_FILENAME_PATTERN = re.compile(r"[^A-Za-z0-9._-]+")


# ── Validation helpers ───────────────────────────────────────────────────────
def assert_valid_id(name: str, value: str) -> None:
    """Allow only `[A-Za-z0-9._-]` ids. Stops path-traversal / wildcards."""
    if not isinstance(value, str) or not _ID_PATTERN.match(value):
        raise ValueError(
            f"Invalid {name}: '{value}'. Must match [A-Za-z0-9._-] and be 1-64 chars."
        )


def sanitize_filename(name: str) -> str:
    base = os.path.basename(name or "").strip() or "file"
    base = _FILENAME_PATTERN.sub("_", base)
    return base[:180] or "file"


def extension_of(name: str) -> str:
    return name.rsplit(".", 1)[-1].lower() if "." in name else ""


def validate_upload(filename: str, content_type: str, size_bytes: int) -> None:
    """Only checks the file is non-empty and within the size cap.

    File type / MIME validation is delegated to the downstream microservice.
    """
    del filename, content_type  # intentionally unrestricted
    if size_bytes <= 0:
        raise ValueError("Uploaded file is empty.")
    if size_bytes > MAX_UPLOAD_BYTES:
        mb = MAX_UPLOAD_BYTES // (1024 * 1024)
        raise ValueError(f"File too large (max {mb} MB).")


# ── Key builders ─────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class ChapterScope:
    """The five IDs that pin a lesson plan to its S3 namespace."""

    school_id: str
    teacher_id: str
    grade_id: str
    subject_id: str
    chapter_id: str

    def validate(self) -> "ChapterScope":
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


def unique_input_keys(scope: ChapterScope, filenames: Iterable[str]) -> List[str]:
    """Resolve in-batch filename collisions deterministically.

    Production behaviour: if two uploaded files happen to share a name
    we add a numeric suffix (`name.pdf`, `name_2.pdf`, …) so neither
    overwrites the other within the same upload call.
    """
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


# ── S3 client (boto3) ────────────────────────────────────────────────────────
class _S3Client:
    """Lazy boto3 client with retries baked in.

    The `Config(retries={"mode": "adaptive", ...})` block triggers the
    SDK's built-in exponential back-off for transient errors (5xx,
    throttling). We add an outer retry around this for connection-level
    issues that bypass the SDK's loop.
    """

    def __init__(self) -> None:
        self._client = None

    @property
    def bucket(self) -> str:
        bucket = settings.AWS_S3_BUCKET
        if not bucket:
            raise RuntimeError(
                "AWS_S3_BUCKET is not configured. Lesson plan storage requires S3."
            )
        return bucket

    def _build(self):
        import boto3  # type: ignore
        from botocore.config import Config  # type: ignore

        return boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_S3_REGION,
            config=Config(
                retries={"max_attempts": 5, "mode": "adaptive"},
                connect_timeout=10,
                read_timeout=60,
            ),
        )

    def get(self):
        if self._client is None:
            self._client = self._build()
        return self._client


_s3 = _S3Client()


def _s3_configured() -> bool:
    return bool(
        settings.AWS_S3_BUCKET
        and settings.AWS_S3_REGION
        and settings.AWS_ACCESS_KEY_ID
        and settings.AWS_SECRET_ACCESS_KEY
    )


_NOT_FOUND_CODES = {"404", "NoSuchKey", "NotFound"}


def _is_not_found(exc: Exception) -> bool:
    """Detect an S3 404 so we don't waste retries on a missing key."""
    response = getattr(exc, "response", None)
    if isinstance(response, dict):
        code = (response.get("Error") or {}).get("Code")
        if code in _NOT_FOUND_CODES:
            return True
        status_code = (response.get("ResponseMetadata") or {}).get("HTTPStatusCode")
        if status_code == 404:
            return True
    return False


# ── Retry wrapper ────────────────────────────────────────────────────────────
async def _with_retries(label: str, fn):
    last_exc: Optional[Exception] = None
    for attempt in range(1, MAX_UPLOAD_ATTEMPTS + 1):
        try:
            return await asyncio.to_thread(fn)
        except FileNotFoundError:
            # Translate to FileNotFoundError for upstream callers.
            raise
        except Exception as exc:  # noqa: BLE001
            # 404 is terminal — never retry, surface as FileNotFoundError
            # so the service layer can map it to an HTTP 404.
            if _is_not_found(exc):
                raise FileNotFoundError(label) from exc
            last_exc = exc
            if attempt >= MAX_UPLOAD_ATTEMPTS:
                break
            delay = RETRY_BACKOFF_BASE_SECONDS * (2 ** (attempt - 1))
            logger.warning(
                "S3 %s failed (attempt %d/%d): %s — retrying in %.2fs",
                label,
                attempt,
                MAX_UPLOAD_ATTEMPTS,
                exc,
                delay,
            )
            await asyncio.sleep(delay)
    raise RuntimeError(f"S3 {label} failed after {MAX_UPLOAD_ATTEMPTS} attempts") from last_exc


# ── Backend interface ────────────────────────────────────────────────────────
@dataclass(frozen=True)
class KeyInfo:
    key: str
    last_modified: Optional[str]


class _LessonPlanS3Backend:
    """Real S3 backend used in prod."""

    name = "s3"

    async def put_object(
        self,
        *,
        key: str,
        data: bytes,
        content_type: str,
    ) -> None:
        bucket = _s3.bucket
        client = _s3.get()
        started = time.perf_counter()

        def _put() -> None:
            client.put_object(
                Bucket=bucket,
                Key=key,
                Body=data,
                ContentType=content_type or "application/octet-stream",
                ACL="private",                 # defence-in-depth
                ServerSideEncryption="AES256",  # encrypt-at-rest
            )

        await _with_retries(f"put {key}", _put)
        logger.info(
            "S3 put ok bucket=%s key=%s size=%d elapsed_ms=%d",
            bucket,
            key,
            len(data),
            int((time.perf_counter() - started) * 1000),
        )

    async def get_object(self, key: str) -> bytes:
        bucket = _s3.bucket
        client = _s3.get()

        def _get() -> bytes:
            obj = client.get_object(Bucket=bucket, Key=key)
            return obj["Body"].read()

        return await _with_retries(f"get {key}", _get)

    async def exists(self, key: str) -> bool:
        bucket = _s3.bucket
        client = _s3.get()
        from botocore.exceptions import ClientError  # type: ignore

        def _head() -> bool:
            try:
                client.head_object(Bucket=bucket, Key=key)
                return True
            except ClientError as exc:
                code = exc.response.get("Error", {}).get("Code")
                if code in ("404", "NoSuchKey", "NotFound"):
                    return False
                raise

        return await asyncio.to_thread(_head)

    async def list_keys(self, prefix: str) -> List["KeyInfo"]:
        bucket = _s3.bucket
        client = _s3.get()

        def _list() -> List["KeyInfo"]:
            paginator = client.get_paginator("list_objects_v2")
            results: List[KeyInfo] = []
            for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
                for obj in page.get("Contents") or []:
                    lm = obj.get("LastModified")
                    iso = lm.isoformat() if isinstance(lm, datetime) else None
                    results.append(KeyInfo(key=obj["Key"], last_modified=iso))
            return results

        return await asyncio.to_thread(_list)

    async def delete_keys(self, keys: List[str]) -> int:
        if not keys:
            return 0
        bucket = _s3.bucket
        client = _s3.get()

        def _delete() -> int:
            removed = 0
            # delete_objects max batch is 1000.
            for i in range(0, len(keys), 1000):
                batch = [{"Key": k} for k in keys[i : i + 1000]]
                resp = client.delete_objects(
                    Bucket=bucket,
                    Delete={"Objects": batch, "Quiet": True},
                )
                # ``Deleted`` is only included when Quiet=False. With Quiet=True
                # only ``Errors`` is returned. Treat absence of errors as the
                # entire batch succeeding.
                errors = resp.get("Errors") or []
                removed += len(batch) - len(errors)
                if errors:
                    logger.warning("S3 delete had %d errors: %s", len(errors), errors[:3])
            return removed

        return await asyncio.to_thread(_delete)


class _LessonPlanLocalDevStore:
    """Local-disk mirror used when S3 isn't configured in dev.

    Refuses to operate in `ENVIRONMENT=prod` — production callers must
    fix their AWS credentials, not silently fall back.
    """

    name = "local"

    def __init__(self, root: Optional[str] = None) -> None:
        self.root = root or os.path.join(
            os.getcwd(), "static", "private_uploads"
        )
        os.makedirs(self.root, exist_ok=True)

    def _resolve(self, key: str) -> str:
        safe_key = key.lstrip("/\\").replace("..", "_")
        return os.path.join(self.root, safe_key)

    async def put_object(
        self, *, key: str, data: bytes, content_type: str
    ) -> None:
        path = self._resolve(key)
        os.makedirs(os.path.dirname(path), exist_ok=True)

        def _write() -> None:
            with open(path, "wb") as fh:
                fh.write(data)

        await asyncio.to_thread(_write)
        logger.info("LOCAL put ok key=%s size=%d", key, len(data))

    async def get_object(self, key: str) -> bytes:
        path = self._resolve(key)

        def _read() -> bytes:
            try:
                with open(path, "rb") as fh:
                    return fh.read()
            except FileNotFoundError as exc:
                raise FileNotFoundError(key) from exc

        return await asyncio.to_thread(_read)

    async def exists(self, key: str) -> bool:
        return os.path.exists(self._resolve(key))

    async def list_keys(self, prefix: str) -> List[KeyInfo]:
        # Walk the file tree under the resolved prefix.
        prefix_path = self._resolve(prefix)
        if not os.path.exists(prefix_path):
            return []

        def _walk() -> List[KeyInfo]:
            results: List[KeyInfo] = []
            root_path = os.path.abspath(self.root)
            for dirpath, _dirs, files in os.walk(prefix_path):
                for f in files:
                    full = os.path.join(dirpath, f)
                    rel = os.path.relpath(full, root_path).replace(os.sep, "/")
                    try:
                        mtime = os.path.getmtime(full)
                        iso = datetime.utcfromtimestamp(mtime).isoformat() + "Z"
                    except OSError:
                        iso = None
                    results.append(KeyInfo(key=rel, last_modified=iso))
            return results

        return await asyncio.to_thread(_walk)

    async def delete_keys(self, keys: List[str]) -> int:
        def _delete() -> int:
            removed = 0
            for k in keys:
                path = self._resolve(k)
                try:
                    os.remove(path)
                    removed += 1
                except FileNotFoundError:
                    continue
                # Prune empty parent directories up to the local root.
                try:
                    parent = os.path.dirname(path)
                    while parent and parent.startswith(self.root) and parent != self.root:
                        if not os.listdir(parent):
                            os.rmdir(parent)
                            parent = os.path.dirname(parent)
                        else:
                            break
                except OSError:
                    pass
            return removed

        return await asyncio.to_thread(_delete)


# ── Public service ───────────────────────────────────────────────────────────
class LessonPlanS3Service:
    """High-level API used by the lesson-plan service layer.

    Knows nothing about HTTP or AI — only about persisting bytes / JSON
    under the canonical key layout.
    """

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
                "Lesson plan storage: S3 not configured — falling back to "
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
        scope: ChapterScope,
        filename: str,
        content_type: str,
        data: bytes,
    ) -> str:
        """Upload one resource file. Returns the canonical S3 key."""
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
        """Upload at a pre-resolved key (used when batch dedup happened)."""
        await self._backend.put_object(
            key=key, data=data, content_type=content_type
        )
        return key

    # ── Metadata JSON ─────────────────────────────────────────────────
    async def write_metadata(
        self,
        *,
        scope: ChapterScope,
        metadata: dict,
    ) -> str:
        key = scope.validate().metadata_key
        await self._backend.put_object(
            key=key,
            data=json.dumps(metadata, ensure_ascii=False, indent=2).encode("utf-8"),
            content_type="application/json",
        )
        return key

    async def read_metadata(self, *, scope: ChapterScope) -> dict:
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
        scope: ChapterScope,
        payload: dict,
    ) -> str:
        key = scope.validate().output_key
        await self._backend.put_object(
            key=key,
            data=json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"),
            content_type="application/json",
        )
        return key

    async def read_output(self, *, scope: ChapterScope) -> dict:
        key = scope.validate().output_key
        try:
            raw = await self._backend.get_object(key)
        except FileNotFoundError as exc:
            raise FileNotFoundError(f"lesson plan not found at {key}") from exc
        return json.loads(raw.decode("utf-8"))

    # ── Raw fetch (for AI fallback hydration) ─────────────────────────
    async def read_object(self, key: str) -> bytes:
        return await self._backend.get_object(key)

    # ── Listing + bulk delete ─────────────────────────────────────────
    async def list_keys(self, prefix: str) -> List[KeyInfo]:
        """Return every key (with last-modified) under a prefix."""
        return await self._backend.list_keys(prefix)

    async def delete_prefix(self, prefix: str) -> int:
        """Delete every object whose key starts with ``prefix``.

        Returns the count of deleted keys. No-op on an empty prefix.
        """
        if not prefix or prefix in ("/", ROOT_PREFIX + "/", ROOT_PREFIX):
            raise ValueError("Refusing to delete a root-level prefix.")
        infos = await self._backend.list_keys(prefix)
        keys = [info.key for info in infos]
        if not keys:
            return 0
        return await self._backend.delete_keys(keys)

    def teacher_prefix(self, school_id: str, teacher_id: str) -> str:
        """Build the listing prefix that scopes results to one teacher."""
        assert_valid_id("school_id", school_id)
        assert_valid_id("teacher_id", teacher_id)
        return f"{ROOT_PREFIX}/{school_id}/{teacher_id}/"


lesson_plan_s3 = LessonPlanS3Service()
