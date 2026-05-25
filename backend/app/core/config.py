import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from typing import Optional

class Settings(BaseSettings):
    """
    Centralized configuration management for EduTrack.
    Uses pydantic-settings for robust environment variable handling.
    """
    # General
    APP_NAME: str = "EduTrack SaaS"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    ENVIRONMENT: str = "dev" # dev, prod, test
    
    # Database
    # Must be provided via environment (e.g. postgresql://user:pass@host:port/db)
    DATABASE_URL: str
    
    # Security (using standard field names with env aliases)
    # ✅ CRITICAL FIX: No default SECRET_KEY - must be provided via environment variable
    SECRET_KEY: str = Field(
        ...,  # Makes it REQUIRED - no default!
        min_length=32,
        description="Must be set via SECRET_KEY environment variable. Generate with: python -c 'import secrets; print(secrets.token_urlsafe(32))'"
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours in dev (was 60 min)
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30      # 30 days
    COOKIE_SECURE: bool = False              # False for HTTP (localhost dev), True for HTTPS prod
    
    # Auth Aliases for compatibility
    JWT_SECRET: Optional[str] = None
    JWT_ALGORITHM: Optional[str] = None
    
    # AI (Optional) — used by Question Bank only. Lesson plan generation
    # lives in an external microservice; this codebase never calls it.
    GOOGLE_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o-mini"

    # External Lesson Plan AI microservice
    # POST {LESSON_PLAN_AI_SERVICE_URL} receives the metadata JSON and
    # S3 output key; the service writes output/lesson_plan.json to S3
    # and returns only after the file is saved.
    LESSON_PLAN_AI_SERVICE_URL: Optional[str] = None
    # Seconds to wait for the AI service (generation can take minutes).
    LESSON_PLAN_AI_SERVICE_TIMEOUT: float = 300.0

    # External Question Bank AI microservice (same service as Lesson Plan).
    # The microservice routes by ``type`` in the request body. Leave unset
    # to reuse LESSON_PLAN_AI_SERVICE_URL; set to a different URL only if
    # you've split the deployments.
    QUESTION_BANK_AI_SERVICE_URL: Optional[str] = None
    QUESTION_BANK_AI_SERVICE_TIMEOUT: float = 300.0

    # Cloudinary (File Storage)
    CLOUDINARY_CLOUD_NAME: Optional[str] = None
    CLOUDINARY_API_KEY: Optional[str] = None
    CLOUDINARY_API_SECRET: Optional[str] = None

    # AWS S3 (private teacher uploads — falls back to local disk if unset)
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_S3_REGION: Optional[str] = None
    AWS_S3_BUCKET: Optional[str] = None
    AWS_S3_PRESIGN_TTL: int = 900  # seconds (15 min)
    
    # Razorpay
    RAZORPAY_KEY_ID: Optional[str] = "rzp_test_placeholder"
    RAZORPAY_KEY_SECRET: Optional[str] = "placeholder_secret"
    RAZORPAY_WEBHOOK_SECRET: Optional[str] = "placeholder_webhook_secret"
    
    # Redis (rate limiting + future pub/sub for websockets / queues).
    # When unset, slowapi runs with an in-memory counter — fine for a
    # single-instance dev box, NOT fine for multi-replica prod.
    REDIS_URL: Optional[str] = None

    # Shared secret used by external cron jobs (Render Cron / EventBridge /
    # GitHub Actions) to authenticate against /api/finance/fee-reminders/dispatch
    # without holding a JWT. Send via `X-Cron-Secret` header. Leave unset to
    # disable secret-based access (admin JWT still works).
    CRON_SECRET: Optional[str] = None

    # Observability. Default to JSON in prod so log aggregators (Datadog,
    # CloudWatch, Better Stack) can parse fields; default to human-readable
    # in dev for terminal grep-ability. Set LOG_JSON=true to force JSON
    # locally (useful when debugging the formatter itself).
    LOG_JSON: Optional[bool] = None  # None = auto: True in prod, False in dev
    # Sentry DSN. Leave unset to disable Sentry — the SDK is imported
    # lazily so unconfigured deploys don't pay the cost. Set the DSN in
    # production for error aggregation + release tracking.
    SENTRY_DSN: Optional[str] = None
    SENTRY_TRACES_SAMPLE_RATE: float = 0.0  # 0.0 = error-tracking only, no perf

    # Frontend
    FRONTEND_URL: str = "http://localhost:5173"
    # Optional comma-separated extra origins (e.g. "https://app.example.com,https://admin.example.com")
    ADDITIONAL_CORS_ORIGINS: str = ""
    COOKIE_DOMAIN: str = Field(
        default="",
        description="Cookie domain for production, e.g. '.yourdomain.com' (leading dot for subdomains)"
    )
    
    # Infrastructure
    PORT: int = 8000

    # Twilio Voice Configuration
    # All four must be set for outbound calls to actually dispatch. When any
    # is missing, CallService.trigger_call no-ops with a warning instead of
    # raising, so non-prod environments can run without Twilio creds.
    TWILIO_ACCOUNT_SID: Optional[str] = None
    TWILIO_AUTH_TOKEN: Optional[str] = None
    TWILIO_FROM_NUMBER: Optional[str] = None  # E.164, e.g. "+14155551234"
    # Optional override; defaults to the public Twilio REST API host.
    TWILIO_API_BASE_URL: str = "https://api.twilio.com"
    # Per-attempt HTTP timeout for Twilio API calls (seconds).
    TWILIO_REQUEST_TIMEOUT_SECONDS: float = 10.0
    # Total retry attempts (including the first try) for transient failures.
    TWILIO_MAX_RETRIES: int = 3
    # Initial backoff in seconds; doubles on each retry.
    TWILIO_RETRY_BACKOFF_SECONDS: float = 1.0
    # Default TTS voice for inline TwiML. See Twilio <Say> voice options.
    TWILIO_TTS_VOICE: str = "alice"
    TWILIO_TTS_LANGUAGE: str = "en-IN"

    # Expo Push Notifications
    # Optional: only required when you've enabled "Enhanced Push Security" in
    # the Expo dashboard. Without it, https://exp.host/--/api/v2/push/send
    # accepts unauthenticated requests, which is fine for dev. In production
    # set EXPO_ACCESS_TOKEN to a long-lived token from Expo so that abuse
    # by anyone who fetches a parent's token gets blocked at the source.
    EXPO_ACCESS_TOKEN: Optional[str] = None
    EXPO_PUSH_URL: str = "https://exp.host/--/api/v2/push/send"
    # Hard cap so a runaway dispatch can't tie up the worker indefinitely.
    EXPO_REQUEST_TIMEOUT_SECONDS: float = 15.0
    # Expo accepts up to 100 messages per request; we keep some headroom.
    EXPO_BATCH_SIZE: int = 90

    # Fee Reminder Scheduler
    # Day-of-week / time gating happens in the configured timezone. Defaults
    # to Asia/Kolkata since the product is India-first (Razorpay, INR copy).
    FEE_REMINDER_TIMEZONE: str = "Asia/Kolkata"
    # "More than a week overdue" — anything strictly greater than this many
    # days is eligible for reminders. Stored as int days so it's easy to
    # tune without code changes.
    FEE_REMINDER_OVERDUE_DAYS: int = 7
    # Cooldown between reminders to the same StudentFee row, in days. We
    # use 6 not 7 so a Wednesday-after-DST or a single re-trigger doesn't
    # accidentally skip a week.
    FEE_REMINDER_COOLDOWN_DAYS: int = 6
    # Whether to spin up the in-process Wednesday scheduler on startup.
    # Set to false when an external cron drives the dispatch endpoint
    # instead, or when running ad-hoc scripts/tests.
    FEE_REMINDER_SCHEDULER_ENABLED: bool = True
    # 24-hour clock — when in the day the reminder should fire on Wednesdays.
    FEE_REMINDER_SEND_HOUR: int = 9
    # Whether to additionally place a voice call (via Twilio) to the parent's
    # phone alongside the push. When Twilio creds are missing the orchestrator
    # already no-ops, so this flag is mostly for ops/cost control.
    FEE_REMINDER_VOICE_CALLS_ENABLED: bool = True
    
    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"),
        extra="ignore"
    )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Validate SECRET_KEY length at runtime
        if len(self.SECRET_KEY) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long. Generate with: python -c 'import secrets; print(secrets.token_urlsafe(32))'")

        # Handle aliases manual override if provided in env
        if self.JWT_SECRET:
            self.SECRET_KEY = self.JWT_SECRET
        if self.JWT_ALGORITHM:
            self.ALGORITHM = self.JWT_ALGORITHM

        # Production hardening: fail fast if critical credentials are placeholders
        if self.ENVIRONMENT == "prod":
            placeholder_values = {
                "RAZORPAY_KEY_ID": ("rzp_test_placeholder", self.RAZORPAY_KEY_ID),
                "RAZORPAY_KEY_SECRET": ("placeholder_secret", self.RAZORPAY_KEY_SECRET),
                "RAZORPAY_WEBHOOK_SECRET": ("placeholder_webhook_secret", self.RAZORPAY_WEBHOOK_SECRET),
            }
            unset = [name for name, (placeholder, value) in placeholder_values.items() if not value or value == placeholder]
            if unset:
                raise ValueError(
                    f"Production startup blocked: the following Razorpay credentials are unset or use placeholder values: {unset}. "
                    "Set them via environment variables before starting in production."
                )

            # ── Production storage: at least one remote backend MUST be set ──
            # Two upload surfaces:
            #   1. Teacher file library  → AWS S3        (storage/factory.py)
            #   2. Announcement attachments → Cloudinary (storage_service.py)
            # If neither is configured, every upload silently writes to the
            # container's local disk — which is ephemeral on Render/Fly/Heroku
            # and unreachable across replicas. We hard-fail on startup so the
            # operator sees the problem at deploy time instead of when a parent
            # opens a broken attachment two days later.
            s3_configured = bool(self.AWS_S3_BUCKET and self.AWS_S3_REGION)
            cloudinary_configured = bool(
                self.CLOUDINARY_CLOUD_NAME
                and self.CLOUDINARY_API_KEY
                and self.CLOUDINARY_API_SECRET
            )
            if not s3_configured:
                raise ValueError(
                    "Production startup blocked: AWS S3 is not configured "
                    "(AWS_S3_BUCKET + AWS_S3_REGION + AWS_ACCESS_KEY_ID + "
                    "AWS_SECRET_ACCESS_KEY required). The teacher file library "
                    "would otherwise write to ephemeral container disk."
                )
            if not cloudinary_configured:
                raise ValueError(
                    "Production startup blocked: Cloudinary is not configured "
                    "(CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + "
                    "CLOUDINARY_API_SECRET required). Announcement attachments "
                    "would otherwise write to ephemeral container disk."
                )

            # Warn (non-fatal) when FRONTEND_URL still looks like dev.
            import warnings
            if not self.FRONTEND_URL or "localhost" in self.FRONTEND_URL:
                warnings.warn(
                    f"FRONTEND_URL='{self.FRONTEND_URL}' looks wrong for production. "
                    "Browsers will block API calls from the real frontend due to CORS."
                )

            # Force secure cookies in production (overrides any .env override)
            self.COOKIE_SECURE = True

settings = Settings()
