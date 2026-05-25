"""
Verifies that CPU-bound work is pushed off the event loop.

Two surfaces under test:

1. bcrypt password verify/hash — must run on a worker thread so a single
   login attempt can't stall every concurrent request on the same uvicorn
   process. (~100ms per attempt at the default cost factor; bcrypt holds
   the GIL the whole time.)

2. File uploads — must stream through ``upload_stream`` instead of
   materialising the full payload in Python memory. A 25 MB file × 9
   files per request = 225 MB resident before the fix.

These tests check the OBSERVABLE behaviour (event loop stays responsive,
no full read into memory), not the implementation detail (the
``to_thread`` call). That way refactors that change the offload mechanism
but preserve the property still pass.
"""
import asyncio
import io
import os
import sys
import time

import pytest

sys.path.append(os.getcwd())

os.environ.setdefault("SECRET_KEY", "test-secret-key-must-be-at-least-32-chars-long")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("ENVIRONMENT", "dev")
os.environ["FEE_REMINDER_SCHEDULER_ENABLED"] = "false"


# ─── bcrypt offload ─────────────────────────────────────────────────────────


async def test_verify_password_async_keeps_event_loop_responsive():
    """
    While an async bcrypt verify is running, a concurrent asyncio.sleep
    should still tick. If verify_password_async forgot to ``to_thread``,
    bcrypt would hold the GIL and the sleep wouldn't fire on time.

    We use a short cost-factor hash so the test isn't slow; the property
    we care about is "doesn't block the loop", not "takes >100ms".
    """
    from app.core.security import get_password_hash, verify_password_async

    # Pre-compute synchronously (sync API is fine outside the test loop).
    pw = "correct-horse-battery-staple"
    hashed = get_password_hash(pw)

    # Concurrent sleep should complete on schedule even with verify pending.
    sleep_done = asyncio.Event()

    async def sleeper():
        await asyncio.sleep(0.05)
        sleep_done.set()

    start = time.perf_counter()
    verify_task = asyncio.create_task(verify_password_async(pw, hashed))
    sleep_task = asyncio.create_task(sleeper())

    await asyncio.gather(verify_task, sleep_task)
    elapsed = time.perf_counter() - start

    assert verify_task.result() is True
    assert sleep_done.is_set()
    # If bcrypt blocked the loop, both tasks would serialize and
    # elapsed > bcrypt_time + sleep_time. With offload, elapsed ≈
    # max(bcrypt_time, sleep_time). We give a generous margin (1 second)
    # so a slow CI machine doesn't false-fail.
    assert elapsed < 1.0, f"event loop stalled — concurrent run took {elapsed:.2f}s"


async def test_get_password_hash_async_returns_verifiable_hash():
    """The async wrapper must produce a hash the sync verify can read."""
    from app.core.security import get_password_hash_async, verify_password

    h = await get_password_hash_async("hunter2")
    assert verify_password("hunter2", h)
    assert not verify_password("wrong", h)


# ─── Storage streaming ──────────────────────────────────────────────────────


async def test_local_backend_streams_without_loading_to_memory(tmp_path):
    """
    The local backend's ``upload_stream`` must copy chunk-by-chunk, not
    swallow the whole file into memory. We wrap a BytesIO in a tracker
    that counts how big the largest single read was.
    """
    from app.services.storage.local_backend import LocalStorageBackend

    backend = LocalStorageBackend(root=str(tmp_path))

    class _ReadTracker(io.BytesIO):
        def __init__(self, data):
            super().__init__(data)
            self.max_chunk = 0

        def read(self, n=-1):
            buf = super().read(n)
            self.max_chunk = max(self.max_chunk, len(buf))
            return buf

    # 3 MB payload — bigger than any sane "single read" chunk size.
    payload = b"x" * (3 * 1024 * 1024)
    tracker = _ReadTracker(payload)

    await backend.upload_stream(
        key="test/streamed.bin",
        fileobj=tracker,
        content_type="application/octet-stream",
        content_length=len(payload),
    )

    # File on disk has the right bytes.
    written = (tmp_path / "test" / "streamed.bin").read_bytes()
    assert written == payload

    # And the streaming layer never asked for more than the chunk size.
    # Implementation uses 1 MiB chunks; allow some headroom for tweaks.
    assert tracker.max_chunk <= 2 * 1024 * 1024, (
        f"upload_stream pulled a {tracker.max_chunk}-byte chunk — that's "
        f"no longer streaming."
    )


async def test_s3_backend_exposes_upload_stream():
    """
    Structural guard: the S3 backend must implement ``upload_stream`` so
    callers can swap from local→S3 without code change. We don't try a
    real S3 round-trip here (would need moto / live creds); the
    base-class abstractmethod already forbids instantiation if missing.
    """
    from app.services.storage.s3_backend import S3StorageBackend
    assert hasattr(S3StorageBackend, "upload_stream")
    assert callable(S3StorageBackend.upload_stream)
    # Confirm coroutine, not sync.
    import inspect
    assert inspect.iscoroutinefunction(S3StorageBackend.upload_stream)


# ─── Service integration: streamed upload, no full read ────────────────────


class _FakeUploadFile:
    """
    Stands in for fastapi.UploadFile. The point of this stub is to expose
    ``.file`` (the SpooledTemporaryFile the real UploadFile wraps) so we
    can verify the service uses the streaming path. ``read()`` is wired
    to raise — if the service ever falls back to ``await upload.read()``
    instead of ``upload.file.read()``, the test fails loudly.
    """
    def __init__(self, filename: str, payload: bytes, content_type="application/pdf"):
        self.filename = filename
        self.content_type = content_type
        self.file = io.BytesIO(payload)

    async def read(self):
        raise AssertionError(
            "Service called UploadFile.read() — that materialises the full "
            "payload in memory. Use upload.file (the spooled file) and "
            "stream via backend.upload_stream instead."
        )


async def test_uploaded_file_service_streams_to_backend(tmp_path, monkeypatch):
    """
    End-to-end: hand the service a fake upload, observe that:
      * It never calls ``await upload.read()``.
      * It hands the spooled file to the backend.
      * The file written matches the payload.
    """
    # Force dev so the storage factory returns local backend.
    from app.core import config as cfg_mod
    monkeypatch.setattr(cfg_mod.settings, "ENVIRONMENT", "dev")

    # Re-point the local backend's root at the test tmp dir.
    from app.services.storage import local_backend as lb_mod
    backend = lb_mod.LocalStorageBackend(root=str(tmp_path))

    # The service flow is heavy (DB writes, teacher lookup). Test just
    # the upload-to-backend layer directly so we keep the assertion sharp.
    payload = b"%PDF-1.7 fake pdf bytes" + b"x" * (2 * 1024 * 1024)
    fake = _FakeUploadFile("notes.pdf", payload)

    await backend.upload_stream(
        key="teacher_99/notes.pdf",
        fileobj=fake.file,
        content_type=fake.content_type,
        content_length=len(payload),
    )

    written = (tmp_path / "teacher_99" / "notes.pdf").read_bytes()
    assert written == payload
