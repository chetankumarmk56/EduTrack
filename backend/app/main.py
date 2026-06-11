from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
import traceback
import logging

from app.core.config import settings
from app.core.database import engine, get_db
from app.core.logger import setup_logging
from app.core.limiter import limiter  # ✅ NEW: Rate limiter
from slowapi.errors import RateLimitExceeded  # ✅ NEW: Rate limit error
from app import models
from app.core.database import Base

import os

# Modular Routers

from app.api.routes.auth import router as auth_router
from app.api.routes.admin import router as admin_router
from app.api.routes.students import router as students_router
from app.api.routes.teachers import router as teachers_router
from app.api.routes.attendance import router as attendance_router
from app.api.routes.marks import router as marks_router
from app.api.routes.events import router as events_router
from app.api.routes.announcements import router as announcements_router
from app.api.routes.academic import router as academic_router
from app.api.routes.finance import router as finance_router
from app.api.routes.manual_payment import router as manual_payment_router
# Question Bank + Lesson Plan now live in the self-contained AI package
# (backend/AI). See AI/README.md for the microservice-extraction guide.
from AI import question_bank_router, lesson_plan_router
from app.api.routes.uploaded_files import router as uploaded_files_router
from app.api.routes.documents import router as documents_router
from app.api.routes.reports import router as reports_router
from app.api.routes.system import router as system_router
from app.api.routes.timetable import router as timetable_router
from app.api.routes.teacher_attendance import router as teacher_attendance_router
from app.api.routes.devices import router as devices_router

