from fastapi import Request, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from jose import jwt

from app.core.database import get_db
from app.core.config import settings
from app.core.security import decode_access_token
from app.core.user_cache import user_cache
from app.core.logger import logger
from app.models import User, Teacher, Student, TeacherAssignment

# OpenAPI Swagger UI still needs the Bearer prompt for mobile clients,
# so we keep the scheme registered. auto_error=False because we accept
# the token from an HttpOnly cookie too — see _extract_access_token.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login", auto_error=False)


# Cookie name prefix used by all login endpoints. Matches the pattern
# `edu_access_{role}_{user_id}`. Each login flow overwrites the cookie
# under its own role so a browser with both an admin and parent session
# (rare but legitimate) keeps them separate.
ACCESS_COOKIE_PREFIX = "edu_access_"


def _extract_access_token(
    request: Request,
    bearer_token: Optional[str],
) -> Optional[str]:
    """
    Resolve the JWT access token from either:

    1. ``Authorization: Bearer …`` header (used by the mobile app, which
       stores the token in SecureStore — XSS isn't a vector there).
    2. An ``edu_access_{role}_{user_id}`` HttpOnly cookie (used by the
       web SPA — keeps the token JS-inaccessible so XSS can no longer
       exfiltrate it).

    The header path wins when both are present so a future mobile client
    that runs inside a WebView with a logged-in web user doesn't pick
    up the wrong identity.

    The cookie scan walks all cookies whose name starts with the prefix
    and returns the first one that decodes successfully. That tolerates
    legacy cookies left over from a previous session without failing
    auth on the first try.
    """
    if bearer_token:
        return bearer_token

    portal_role = request.headers.get("X-Portal-Role")
    # Fast path: look up the role-scoped cookie directly when the client
    # advertised which portal it is. Falls back to a scan otherwise.
    if portal_role:
        for name, value in request.cookies.items():
            if name == f"{ACCESS_COOKIE_PREFIX}{portal_role}" or \
               name.startswith(f"{ACCESS_COOKIE_PREFIX}{portal_role}_"):
                return value

    # Generic scan — last-resort: pick the first cookie that looks like
    # an access token. decode_access_token in get_current_user will
    # reject non-JWT garbage.
    for name, value in request.cookies.items():
        if name.startswith(ACCESS_COOKIE_PREFIX):
            return value
    return None


class UserContext(BaseModel):
    id: int
    role: str
    institution_id: int
    name: str

async def get_current_user(
    request: Request,
    bearer_token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> UserContext:
    """
    Extracts user and institution context from the JWT access token.

    Token source priority:
      1. ``Authorization: Bearer`` header (mobile app via SecureStore).
      2. ``edu_access_{role}*`` HttpOnly cookie (web SPA).

    The web client used to send the token via header too, sourced from
    localStorage — that made the token XSS-exfiltratable. We now set the
    cookie at login (see auth.py) and the SPA's axios client no longer
    touches localStorage for the token. Mobile is unchanged.
    """
    token = _extract_access_token(request, bearer_token)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired")
    except jwt.JWTError as exc:
        # Log the real error so production failures are self-diagnosing.
        # Common cause: SECRET_KEY mismatch between signing and verification
        # (e.g. different env var vs .env file value, or trailing whitespace).
        logger.warning("JWT decode failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )

    try:
        user_id_val = payload.get("sub")
        role_val = payload.get("role")
        inst_val = payload.get("institution_id")

        if user_id_val is None or role_val is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token structure.",
            )

        user_id = int(user_id_val)
        # Super admins are global — no institution. Use 0 as a sentinel so the
        # int-typed UserContext stays happy; super-admin routes don't filter on it.
        if role_val == "super_admin":
            institution_id = int(inst_val) if inst_val else 0
        else:
            if not inst_val:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token: missing institution context",
                )
            institution_id = int(inst_val)

    except HTTPException:
        raise
    except (TypeError, ValueError) as exc:
        logger.warning("JWT claim conversion failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token claims.",
        )

    # Unified Identity Fetch — Redis-cached so we don't hit Postgres
    # on every authenticated request. The cache holds (is_active, name)
    # with a 60s TTL; admin write paths call user_cache.invalidate(id)
    # on deactivation so revocation latency is bounded by the time it
    # takes to handle the next request (effectively instant).
    cached = await user_cache.get(user_id)
    if cached is not None:
        user_name = cached["name"]
        is_active = cached["is_active"]
    else:
        result = await db.execute(select(User).where(User.id == user_id))
        user_obj = result.scalars().first()
        if not user_obj:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User record not found.",
            )
        user_name = user_obj.name
        is_active = bool(getattr(user_obj, "is_active", True))
        # Populate cache for the next 60s of requests on this user_id.
        await user_cache.set(
            user_id,
            {"is_active": is_active, "name": user_name},
        )

    if not is_active:
        # Belt-and-braces: also drop any stale cache entry so a
        # deactivation that the cache hasn't seen yet doesn't keep
        # serving subsequent requests with `is_active=True`.
        await user_cache.invalidate(user_id)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated.",
        )

    return UserContext(id=user_id, role=role_val, institution_id=institution_id, name=user_name)

async def get_current_active_user(
    current_user: UserContext = Depends(get_current_user)
) -> UserContext:
    return current_user

class RoleChecker:
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    async def __call__(self, user: UserContext = Depends(get_current_active_user)) -> UserContext:
        if user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation not permitted. Required roles: {self.allowed_roles}"
            )
        return user

