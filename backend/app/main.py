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
from app.api.routes.transport import router as transport_router
from app.api.routes.notifications import router as notifications_router
from app.api.routes.finance import router as finance_router
from app.api.routes.question_bank import router as question_bank_router
from app.api.routes.lesson_plan import router as lesson_plan_router
from app.api.routes.uploaded_files import router as uploaded_files_router
from app.api.routes.documents import router as documents_router
from app.api.routes.parents import router as parents_router
from app.api.routes.reports import router as reports_router
from app.api.routes.system import router as system_router
from app.api.routes.timetable import router as timetable_router
from app.api.routes.teacher_attendance import router as teacher_attendance_router

# Initialize Logging
logger = setup_logging()

app = FastAPI(title=settings.APP_NAME, version=settings.VERSION)

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

# ✅ NEW: Add security headers middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add important security headers to all responses"""
    response = await call_next(request)


    
    # Prevent MIME type sniffing
    response.headers["X-Content-Type-Options"] = "nosniff"
    
    # Prevent clickjacking (Allow SAMEORIGIN for PDF previews)
    response.headers["X-Frame-Options"] = "SAMEORIGIN"

    
    # Prevent XSS
    response.headers["X-XSS-Protection"] = "1; mode=block"
    
    # Enforce HTTPS
    if settings.ENVIRONMENT == "prod":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    
    # Reference policy
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    
    return response

# ✅ FIXED: Explicit origins, methods, and headers based on environment
cors_origins = [
    settings.FRONTEND_URL,
]

# Add localhost origins for development only
if settings.ENVIRONMENT != "prod":
    cors_origins.extend([
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://localhost:8081",
    ])

# Support for mobile/LAN development: Allow all subdomains of localhost if needed,
# but for standard dev, explicit list is safer with credentials.
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins if settings.ENVIRONMENT == "prod" else ["*"] if not cors_origins else cors_origins,
    allow_credentials=True, 
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)




# Database Exception Handler
@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    logger.error(f"Database error on {request.url.path}: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={
            "detail": "A database operation failed. Please try again or contact support.",
            "internal_error": str(exc) if settings.ENVIRONMENT != "prod" else None
        }
    )


# Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    error_msg = traceback.format_exc()
    logger.critical(f"UNHANDLED SYSTEM EXCEPTION on {request.url.path}: {error_msg}")
    is_prod = settings.ENVIRONMENT == "prod"
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An unexpected system error occurred. Our team has been notified.",
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

# Ensure static directories exist
os.makedirs("static/uploads", exist_ok=True)

# ✅ Custom static file route — replaces app.mount so CORS headers are applied.
# FastAPI's StaticFiles sub-app bypasses CORSMiddleware entirely, causing
# "Origin not allowed" errors when the frontend fetches uploaded attachments.
@app.get("/static/{file_path:path}", include_in_schema=False)
async def serve_static(file_path: str):
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
app.include_router(transport_router)
app.include_router(notifications_router)
app.include_router(finance_router)
app.include_router(question_bank_router)
app.include_router(lesson_plan_router)
app.include_router(uploaded_files_router)
app.include_router(documents_router)
app.include_router(parents_router)
app.include_router(reports_router)
app.include_router(system_router)
app.include_router(timetable_router)
app.include_router(teacher_attendance_router)

@app.get("/")
async def read_root():
    return {"message": f"Welcome to the {settings.APP_NAME} Backend"}