# Initialize Logging
logger = setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan hook:

    * Starts the websocket Redis broadcaster so cross-pod fan-out works
      from the first request.
    * Starts the in-process Wednesday fee-reminder scheduler when
      FEE_REMINDER_SCHEDULER_ENABLED is true. In production the scheduler
      should run from a dedicated cron/worker, not from the web replicas
      (set the flag to false in render.yaml / docker-compose).

    Each component is started/stopped independently so a slow Redis ping
    can't take down the whole process.
    """
    from app.services.finance.fee_reminder_scheduler import start_scheduler, stop_scheduler
    from app.core.websocket import broadcaster
    from app.core.security import assert_jwt_roundtrip

    # Fail fast if the SECRET_KEY cannot round-trip a JWT.  This catches the
    # most common production misconfiguration (key mismatch / whitespace) at
    # startup rather than on the first real authenticated request.
    assert_jwt_roundtrip()
    logger.info(
        "JWT round-trip OK — SECRET_KEY prefix=%s... algorithm=%s",
        settings.SECRET_KEY[:6],
        settings.ALGORITHM,
    )

    await broadcaster.start()
    start_scheduler()
    try:
        yield
    finally:
        await stop_scheduler()
        await broadcaster.stop()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
    docs_url="/docs" if settings.ENVIRONMENT != "prod" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "prod" else None,
    openapi_url="/openapi.json" if settings.ENVIRONMENT != "prod" else None,
)

# ✅ NEW: Register rate limiter with app
app.state.limiter = limiter

# ✅ NEW: Register rate limit error handler
@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Too many requests. Please try again later.",
            "retry_after": "60"
        },
    )

# Content Security Policy. Bounds the blast radius if an XSS slips
# through: even a successful injection can't load attacker-controlled
# scripts or exfiltrate to arbitrary domains. The web SPA's tokens are
# already HttpOnly (see auth_service.set_auth_cookies); CSP is the
# matching defense at the rendering layer.
#
# Rationale for each directive:
#   * default-src 'self'  → unknown resource types fall back to same-origin only.
#   * script-src 'self'   → only scripts served by the API host; no eval.
#                            If you bundle inline Vite scripts add 'unsafe-inline'
#                            (acceptable trade — CSP still blocks remote injection).
#   * style-src 'self' 'unsafe-inline' → Tailwind compiles to a single sheet
#                            but utility classes are sometimes inlined.
#   * img-src 'self' data: blob: https:  → Cloudinary / S3 thumbnails.
#   * connect-src 'self' wss: https:     → API calls + future websockets.
#   * frame-ancestors 'self' → modern replacement for X-Frame-Options.
#   * object-src 'none'   → block <object>/<embed> which can host plugins.
#   * base-uri 'self'     → stops <base> tag hijacking.
#   * form-action 'self'  → forms can only post back to the API host.
#
# When you move uploaded files behind a CDN domain, add that host to
# img-src / connect-src.
_CSP_HEADER = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob: https:; "
    "font-src 'self' data:; "
    "connect-src 'self' https: wss:; "
    "frame-ancestors 'self'; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "form-action 'self'"
)


# Request-ID + structured-logging contextvar binding.
#
# This middleware runs FIRST (registered later → executes earlier in the
# Starlette LIFO chain) so every log line emitted while handling a
# request — including ones from deeper middleware like CORS or
# security-headers — carries the correlation ID.
#
# Accepts an inbound X-Request-Id from upstream (Render edge / nginx /
# CloudFront set this) so traces stitch end-to-end. Falls back to a
# fresh UUID when absent. Either way the value is echoed in the
# X-Request-Id response header so clients can quote it in bug reports.
@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    from uuid import uuid4
    from app.core.logger import request_id_ctx, request_method_ctx, request_path_ctx

    incoming = request.headers.get("X-Request-Id")
    # Use the incoming ID only if it looks like a reasonable identifier
    # — limit length + alphabet so a malicious client can't blow up our
    # log lines with megabyte tokens.
    if incoming and len(incoming) <= 64 and all(
        c.isalnum() or c in "-_" for c in incoming
    ):
        request_id = incoming
    else:
        request_id = uuid4().hex

    # Pin to the request as well as the contextvar. BaseHTTPMiddleware
    # in Starlette spawns the downstream app in a child anyio task; the
    # contextvar copy normally propagates, but the global exception
    # handler runs in a different task context where the ctx-var may be
    # back to its default. request.state is reliably visible to the
    # handler because it gets the same Request instance.
    request.state.request_id = request_id

    rid_token = request_id_ctx.set(request_id)
    method_token = request_method_ctx.set(request.method)
    path_token = request_path_ctx.set(request.url.path)
    try:
        response = await call_next(request)
    finally:
        request_id_ctx.reset(rid_token)
        request_method_ctx.reset(method_token)
        request_path_ctx.reset(path_token)

    response.headers["X-Request-Id"] = request_id
    return response


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Apply security headers to every response."""
    response = await call_next(request)

    # MIME type sniffing
    response.headers["X-Content-Type-Options"] = "nosniff"
    # Clickjacking (legacy; CSP frame-ancestors is the modern equivalent)
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    # Legacy XSS auditor (modern browsers ignore but no harm)
    response.headers["X-XSS-Protection"] = "1; mode=block"
    # HSTS in production only — would break local HTTP dev
    if settings.ENVIRONMENT == "prod":
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains; preload"
        )
    # Referrer scrubbing
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # Content-Security-Policy — bounds XSS impact. See _CSP_HEADER above.
    # Don't apply to /docs and /redoc — Swagger UI needs unsafe-inline scripts.
    if not request.url.path.startswith(("/docs", "/redoc", "/openapi.json")):
        response.headers["Content-Security-Policy"] = _CSP_HEADER

    return response

# ✅ FIXED: Explicit origins, methods, and headers based on environment
cors_origins = [settings.FRONTEND_URL]

# Append any additional origins from env (comma-separated)
if settings.ADDITIONAL_CORS_ORIGINS:
    cors_origins.extend(
        origin.strip()
        for origin in settings.ADDITIONAL_CORS_ORIGINS.split(",")
        if origin.strip()
    )

# Add localhost origins for development only
if settings.ENVIRONMENT != "prod":
    cors_origins.extend([
        "http://localhost",
        "http://127.0.0.1",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://localhost:8081",
    ])

# De-duplicate while preserving order. Never fall back to "*" — it's incompatible
# with allow_credentials=True and browsers reject the response.
cors_origins = list(dict.fromkeys(o for o in cors_origins if o))

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)




def _resolve_request_id(request: Request) -> str | None:
    """
    Prefer the request.state copy (always pinned by the middleware on
    the same Request instance the handler receives) over the contextvar
    (which may have been reset by the time Starlette's exception
    handler runs in a different task context).
    """
    from app.core.logger import request_id_ctx
    rid = getattr(request.state, "request_id", None)
    if rid:
        return rid
    return request_id_ctx.get()