# Pre-defined role guards
require_super_admin = RoleChecker(["super_admin"])
require_admin = RoleChecker(["super_admin", "admin"])
require_institution_admin = require_admin
require_teacher = RoleChecker(["super_admin", "admin", "teacher"])
require_parent = RoleChecker(["super_admin", "admin", "parent"])
require_student = RoleChecker(["super_admin", "admin", "student"])
require_payment_admin = RoleChecker(["super_admin", "admin"])

async def require_teacher_strict(user: UserContext = Depends(get_current_active_user)) -> UserContext:
    if user.role != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can perform this action")
    return user

async def require_parent_strict(user: UserContext = Depends(get_current_active_user)) -> UserContext:
    if user.role != "parent":
        raise HTTPException(status_code=403, detail="Only parents can perform this action")
    return user

async def require_faculty(user: UserContext = Depends(get_current_active_user)) -> UserContext:
    if user.role not in ["super_admin", "admin", "teacher"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation not permitted. Required roles: ['admin', 'teacher']"
        )
    return user

async def validate_teacher_assignment(
    school_class_id: int,
    subject_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
) -> bool:
    if user.role in ["super_admin", "admin"]:
        return True
        
    result = await db.execute(select(Teacher).where(Teacher.user_id == user.id))
    teacher = result.scalars().first()
    if not teacher:
        raise HTTPException(status_code=403, detail="Faculty profile not found.")
        
    stmt = select(TeacherAssignment).where(
        TeacherAssignment.teacher_id == teacher.id,
        TeacherAssignment.school_class_id == school_class_id
    )
    
    if subject_id:
        stmt = stmt.where(TeacherAssignment.subject_id == subject_id)
        
    result = await db.execute(stmt)
    assignment = result.scalars().first()
    if not assignment:
        raise HTTPException(
            status_code=403, 
            detail="You are not assigned to this class or subject."
        )
    return True

async def ensure_teacher_assigned_to_student(
    student_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
) -> int:
    if user.role in ["super_admin", "admin"]:
        result = await db.execute(select(Student).where(Student.id == student_id))
        student = result.scalars().first()
        return student.school_class_id if student else None

    teacher_result = await db.execute(select(Teacher).where(Teacher.user_id == user.id))
    teacher = teacher_result.scalars().first()
    
    student_result = await db.execute(select(Student).where(Student.id == student_id))
    student = student_result.scalars().first()
    
    if not teacher or not student:
        raise HTTPException(status_code=403, detail="Access denied.")
        
    assign_result = await db.execute(select(TeacherAssignment).where(
        TeacherAssignment.teacher_id == teacher.id,
        TeacherAssignment.school_class_id == student.school_class_id
    ))
    assignment = assign_result.scalars().first()
    
    if not assignment:
        raise HTTPException(status_code=403, detail="Student is not in your assigned records.")
        
    return student.school_class_id

async def require_cron_or_admin(
    request: Request,
    bearer_token: Optional[str] = Depends(oauth2_scheme),
) -> str:
    """
    Authentication for cron-style endpoints. Accepts either:

    * ``X-Cron-Secret`` header matching ``settings.CRON_SECRET`` (preferred
      for unattended schedulers — no JWT lifecycle to manage), OR
    * a JWT for an admin / super-admin user (interactive
      operator running the dispatch ad-hoc from a browser).

    Returns the caller's identity tag for logging. Raises 401/403 on
    failure so a misconfigured cron loops loudly instead of silently
    dropping notifications.

    ``bearer_token`` is declared via ``Depends(oauth2_scheme)`` purely so
    FastAPI registers this endpoint as requiring OAuth2 in the generated
    OpenAPI schema — that is what makes Swagger UI attach the
    ``Authorization: Bearer …`` header on the dispatched curl. The actual
    token read is still done manually below so requests that arrive with
    only ``X-Cron-Secret`` (and no Authorization header) are not rejected
    by ``auto_error``.
    """
    # 1. Shared-secret path.
    secret_header = request.headers.get("X-Cron-Secret")
    configured = getattr(settings, "CRON_SECRET", None)
    if secret_header and configured:
        # Constant-time compare to avoid timing side channels.
        import hmac
        if hmac.compare_digest(secret_header, configured):
            return "cron-secret"

    # 2. Admin JWT path. Best-effort — accept the token via either the
    #    Authorization header (Swagger / mobile) or the edu_access_* cookie
    #    (web SPA). Fall through to 401 if neither resolves to an admin.
    token = _extract_access_token(request, bearer_token)
    if token:
        try:
            payload = decode_access_token(token)
            role = payload.get("role")
            if role in ("super_admin", "admin"):
                return f"jwt:{payload.get('sub')}:{role}"
        except (jwt.ExpiredSignatureError, jwt.JWTError, ValueError):
            pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=(
            "This endpoint requires either an X-Cron-Secret header matching "
            "the configured CRON_SECRET, or a Bearer token for an admin user."
        ),
    )


async def get_record_or_404(db: AsyncSession, model, record_id: int, institution_id: int):
    """
    Tenant-scoped fetch-by-id, 404 if not found in this institution.

    Thin wrapper kept for backwards compatibility — the canonical
    implementation now lives in app.core.tenant so there is a single source
    of truth for tenant scoping. Prefer importing from app.core.tenant
    directly in new code.
    """
    from app.core.tenant import get_scoped_or_404
    return await get_scoped_or_404(db, model, record_id, institution_id)
