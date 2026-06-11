import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from typing import Optional

class Settings(BaseSettings):
    """
    Centralized configuration management for ArkenEdu.
    Uses pydantic-settings for robust environment variable handling.
    """
    # General
    APP_NAME: str = "ArkenEdu"
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
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60   # 60 minutes; override via env for dev convenience
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30      # 30 days
    COOKIE_SECURE: bool = False              # False for HTTP (localhost dev), True for HTTPS prod
    
    # Auth Aliases for compatibility
    JWT_SECRET: Optional[str] = None
    JWT_ALGORITHM: Optional[str] = None
    
    # AI — Question Bank + Lesson Plan generation. Both now run IN-PROCESS
    # inside the ``backend/AI`` package; no external microservice is required.
    GOOGLE_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o-mini"  # legacy inline QB generator (topics + specs)

    # Models used by the in-process AI generators (backend/AI). Override per
    # deployment via env. The Question Bank generator sends the PDF to the
    # OpenAI Responses API; the Lesson Plan generator sends extracted chapter
    # text to Chat Completions.
    #
    # NOTE: both default to a REAL, GA OpenAI model. A previous default of
    # "gpt-5.5" (which does not exist on the API) caused Lesson Plan
    # generation to 502 on any deployment that did not explicitly set
    # LESSON_PLAN_OPENAI_MODEL in its environment.
    QUESTION_BANK_OPENAI_MODEL: str = "gpt-4o"
    LESSON_PLAN_OPENAI_MODEL: str = "gpt-4o"

    # Per-request timeout (seconds) for the IN-PROCESS OpenAI calls. Lesson
    # Plan generates a full class-by-class plan (one detailed object per
    # class), so its single completion is much larger/slower than Question
    # Bank's — give it generous headroom but still bound it so a stuck call
    # can't hold a worker for the OpenAI SDK's 600s default. Must stay BELOW
    # the gateway read timeouts (gunicorn `timeout`, nginx `proxy_read_timeout`)
    # so the backend fails cleanly instead of the proxy emitting a 504.
    LESSON_PLAN_OPENAI_TIMEOUT: float = 240.0
    QUESTION_BANK_OPENAI_TIMEOUT: float = 120.0

    # Per-tool OpenAI key overrides. The two source microservices each ran
    # with their own key, so the generators read a tool-specific key first
    # and fall back to the shared OPENAI_API_KEY when it is unset.
    QUESTION_BANK_OPENAI_API_KEY: Optional[str] = None
    LESSON_PLAN_OPENAI_API_KEY: Optional[str] = None

    # Optional external AI offload (microservice-ready seam). Generation runs
    # IN-PROCESS by default. The remote HTTP offload is only used when it is
    # BOTH explicitly enabled (AI_REMOTE_OFFLOAD_ENABLED=true) AND given a URL.
    #
    # This two-key requirement is deliberate: a leftover *_AI_SERVICE_URL in a
    # host's .env (e.g. an old ngrok/microservice tunnel from before the
    # in-process migration) must NOT silently re-route generation to a dead
    # endpoint. A dead/404 endpoint surfaces to the browser as 502 Bad Gateway.
    # See backend/AI/README.md.
    AI_REMOTE_OFFLOAD_ENABLED: bool = False
    LESSON_PLAN_AI_SERVICE_URL: Optional[str] = None
    # Seconds to wait for the remote AI service (generation can take minutes).
    LESSON_PLAN_AI_SERVICE_TIMEOUT: float = 300.0
    QUESTION_BANK_AI_SERVICE_URL: Optional[str] = None
    QUESTION_BANK_AI_SERVICE_TIMEOUT: float = 300.0

    # Cloudinary (legacy — kept only so old DB rows with cloudinary.com URLs
    # still resolve via resolve_url passthrough; no new uploads go here.
    # Safe to remove the env vars once no legacy URLs remain in the DB.)
    CLOUDINARY_CLOUD_NAME: Optional[str] = None
    CLOUDINARY_API_KEY: Optional[str] = None
    CLOUDINARY_API_SECRET: Optional[str] = None

    # AWS S3 (all uploads — teacher file library AND announcement / payment
    # shared uploads. Falls back to local disk in dev when unset.)
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_S3_REGION: Optional[str] = None
    AWS_S3_BUCKET: Optional[str] = None
    AWS_S3_PRESIGN_TTL: int = 3600  # seconds (1 hour)
    
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
    # Override the auth-cookie SameSite policy. Empty = auto: 'none' in prod
    # (for a frontend hosted on a *different site* than the API, e.g.
    # Vercel + Render) and 'lax' in dev.
    #
    # When the SPA and API share one registrable domain — e.g.
    # www.arkenedu.com (SPA) + api.arkenedu.com (API), which are *same-site* —
    # set this to 'lax'. Cookies still ride every same-site XHR, and Lax
    # additionally blocks the cross-site request forgery that 'none' permits.
    # Allowed values: 'lax' | 'strict' | 'none' (case-insensitive).
    COOKIE_SAMESITE: str = Field(
        default="",
        description="Auth cookie SameSite: 'lax' | 'strict' | 'none'. Empty = auto (none in prod, lax in dev).",
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
    # to Asia/Kolkata since the product is India-first (INR / UPI copy).
    FEE_REMINDER_TIMEZONE: str = "Asia/Kolkata"
    # "More than a week overdue" — anything strictly greater than this many
    # days is eligible for reminders. Stored as int days so it's easy to
    # tune without code changes.
    FEE_REMINDER_OVERDUE_DAYS: int = 7
    # Cooldown between reminders to the same StudentFee row, in days. We
    # use 6 not 7 so a Wednesday-after-DST or a single re-trigger doesn't
    # accidentally skip a week.
    FEE_REMINDER_COOLDOWN_DAYS: int = 6
    # Whether to spin up the in-process fee-reminder scheduler on startup.
    # Default: False — must be explicitly opted in.
    #
    # In a multi-worker Gunicorn setup every worker runs its own lifespan, so
    # setting this to True on all workers wastes DB connections on redundant
    # ticks.  The scheduler itself handles this with a tick-level leader
    # election (CronLock), but the cleaner operational approach is:
    #
    #   • Web workers  → FEE_REMINDER_SCHEDULER_ENABLED=false (default)
    #   • One dedicated container/systemd unit → FEE_REMINDER_SCHEDULER_ENABLED=true
    #
    # On a single-instance EC2 deploy you may enable it here; the leader
    # election ensures only one Gunicorn worker actually runs each tick.
    FEE_REMINDER_SCHEDULER_ENABLED: bool = False
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

        # Validate the optional SameSite override early so a typo fails at
        # startup instead of silently emitting a malformed Set-Cookie that
        # browsers drop (which would manifest as "logged in then 401").
        if self.COOKIE_SAMESITE:
            normalized = self.COOKIE_SAMESITE.strip().lower()
            if normalized not in ("lax", "strict", "none"):
                raise ValueError(
                    "COOKIE_SAMESITE must be one of 'lax', 'strict', 'none' "
                    f"(got {self.COOKIE_SAMESITE!r})."
                )
            self.COOKIE_SAMESITE = normalized

        # Production hardening
        if self.ENVIRONMENT == "prod":
            # ── Production storage: S3 MUST be set ──
            # All four upload surfaces — teacher file library, announcement
            # attachments, payment QR images, parent payment screenshots,
            # generated receipt PDFs — go through AWS S3. Without it,
            # uploads would write to the container's local disk, which is
            # ephemeral on Fargate/Render/Fly/Heroku and unreachable across
            # replicas. Hard-fail at startup so the operator sees the
            # problem at deploy time instead of when a parent opens a
            # broken attachment two days later.
            s3_configured = bool(self.AWS_S3_BUCKET and self.AWS_S3_REGION)
            if not s3_configured:
                raise ValueError(
                    "Production startup blocked: AWS S3 is not configured "
                    "(AWS_S3_BUCKET + AWS_S3_REGION + AWS_ACCESS_KEY_ID + "
                    "AWS_SECRET_ACCESS_KEY required). Every upload would "
                    "otherwise write to ephemeral container disk."
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