# Database Exception Handler
@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    logger.error(
        "Database error",
        extra={"path": request.url.path, "error": str(exc)},
    )
    rid = _resolve_request_id(request)
    # Starlette's ExceptionMiddleware short-circuits the response back to
    # the client BEFORE the user middleware chain unwinds, so we have to
    # stamp X-Request-Id here too — the request_id_middleware won't get
    # a chance to mutate this response.
    headers = {"X-Request-Id": rid} if rid else {}
    return JSONResponse(
        status_code=500,
        headers=headers,
        content={
            "detail": "A database operation failed. Please try again or contact support.",
            "request_id": rid,
            "internal_error": str(exc) if settings.ENVIRONMENT != "prod" else None
        }
    )


# Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # logger.exception captures the full traceback into the JSON
    # formatter's `exc` field — no need to call traceback.format_exc.
    logger.exception("UNHANDLED_SYSTEM_EXCEPTION", extra={"path": request.url.path})
    is_prod = settings.ENVIRONMENT == "prod"
    rid = _resolve_request_id(request)
    # See sqlalchemy_exception_handler above for why we stamp the
    # X-Request-Id header here directly.
    headers = {"X-Request-Id": rid} if rid else {}
    return JSONResponse(
        status_code=500,
        headers=headers,
        content={
            "detail": "An unexpected system error occurred. Our team has been notified.",
            # The request_id lets a user quote a single tag in a bug
            # report; we can grep all log lines for that ID and replay
            # what happened.
            "request_id": rid,
            "error_type": None if is_prod else type(exc).__name__,
            "internal_error": None if is_prod else str(exc),
        }
    )


# --- System Status Endpoints ---

@app.get("/health", tags=["system"])
async def health_check():
    """Liveness probe: Simple status check."""
    return {"status": "ok", "environment": settings.ENVIRONMENT}

@app.get("/ready", tags=["system"])
async def readiness_check(db: AsyncSession = Depends(get_db)):
    """Readiness probe: Validates database connectivity."""
    try:
        # Minimal query to check DB liveness
        await db.execute(text("SELECT 1"))
        return {"status": "ready", "database": "connected"}
    except Exception as e:
        logger.error(f"Readiness check failed: {str(e)}")
        raise HTTPException(status_code=503, detail="Database connectivity failure")

@app.get("/version", tags=["system"])
async def version_info():
    """Returns application name and version metadata."""
    return {
        "app": settings.APP_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT
    }

# Only create the static dir in dev. In prod, all uploads go to S3
# (enforced by config.py startup check + storage_service guard);
# the directory existing would only invite accidental writes.
if settings.ENVIRONMENT != "prod":
    os.makedirs("static/uploads", exist_ok=True)


# Static file route — DEV / TEST ONLY. Production uploads live in S3
# and are fetched via short-lived presigned URLs, bypassing the API
# replicas entirely. Serving files through this handler in prod would
# (a) tie up ASGI workers on file I/O, and (b) 404 silently because the
# file lives on a different replica's ephemeral disk. We refuse early
# with a 410 Gone so misconfigured deployments are visible in
# monitoring, not just experienced as broken downloads by users.
@app.get("/static/{file_path:path}", include_in_schema=False)
async def serve_static(file_path: str):
    if settings.ENVIRONMENT == "prod":
        # 410 Gone (not 404) — semantically: "this URL was valid once,
        # the file is now in a different storage tier". Clients should
        # treat it as a hard failure and refetch the canonical URL.
        raise HTTPException(
            status_code=410,
            detail=(
                "Local file serving is disabled in production. "
                "Files are now served from object storage via signed URLs."
            ),
        )
    full_path = os.path.join("static", file_path)
    if not os.path.exists(full_path) or os.path.isdir(full_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        full_path,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Expose-Headers": "*",
        }
    )

# Router Registrations

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(students_router)
app.include_router(teachers_router)
app.include_router(attendance_router)
app.include_router(marks_router)
app.include_router(events_router)
app.include_router(announcements_router)
app.include_router(academic_router)
app.include_router(finance_router)
app.include_router(manual_payment_router)
app.include_router(question_bank_router)
app.include_router(lesson_plan_router)
app.include_router(uploaded_files_router)
app.include_router(documents_router)
app.include_router(reports_router)
app.include_router(system_router)
app.include_router(timetable_router)
app.include_router(teacher_attendance_router)
app.include_router(devices_router)

@app.get("/")
async def read_root():
    return {"message": f"Welcome to the {settings.APP_NAME} Backend"}
