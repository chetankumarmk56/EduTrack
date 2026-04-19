from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
import traceback
import logging

from app.core.config import settings
from app.core.database import engine, get_db
from app.core.logger import setup_logging
from app.models import Base

# Modular Routers
from app.modules.auth.routes import router as auth_router
from app.modules.admin.routes import router as admin_router
from app.modules.directory.routes import router as directory_router
from app.modules.attendance.routes import router as attendance_router
from app.modules.marks.routes import router as marks_router
from app.modules.events.routes import router as events_router
from app.modules.announcements.routes import router as announcements_router
from app.modules.academic.routes import router as academic_router
from app.modules.transport.routes import router as transport_router

# Initialize Logging
logger = setup_logging()

app = FastAPI(title=settings.APP_NAME, version=settings.VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL] if settings.ENVIRONMENT == "prod" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_msg = traceback.format_exc()
    logger.critical(f"UNHANDLED SYSTEM EXCEPTION on {request.url.path}: {error_msg}")
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal Server Error", 
            "error_type": type(exc).__name__,
            "message": str(exc)
        },
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*"
        }
    )

# --- System Status Endpoints ---

@app.get("/health", tags=["system"])
async def health_check():
    """Liveness probe: Simple status check."""
    return {"status": "ok", "environment": settings.ENVIRONMENT}

@app.get("/ready", tags=["system"])
async def readiness_check(db: Session = Depends(get_db)):
    """Readiness probe: Validates database connectivity."""
    try:
        # Minimal query to check DB liveness
        db.execute(text("SELECT 1"))
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
app.include_router(directory_router)
app.include_router(attendance_router)
app.include_router(marks_router)
app.include_router(events_router)
app.include_router(announcements_router)
app.include_router(academic_router)
app.include_router(transport_router)

@app.get("/")
async def read_root():
    return {"message": f"Welcome to the {settings.APP_NAME} Backend"}
