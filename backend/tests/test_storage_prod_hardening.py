"""
Verifies the three prod-hardening guards on file storage.

Before this fix, a prod deploy without S3 would silently write uploads
to the container's local disk — files would disappear on the next
redeploy and never reach the other replicas. The fix layers three
guards:

1. ``app.core.config.Settings.__init__`` refuses to construct in prod
   when S3 is not set.
2. ``app.services.storage.factory.get_default_backend()`` refuses to
   hand back ``LocalStorageBackend`` in prod.
3. ``app.services.storage_service.storage_service.StorageService.upload_file``
   raises 503 in prod when the S3 backend isn't initialised, instead
   of writing to local disk.

These tests assert all three guards trip independently.
"""
import os
import sys
import pytest

sys.path.append(os.getcwd())

os.environ.setdefault("SECRET_KEY", "test-secret-key-must-be-at-least-32-chars-long")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("ENVIRONMENT", "dev")
os.environ["FEE_REMINDER_SCHEDULER_ENABLED"] = "false"


# ─── Guard 1: config startup check ─────────────────────────────────────────


_BASE_PROD_KWARGS = dict(
    ENVIRONMENT="prod",
    SECRET_KEY="x" * 32,
    DATABASE_URL="postgresql://u:p@h/d",
    FRONTEND_URL="https://app.example.com",
    # NOTE: must override the host .env, which may have real creds. Pydantic
    # kwargs win over .env values, so passing None explicitly is the only
    # way to simulate "operator forgot to set this in prod".
    AWS_S3_BUCKET=None,
    AWS_S3_REGION=None,
    AWS_ACCESS_KEY_ID=None,
    AWS_SECRET_ACCESS_KEY=None,
    CLOUDINARY_CLOUD_NAME=None,
    CLOUDINARY_API_KEY=None,
    CLOUDINARY_API_SECRET=None,
)


def test_config_blocks_prod_without_s3():
    """Settings() in prod with no S3 must raise."""
    from app.core.config import Settings

    kwargs = dict(_BASE_PROD_KWARGS)
    with pytest.raises(ValueError, match="AWS S3 is not configured"):
        Settings(**kwargs)


def test_config_allows_prod_without_cloudinary():
    """
    Cloudinary is no longer required in prod — all uploads go to S3.
    The env vars stay declared (legacy URLs in the DB still resolve via
    passthrough in resolve_url) but the absence of creds must not block
    startup.
    """
    from app.core.config import Settings

    kwargs = dict(_BASE_PROD_KWARGS)
    # S3 present, Cloudinary deliberately absent.
    kwargs.update(
        AWS_S3_BUCKET="some-bucket",
        AWS_S3_REGION="us-east-1",
        AWS_ACCESS_KEY_ID="AKIA...",
        AWS_SECRET_ACCESS_KEY="secret",
    )
    Settings(**kwargs)  # Must not raise.


def test_config_allows_prod_with_s3_present():
    """Sanity: a complete prod config still constructs."""
    from app.core.config import Settings

    kwargs = dict(_BASE_PROD_KWARGS)
    kwargs.update(
        AWS_S3_BUCKET="some-bucket",
        AWS_S3_REGION="us-east-1",
        AWS_ACCESS_KEY_ID="AKIA...",
        AWS_SECRET_ACCESS_KEY="secret",
    )
    Settings(**kwargs)


# ─── Guard 2: storage factory refuses local backend in prod ────────────────


def test_factory_refuses_local_backend_in_prod(monkeypatch):
    """
    Even if Settings somehow get into a prod-without-S3 state at runtime
    (config drift, secret rotation without restart), the factory must
    refuse to hand back the local backend.
    """
    from app.services.storage import factory as factory_mod
    from app.core import config as cfg_mod

    # Bypass the config startup check by mutating the singleton directly.
    monkeypatch.setattr(cfg_mod.settings, "ENVIRONMENT", "prod")
    monkeypatch.setattr(cfg_mod.settings, "AWS_S3_BUCKET", None)
    monkeypatch.setattr(cfg_mod.settings, "AWS_S3_REGION", None)
    monkeypatch.setattr(cfg_mod.settings, "AWS_ACCESS_KEY_ID", None)
    monkeypatch.setattr(cfg_mod.settings, "AWS_SECRET_ACCESS_KEY", None)
    # Clear the lru_cache so we don't get a stashed dev result.
    factory_mod.get_default_backend.cache_clear()
    factory_mod.get_backend_for.cache_clear()

    with pytest.raises(RuntimeError, match="no remote backend configured in production"):
        factory_mod.get_default_backend()

    # Clean up the cache so subsequent tests get a fresh resolution.
    factory_mod.get_default_backend.cache_clear()


def test_factory_returns_local_in_dev_without_s3(monkeypatch):
    """Dev convenience: local backend is still available when S3 is unset."""
    from app.services.storage import factory as factory_mod
    from app.services.storage.local_backend import LocalStorageBackend
    from app.core import config as cfg_mod

    monkeypatch.setattr(cfg_mod.settings, "ENVIRONMENT", "dev")
    monkeypatch.setattr(cfg_mod.settings, "AWS_S3_BUCKET", None)
    factory_mod.get_default_backend.cache_clear()

    backend = factory_mod.get_default_backend()
    assert isinstance(backend, LocalStorageBackend)

    factory_mod.get_default_backend.cache_clear()


# ─── Guard 3: StorageService refuses to write local in prod ────────────────


class _StubUploadFile:
    """Minimal UploadFile stand-in."""
    def __init__(self, filename: str, data: bytes):
        self.filename = filename
        self._data = data

    async def read(self):
        return self._data


async def test_storage_service_refuses_local_in_prod(monkeypatch):
    """
    Calls upload_file in prod with the S3 backend deliberately
    uninitialised — must raise 503, never write to ./static/uploads.
    """
    # The package's __init__ re-exports the singleton, so this import
    # already gives us the instance, not a module.
    from app.services.storage_service import storage_service as svc
    from app.core import config as cfg_mod
    from fastapi import HTTPException

    monkeypatch.setattr(cfg_mod.settings, "ENVIRONMENT", "prod")
    # Force S3 backend "not ready" — simulates a secret-rotation gap.
    monkeypatch.setattr(svc, "_s3", None)

    upload = _StubUploadFile("attachment.pdf", b"x" * 1024)

    with pytest.raises(HTTPException) as exc:
        await svc.upload_file(upload)
    assert exc.value.status_code == 503

    # And ensure nothing was written to disk under static/uploads.
    written = os.path.join(os.getcwd(), "static", "uploads")
    if os.path.isdir(written):
        names = [n for n in os.listdir(written) if "attachment.pdf" in n]
        assert names == [], (
            f"upload_file wrote to disk despite refusing the request: {names}"
        )


# ─── Static file route refuses to serve in prod ────────────────────────────


async def test_static_route_410_in_prod(monkeypatch):
    """
    /static/{path} must return 410 Gone in prod even when a file exists
    on the local disk (legacy data). Forces operators to migrate.
    """
    import httpx
    from app.core import config as cfg_mod
    from app.main import app

    monkeypatch.setattr(cfg_mod.settings, "ENVIRONMENT", "prod")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/static/uploads/anything.jpg")
    assert r.status_code == 410, r.text
