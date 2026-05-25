"""
Verifies the gunicorn config used in prod:

* Uses UvicornWorker (so async handlers actually run async).
* Respects ``WEB_CONCURRENCY`` env override.
* Falls back to a sane CPU-derived default, capped so a 16-vCPU
  builder doesn't try to spawn 33 workers in a 1 GB Render box.
* Honours proxy headers — without this, rate limits would collapse to
  the load-balancer IP.
* Dockerfile + render.yaml actually invoke gunicorn (catches the
  "config exists but nothing references it" regression).

These are config-shape tests; we don't actually launch gunicorn here.
The shape guarantees are what gets us safely past `git push`.
"""
import importlib
import importlib.util
import os
import re
import sys

import pytest

sys.path.append(os.getcwd())


def _load_conf():
    """Re-import the conf module fresh each time so env tweaks take effect."""
    sys.modules.pop("gunicorn_conf", None)
    spec = importlib.util.spec_from_file_location(
        "gunicorn_conf",
        os.path.join(os.getcwd(), "gunicorn_conf.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ─── Worker-class + proxy-header guarantees ──────────────────────────────


def test_worker_class_is_uvicorn():
    """
    Without UvicornWorker, gunicorn would treat the ASGI app as WSGI and
    every async handler would deadlock. Hard requirement.
    """
    conf = _load_conf()
    assert conf.worker_class == "uvicorn.workers.UvicornWorker"


def test_proxy_headers_allowed_for_all():
    """
    Behind nginx / Render edge / CloudFront the client IP is in the
    X-Forwarded-For header. Without forwarded_allow_ips='*' gunicorn
    would refuse to read it and the rate limiter would key on the
    proxy's IP — trivially defeated by a single attacker.
    """
    conf = _load_conf()
    assert conf.forwarded_allow_ips == "*"


# ─── Worker-count resolution ──────────────────────────────────────────────


def test_web_concurrency_env_override(monkeypatch):
    monkeypatch.setenv("WEB_CONCURRENCY", "5")
    conf = _load_conf()
    assert conf.workers == 5


def test_web_concurrency_invalid_falls_back_to_default(monkeypatch):
    """A typo in the env var must not crash startup — fall back to default."""
    monkeypatch.setenv("WEB_CONCURRENCY", "not-a-number")
    conf = _load_conf()
    # Resolved via the CPU-derived formula; just assert it's a positive int.
    assert isinstance(conf.workers, int)
    assert conf.workers >= 2


def test_default_workers_capped_at_8(monkeypatch):
    """
    On a beefy build host the worker count must NOT explode unbounded —
    each worker is ~150 MB and we want to fit in a 1 GB container.
    """
    monkeypatch.delenv("WEB_CONCURRENCY", raising=False)
    import multiprocessing
    monkeypatch.setattr(multiprocessing, "cpu_count", lambda: 16)
    conf = _load_conf()
    assert conf.workers <= 8, f"expected cap at 8, got {conf.workers}"


def test_default_workers_minimum_2(monkeypatch):
    """
    A 1-vCPU box (Render Free, t2.micro) should still get >= 2 workers
    so a single bcrypt-stalled worker doesn't take the whole service down.
    """
    monkeypatch.delenv("WEB_CONCURRENCY", raising=False)
    import multiprocessing
    monkeypatch.setattr(multiprocessing, "cpu_count", lambda: 1)
    conf = _load_conf()
    assert conf.workers >= 2


# ─── Deploy artefacts actually use gunicorn ──────────────────────────────


def test_dockerfile_invokes_gunicorn():
    """Dockerfile CMD must call gunicorn, not bare uvicorn."""
    with open(os.path.join(os.getcwd(), "Dockerfile")) as fh:
        content = fh.read()
    # Find the last CMD line (Docker's effective CMD).
    cmd_lines = re.findall(r"^\s*CMD\b.*$", content, re.MULTILINE)
    assert cmd_lines, "Dockerfile has no CMD instruction"
    last_cmd = cmd_lines[-1]
    assert "gunicorn" in last_cmd, (
        f"Dockerfile CMD does not use gunicorn: {last_cmd}"
    )
    assert "gunicorn_conf.py" in last_cmd, (
        "Dockerfile CMD must point at gunicorn_conf.py so worker count, "
        "timeouts, and proxy-header config aren't accidentally lost."
    )


def test_render_yaml_invokes_gunicorn():
    """render.yaml startCommand must call gunicorn."""
    render_yaml_path = os.path.join(
        os.path.dirname(os.getcwd()), "render.yaml"
    )
    if not os.path.exists(render_yaml_path):
        # Repo-root layout may differ in CI; skip rather than false-fail.
        pytest.skip("render.yaml not found at repo root")
    with open(render_yaml_path) as fh:
        content = fh.read()
    assert "gunicorn -c gunicorn_conf.py" in content, (
        "render.yaml startCommand must use the shared gunicorn config so "
        "prod doesn't drift from local docker-compose."
    )


# ─── Lifespan-friendly settings ──────────────────────────────────────────


def test_timeout_long_enough_for_uploads():
    """Default gunicorn timeout is 30s; we need more for 25 MB uploads
    on slow client connections."""
    conf = _load_conf()
    assert conf.timeout >= 60


def test_graceful_timeout_present():
    """Graceful shutdown window so SIGTERM doesn't kill mid-request."""
    conf = _load_conf()
    assert conf.graceful_timeout >= 15
