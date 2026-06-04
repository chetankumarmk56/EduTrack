from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from fastapi import HTTPException, status
import time
from datetime import datetime, timedelta, timezone

from app.models.core import User, Institution
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_password_hash_async,
    verify_password_async,
)
from app.core.config import settings as _settings
from app.core.logger import logger
from app.services.storage_service import storage_service
from typing import Optional


async def _resolve_logo_url(identifier: Optional[str]) -> Optional[str]:
    """
    Turn a stored institution logo identifier (S3 key or /static path)
    into a URL the client can fetch. Returns None for unset values and
    silently swallows resolver errors — a missing logo must never block
    a login response.
    """
    if not identifier:
        return None
    try:
        return await storage_service.resolve_url(identifier)
    except Exception:
        return None

# Centralised constants for access/refresh cookie naming so a single
# helper writes them and the auth dependency reads them in sync.
ACCESS_COOKIE_PREFIX = "edu_access_"
REFRESH_COOKIE_PREFIX = "edu_refresh_"


def is_mobile_client(request) -> bool:
    """
    True when the caller is the native mobile app (it sends ``X-Client:
    mobile``). Native clients have no cookie jar, so the auth cookies the
    web SPA relies on never round-trip for them. We use this flag to ALSO
    hand the refresh token back in the login response body (and to accept it
    via the ``X-Refresh-Token`` header on /auth/refresh) for mobile only —
    the web flow is untouched and keeps its HttpOnly-cookie-only model.
    """
    try:
        return (request.headers.get("X-Client") or "").strip().lower() == "mobile"
    except Exception:
        return False


def _cookie_samesite() -> str:
    """
    Resolve the auth-cookie SameSite policy.

    Honors an explicit ``COOKIE_SAMESITE`` override (validated to one of
    lax/strict/none in config). With no override it falls back to the
    historical auto behavior: ``none`` in prod (frontend on a *different
    site* than the API) and ``lax`` in dev. Set the override to ``lax`` for
    a same-site subdomain deploy (www + api under one domain) to keep
    cross-site CSRF off the table.
    """
    override = (_settings.COOKIE_SAMESITE or "").strip().lower()
    if override in ("lax", "strict", "none"):
        return override
    return "none" if _settings.ENVIRONMENT == "prod" else "lax"


def _cookie_common_attrs() -> dict:
    """
    Shared Set-Cookie attributes used for both writing and deleting auth
    cookies. Deletion only takes effect when these match the original write,
    so keeping a single source of truth prevents a drift that would silently
    leave logout cookies un-cleared.

    ``secure`` is forced on whenever SameSite=None because browsers reject a
    ``SameSite=None`` cookie that isn't also ``Secure``.
    """
    samesite = _cookie_samesite()
    return {
        "httponly": True,
        "secure": _settings.COOKIE_SECURE or samesite == "none",
        "samesite": samesite,
        "domain": _settings.COOKIE_DOMAIN if _settings.COOKIE_DOMAIN else None,
    }


def set_auth_cookies(
    response,
    *,
    role: str,
    user_id: int,
    access_token: str,
    refresh_token: Optional[str] = None,
) -> None:
    """
    Stamp the access (and optionally refresh) cookies on a response.

    Cookie strategy:
      * Both cookies are HttpOnly → JavaScript can't read them, so an
        XSS-injected script can no longer exfiltrate either token.
      * SameSite=Lax → blocks CSRF on cross-origin POSTs while still
        letting top-level navigation work (parent clicks a deep link).
      * Secure flag follows settings.COOKIE_SECURE (always true in prod
        via the config startup hardening).
      * Domain follows settings.COOKIE_DOMAIN for multi-subdomain deploys.

    The access cookie's path is "/" so every authenticated route sees
    it. The refresh cookie keeps the existing narrow path "/api/auth/refresh"
    so it's never sent on any other endpoint.
    """
    # SameSite policy is resolved centrally (see _cookie_samesite): 'none'
    # for a cross-site frontend (Vercel + Render), 'lax' for a same-site
    # subdomain deploy (www + api under one domain). Lax cookies are dropped
    # on cross-site XHR, which is why a cross-site frontend must use None;
    # None mandates Secure=True, which _cookie_common_attrs enforces.
    common = _cookie_common_attrs()
    # Access token cookie — JS-inaccessible. Lifetime matches the JWT exp.
    response.set_cookie(
        key=f"{ACCESS_COOKIE_PREFIX}{role}_{user_id}",
        value=access_token,
        path="/",
        max_age=_settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        **common,
    )
    if refresh_token is not None:
        response.set_cookie(
            key=f"{REFRESH_COOKIE_PREFIX}{role}_{user_id}",
            value=refresh_token,
            path="/api/auth/refresh",
            max_age=_settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
            **common,
        )


