from fastapi import FastAPI, Request, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
from app.api.routes.ai import router as ai_router
from app.api.routes.documents import router as documents_router
from app.api.routes.parents import router as parents_router
from app.api.routes.reports import router as reports_router
from app.api.routes.system import router as system_router

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
    
    # Prevent clickjacking
    response.headers["X-Frame-Options"] = "DENY"
    
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
    ])

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],  # ✅ Explicit methods
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-Institution-Id",
        "X-Portal-Role"
    ],  # ✅ Explicit headers
    expose_headers=["Content-Type"],
    max_age=600,  # Cache preflight for 10 minutes
)

# Database Exception Handler
@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    logger.error(f"Database error on {request.url.path}: {str(exc)}")
    headers = {
        "Access-Control-Allow-Origin": request.headers.get("origin", "*"),
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*"
    }
    return JSONResponse(
        status_code=500,
        content={
            "detail": "A database operation failed. Please try again or contact support.",
            "internal_error": str(exc) if settings.ENVIRONMENT != "prod" else None
        },
        headers=headers
    )

# Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    error_msg = traceback.format_exc()
    logger.critical(f"UNHANDLED SYSTEM EXCEPTION on {request.url.path}: {error_msg}")
    headers = {
        "Access-Control-Allow-Origin": request.headers.get("origin", "*"),
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*"
    }
    
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An unexpected system error occurred. Our team has been notified.", 
            "error_type": type(exc).__name__,
            "internal_error": str(exc) if settings.ENVIRONMENT != "prod" else None
        },
        headers=headers
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
app.include_router(ai_router)
app.include_router(documents_router)
app.include_router(parents_router)
app.include_router(reports_router)
app.include_router(system_router)

@app.get("/")
async def read_root():
    return {"message": f"Welcome to the {settings.APP_NAME} Backend"}
