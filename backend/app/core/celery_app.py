from celery import Celery
from app.core.config import settings

from celery.schedules import crontab

# Initialize Celery app
celery_app = Celery(
    "edutrack_tasks",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.reporting", "app.tasks.finance"] # Ensure tasks are discovered
)

# Optional configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600, # 1 hour max
    beat_schedule={
        "daily-fee-reminder": {
            "task": "daily_fee_reminder",
            "schedule": crontab(hour=8, minute=0), # Run every day at 8:00 AM UTC
        },
    },
)

"""
Background Job Architecture:
---------------------------
We use Celery with Redis to offload heavy operations from the main FastAPI event loop. 
This ensures the API remains responsive (sub-100ms) even during expensive tasks
like bulk report generation.

How to run:
1. Start Redis server
2. Start FastAPI: uvicorn app.main:app --reload
3. Start Celery: celery -A app.core.celery_app worker --loglevel=info
"""
