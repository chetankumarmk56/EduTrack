"""
Rate limiting configuration for EduTrack API.
Prevents brute force attacks and denial-of-service attacks.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.responses import JSONResponse

# ✅ Initialize rate limiter using IP address as key
limiter = Limiter(key_func=get_remote_address)

# Custom error handler for rate limit exceeded

# Rate limit strategies
RATE_LIMITS = {
    "auth_login": "5/minute",  # Max 5 login attempts per minute per IP
    "auth_refresh": "10/minute",  # Max 10 token refreshes per minute per IP
    "student_login": "5/minute",  # Max 5 student login attempts per minute per IP
    "general_api": "100/minute",  # Max 100 API requests per minute per IP
}