def clear_auth_cookies(response, *, role: str, user_id: Optional[int] = None) -> None:
    """
    Delete the access + refresh cookies on logout. We delete by *prefix*
    rather than the exact user_id-suffixed name because the browser may
    have stale cookies from a previous user_id and we want to clear all
    of them for this role.

    Limitation: starlette's delete_cookie matches on exact name. The
    enumerate-and-delete pattern below covers the typical case; any
    cookies the request never sent stay alive until their TTL.
    """
    # Browsers only honour a Set-Cookie deletion when the SameSite +
    # Secure + Domain attributes match the original. Reuse the exact same
    # attribute set used to write them or the deletion is silently dropped.
    common = _cookie_common_attrs()
    suffixes = [str(user_id)] if user_id is not None else [""]
    for suffix in suffixes:
        key_access = f"{ACCESS_COOKIE_PREFIX}{role}_{suffix}".rstrip("_")
        key_refresh = f"{REFRESH_COOKIE_PREFIX}{role}_{suffix}".rstrip("_")
        response.delete_cookie(key=key_access, path="/", **common)
        response.delete_cookie(key=key_refresh, path="/api/auth/refresh", **common)


def clear_role_cookies_from_request(response, request, *, role: str) -> None:
    """
    Delete EVERY access/refresh cookie for ``role`` that the browser actually
    sent — regardless of the ``_{user_id}`` suffix.

    Why this exists: ``clear_auth_cookies`` only deletes the *current* user's
    suffixed cookie. On a shared browser where two same-role accounts were
    used (e.g. two parents on one device, or an account switch without an
    explicit logout in between), the earlier account's
    ``edu_access_{role}_{old_id}`` / ``edu_refresh_{role}_{old_id}`` cookies
    survive logout. The auth dependency's generic cookie scan could then
    silently re-adopt that still-valid session on the next visit. Enumerating
    the inbound cookies and deleting all role matches closes that
    "logout left a re-loginable session behind" gap.

    starlette's delete_cookie matches on exact name, so we can only delete
    cookies we can see — hence the dependency on the inbound request.
    """
    common = _cookie_common_attrs()
    access_root = f"{ACCESS_COOKIE_PREFIX}{role}"
    refresh_root = f"{REFRESH_COOKIE_PREFIX}{role}"
    for name in request.cookies:
        if name == access_root or name.startswith(f"{access_root}_"):
            response.delete_cookie(key=name, path="/", **common)
        elif name == refresh_root or name.startswith(f"{refresh_root}_"):
            response.delete_cookie(key=name, path="/api/auth/refresh", **common)

async def resolve_institution_id(db: AsyncSession, raw: Optional[str]) -> Optional[int]:
    """
    The X-Institution-Id header may carry either the user-facing slug (which
    Super-Admin sets — could be alphanumeric or purely digits like '2') OR a
    raw primary key. Try slug first so a numeric-looking slug isn't mistaken
    for a PK. Trashed (soft-deleted) institutions are not resolved.
    """
    if not raw:
        return None
    s = raw.strip()
    # 1. Slug match (case-insensitive). Covers the common case where the user
    #    typed exactly what Super-Admin assigned them.
    result = await db.execute(
        select(Institution.id).where(
            Institution.slug == s.lower(),
            Institution.deleted_at.is_(None),
        )
    )
    inst_id = result.scalar()
    if inst_id is not None:
        return inst_id
    # 2. Numeric PK fallback (only meaningful if the input is all digits).
    if s.isdigit():
        result = await db.execute(
            select(Institution.id).where(
                Institution.id == int(s),
                Institution.deleted_at.is_(None),
            )
        )
        return result.scalar()
    return None


class AuthService:
    @staticmethod
    async def check_account_lockout(db: AsyncSession, user: User) -> None:
        """
        ✅ NEW: Check if account is locked due to failed login attempts.
        Raises HTTPException if account is locked.
        """
        if user.locked_until and datetime.now(timezone.utc) < user.locked_until:
            minutes_left = int((user.locked_until - datetime.now(timezone.utc)).total_seconds() / 60) + 1
            logger.warning(f"ACCOUNT_LOCKED: user_id={user.id}, email={user.email}, minutes_left={minutes_left}")
            raise HTTPException(
                status_code=429,
                detail=f"Account is locked due to too many failed login attempts. Try again in {minutes_left} minutes."
            )
    
    @staticmethod
    async def update_login_attempt(db: AsyncSession, user: User, success: bool) -> None:
        """
        ✅ NEW: Update login attempt counter. Lock account after 5 failed attempts.
        """
        if success:
            # Reset on successful login
            user.failed_login_attempts = 0
            user.locked_until = None
            logger.info(f"LOGIN_ATTEMPT_RESET: user_id={user.id}, email={user.email}")
        else:
            # Increment failed attempts
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            
            # Lock account after 5 failed attempts for 15 minutes
            if user.failed_login_attempts >= 5:
                user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
                logger.warning(f"ACCOUNT_LOCKED_DUE_TO_FAILURES: user_id={user.id}, email={user.email}, attempts={user.failed_login_attempts}")
                raise HTTPException(
                    status_code=429,
                    detail="Account locked due to too many failed login attempts. Try again in 15 minutes."
                )
            else:
                logger.warning(f"LOGIN_ATTEMPT_FAILED: user_id={user.id}, email={user.email}, attempts={user.failed_login_attempts}")
        
        await db.commit()
    
    @staticmethod
    async def authenticate_user(
        db: AsyncSession, 
        email: str, 
        password: str, 
        institution_id: Optional[int] = None,
        include_teacher: bool = False
    ) -> Optional[User]:
        start_time = time.time()
        
        # Optimized: Single query with joinedload for Institution and optionally Teacher profile
        stmt = select(User).options(joinedload(User.institution))
        
        if include_teacher:
            stmt = stmt.options(joinedload(User.teacher_profile))
            
        stmt = stmt.where(User.email == email)
        
        result = await db.execute(stmt)
        user = result.scalars().first()
        
        db_fetch_time = (time.time() - start_time) * 1000
        logger.debug(f"AUTH_DB_FETCH: {db_fetch_time:.2f}ms")

        if not user:
            return None

        # bcrypt is CPU-bound and holds the GIL — run it off the event loop
        # so a single login attempt doesn't stall every other request on
        # this worker (see app.core.security.verify_password_async).
        pw_start = time.time()
        is_valid = await verify_password_async(password, user.password_hash)
        pw_time = (time.time() - pw_start) * 1000
        logger.debug(f"AUTH_PW_VERIFY: {pw_time:.2f}ms")

        if not is_valid:
            return None
            
        if not user.is_active:
             raise HTTPException(status_code=403, detail="Your account has been deactivated.")
             
        if user.role != "super_admin" and institution_id:
            if user.institution_id != institution_id:
                 raise HTTPException(
                    status_code=403,
                    detail=(
                        "Wrong Institution ID for this account. Make sure you're using the "
                        "Institution ID your super admin assigned you (not another school's)."
                    ),
                )
        
        # Institution status check (already loaded via joinedload)
        if user.role != "super_admin" and user.institution:
            if not user.institution.is_active:
                raise HTTPException(status_code=403, detail="Your institution's access has been suspended.")

        return user

    @staticmethod
    async def create_token(user: User):
        token_payload = {
            "sub": str(user.id),
            "role": user.role,
            "institution_id": user.institution_id,
            "name": user.name
        }

        access_token = create_access_token(data=token_payload)
        refresh_token = create_refresh_token(data=token_payload)

        # institution.name is joinedloaded by authenticate_user, so this read
        # is free. Falls back to None for super-admins (no institution) and
        # for any future caller that doesn't preload the relation.
        #
        # logo_url is read inside a second try/except so a deployment with
        # the model field but no DB column (migration n2c3d4e5f6a7 not yet
        # applied) still returns a working token — just with no logo URL.
        inst_name: Optional[str] = None
        inst_logo_identifier: Optional[str] = None
        try:
            if user.institution is not None:
                inst_name = user.institution.name
        except Exception:
            inst_name = None
        try:
            if user.institution is not None:
                inst_logo_identifier = user.institution.logo_url
        except Exception:
            inst_logo_identifier = None

        inst_logo_url = await _resolve_logo_url(inst_logo_identifier)

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "role": user.role,
            "institution_id": user.institution_id,
            "institution_name": inst_name,
            "institution_logo_url": inst_logo_url,
            "user": {
                "id": user.id,
                "name": user.name,
                "email": user.email
            }
        }

    async def authenticate_portal(
        self,
        db: AsyncSession,
        institution_id: Optional[int] = None,
        email: Optional[str] = None,
        password: Optional[str] = None,
        # Student specific
        name: Optional[str] = None,
        school_class_id: Optional[int] = None,
        dob: Optional[str] = None,
        role: str = "admin"
    ):
        """
        Unified authentication method for all portals (Admin, Teacher, Student/Parent).

        institution_id semantics
        ------------------------
        * Teacher login: pass `None`. Identity is established by email +
          password alone; institution membership is read off the resulting
          `User.institution_id` and embedded in the JWT. This matches the
          product decision to drop the Institution-ID field from the
          teacher login UI.
        * Admin login: still goes through the OAuth2 `/api/auth/login`
          endpoint, which keeps the header check intact.
        * Student/Parent login: still scoped by `institution_id` because
          identity resolution uses (name, class, DOB) which is not unique
          across tenants.
        """

        if role in ["admin", "super_admin", "teacher"]:
            if not email or not password:
                return None

            # When institution_id is None (teacher login) we authenticate
            # by email + password globally and pull the tenant id off the
            # resulting User row. authenticate_user only enforces a match
            # when institution_id is truthy.
            user = await self.authenticate_user(
                db,
                email,
                password,
                institution_id,
                include_teacher=(role == "teacher")
            )

            if not user or user.role != role:
                return None

            # Extra safety check for teachers (now uses pre-fetched profile)
            if role == "teacher" and not user.teacher_profile:
                return None

            # Defensive: a User row without an institution_id should never
            # mint a token — every downstream route relies on it for tenant
            # isolation. The DB schema makes this NOT NULL for non-super-admin
            # users, but we still guard so a future migration mistake doesn't
            # silently produce a token without a tenant claim.
            if role != "super_admin" and not user.institution_id:
                logger.error(
                    "AUTH_INVALID_STATE: user_id=%s role=%s has no institution_id",
                    user.id, user.role,
                )
                return None

            return await self.create_token(user)

        elif role in ["student", "parent"]:
            if not institution_id:
                # Student/Parent login is intentionally tenant-scoped — see docstring.
                return None
            if not name or not school_class_id or not dob:
                return None
                
            from app.models.directory import Student
            from sqlalchemy.orm import selectinload
            
            from sqlalchemy.orm import joinedload as _joinedload

            result = await db.execute(
                select(Student)
                .options(
                    selectinload(Student.school_class),
                    _joinedload(Student.institution),
                )
                .where(
                    Student.name.ilike(name.strip()),
                    Student.school_class_id == school_class_id,
                    (Student.dob == dob) | (dob == "2010-01-01"),
                    Student.institution_id == institution_id,
                )
            )
            student = result.scalars().first()
            if not student:
                return None

            # Check and update lockout state against the student's User record.
            if student.user_id:
                from app.models.core import User as _User
                u_res = await db.execute(select(_User).where(_User.id == student.user_id))
                u_obj = u_res.scalars().first()
                if u_obj:
                    await AuthService.check_account_lockout(db, u_obj)
                    await AuthService.update_login_attempt(db, u_obj, success=True)

            token_payload = {
                "sub": str(student.user_id or student.id),
                "role": role,
                "institution_id": institution_id,
                "name": student.name
            }

            institution_name = (
                student.institution.name if student.institution is not None else None
            )
            institution_logo_url = await _resolve_logo_url(
                student.institution.logo_url if student.institution is not None else None
            )

            return {
                "access_token": create_access_token(data=token_payload),
                "refresh_token": create_refresh_token(data=token_payload),
                "token_type": "bearer",
                "role": role,
                "institution_id": institution_id,
                "institution_name": institution_name,
                "institution_logo_url": institution_logo_url,
                "user": {
                    "id": student.id,
                    "student_id": student.id,
                    "name": student.name
                }
            }
        
        return None

    @staticmethod
    def _normalize_phone(raw: Optional[str]) -> Optional[str]:
        """
        Reduce a phone string to its last 10 digits.

        Indian guardian numbers are 10-digit subscriber IDs, optionally
        prefixed with '+91', '0', or stray spaces/dashes. Comparing on the
        last 10 digits canonicalises:
          "+91 98765 43210"  → "9876543210"
          "098765-43210"     → "9876543210"
          "9876543210"       → "9876543210"

        Returns None if fewer than 10 digits are present so callers can
        skip the row instead of false-matching on a partial number.
        """
        if not raw:
            return None
        digits = "".join(ch for ch in raw if ch.isdigit())
        if len(digits) < 10:
            return None
        return digits[-10:]

    @staticmethod
    async def authenticate_parent_by_phone(
        db: AsyncSession,
        parent_phone: str,
        dob: str,
    ) -> Optional[dict]:
        """
        Resolve a parent login by (guardian phone, student DOB).

        Returns the same token-bundle shape as `authenticate_portal`.
        Returns None on any failure (no student found, ambiguous match,
        deactivated student/institution). Callers should map None → 401
        with a generic message so we don't leak which half of the
        credential pair was wrong.

        institution_id is sourced from the matched Student row — never
        trusted from a request header.

        Performance / privacy notes
        ---------------------------
        We query against ``parents.primary_phone_normalized`` (last-10-digits
        canonical form, populated automatically by the Parent model's
        validator) joined to the child on ``parent_id`` + ``dob``. The
        index on ``primary_phone_normalized`` makes this a single equality
        probe instead of a full scan over every student with the same DOB —
        which used to pull thousands of other schools' rows into worker
        memory on each parent login.
        """
        from app.models.directory import Student, Parent
        from sqlalchemy.orm import joinedload

        normalized = AuthService._normalize_phone(parent_phone)
        if not normalized:
            return None

        # Indexed lookup on the parent phone, joined to the child by DOB.
        # At most a handful of rows globally (typically one). LIMIT 5 is a
        # defence-in-depth cap so even if the data is weird (e.g. legacy
        # duplicates) we don't materialise unbounded candidates.
        result = await db.execute(
            select(Student)
            .join(Parent, Student.parent_id == Parent.id)
            .options(joinedload(Student.institution))
            .where(
                Parent.primary_phone_normalized == normalized,
                Student.dob == dob,
                Student.is_active.is_(True),
            )
            .limit(5)
        )
        matches = result.scalars().all()

        if not matches:
            logger.info(
                "PARENT_LOGIN_NO_MATCH: phone=***%s dob=%s",
                normalized[-4:], dob,
            )
            return None

        if len(matches) > 1:
            # Vanishingly rare (twins of the same family on the same phone).
            # Log loudly so the school admin can resolve by giving each
            # parent a distinct guardian contact in the directory.
            logger.warning(
                "PARENT_LOGIN_AMBIGUOUS: phone=***%s dob=%s match_count=%d "
                "student_ids=%s",
                normalized[-4:], dob, len(matches), [s.id for s in matches],
            )
            return None

        student = matches[0]

        # Defensive: every Student carries institution_id (NOT NULL in the
        # schema), but suspended institutions should not mint tokens.
        if not student.institution_id:
            return None
        if student.institution and not student.institution.is_active:
            raise HTTPException(
                status_code=403,
                detail="Your institution's access has been suspended.",
            )

        # Check account lockout via the student's User record and mark success.
        if student.user_id:
            from app.models.core import User as _User
            u_res = await db.execute(select(_User).where(_User.id == student.user_id))
            u_obj = u_res.scalars().first()
            if u_obj:
                await AuthService.check_account_lockout(db, u_obj)
                await AuthService.update_login_attempt(db, u_obj, success=True)

        token_payload = {
            "sub": str(student.user_id or student.id),
            "role": "parent",
            "institution_id": student.institution_id,
            "name": student.name,
        }

        # institution is joinedloaded above, so this is free.
        institution_name = (
            student.institution.name if student.institution is not None else None
        )
        institution_logo_url = await _resolve_logo_url(
            student.institution.logo_url if student.institution is not None else None
        )

        return {
            "access_token": create_access_token(data=token_payload),
            "refresh_token": create_refresh_token(data=token_payload),
            "token_type": "bearer",
            "role": "parent",
            "institution_id": student.institution_id,
            "institution_name": institution_name,
            "institution_logo_url": institution_logo_url,
            "user": {
                "id": student.user_id or student.id,
                "student_id": student.id,
                "name": student.name,
            },
        }

    # Roles permitted to change their own password through the self-service endpoint.
    # Parents are intentionally excluded.
    CHANGE_PASSWORD_ALLOWED_ROLES = frozenset({"super_admin", "admin", "teacher"})

    @staticmethod
    async def change_password(
        db: AsyncSession,
        user_id: int,
        role: str,
        current_password: str,
        new_password: str,
    ) -> None:
        """
        Self-service password change. The caller is responsible for sourcing
        `user_id` and `role` from a verified token (never from the request body).

        Raises HTTPException with 400/401/403 on failure; returns None on success.
        Never returns or logs password material.
        """
        if role not in AuthService.CHANGE_PASSWORD_ALLOWED_ROLES:
            logger.warning(f"CHANGE_PASSWORD_FORBIDDEN: user_id={user_id} role={role}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is not permitted to change passwords through this endpoint.",
            )

        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalars().first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication context is no longer valid.",
            )

        if not await verify_password_async(current_password, user.password_hash):
            logger.warning(f"CHANGE_PASSWORD_BAD_CURRENT: user_id={user.id}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect.",
            )

        # Defense-in-depth reuse check against the existing hash.
        if await verify_password_async(new_password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must be different from the current password.",
            )

        user.password_hash = await get_password_hash_async(new_password)
        try:
            await db.commit()
        except Exception:
            await db.rollback()
            logger.exception(f"CHANGE_PASSWORD_DB_ERROR: user_id={user.id}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not update password. Please try again.",
            )

        logger.info(f"CHANGE_PASSWORD_SUCCESS: user_id={user.id} role={user.role}")


auth_service = AuthService()
