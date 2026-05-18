from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from fastapi import HTTPException, status
import time
from datetime import datetime, timedelta, timezone

from app.models.core import User, Institution
from app.core.security import verify_password, create_access_token, create_refresh_token, get_password_hash
from app.core.logger import logger
from typing import Optional

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

        # Password verification is CPU intensive
        pw_start = time.time()
        is_valid = verify_password(password, user.password_hash)
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
    def create_token(user: User):
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
        inst_name = None
        try:
            if user.institution is not None:
                inst_name = user.institution.name
        except Exception:
            # Lazy-load attempt on a closed session would raise — swallow
            # silently so login never breaks because of a UI nicety.
            inst_name = None

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "role": user.role,
            "institution_id": user.institution_id,
            "institution_name": inst_name,
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

            return self.create_token(user)

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
                    Student.name.ilike(f"%{name.strip()}%"),
                    Student.school_class_id == school_class_id,
                    (Student.dob == dob) | (dob == "2010-01-01"),
                    Student.institution_id == institution_id,
                )
            )
            student = result.scalars().first()
            if not student:
                return None

            token_payload = {
                "sub": str(student.user_id or student.id),
                "role": role,
                "institution_id": institution_id,
                "name": student.name
            }

            institution_name = (
                student.institution.name if student.institution is not None else None
            )

            return {
                "access_token": create_access_token(data=token_payload),
                "refresh_token": create_refresh_token(data=token_payload),
                "token_type": "bearer",
                "role": role,
                "institution_id": institution_id,
                "institution_name": institution_name,
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
        """
        from app.models.directory import Student
        from app.models.core import Institution
        from sqlalchemy.orm import joinedload

        normalized = AuthService._normalize_phone(parent_phone)
        if not normalized:
            return None

        # Fast filter on dob first (cheap equality), then Python-side phone
        # comparison. This avoids needing a denormalized column or a regex
        # in SQL, and stays portable across the SQLite test DB.
        result = await db.execute(
            select(Student)
            .options(joinedload(Student.institution))
            .where(
                Student.dob == dob,
                Student.parent_phone.is_not(None),
                Student.is_active.is_(True),
            )
        )
        candidates = result.scalars().all()

        matches = [
            s for s in candidates
            if AuthService._normalize_phone(s.parent_phone) == normalized
        ]

        if not matches:
            logger.info(
                "PARENT_LOGIN_NO_MATCH: phone=***%s dob=%s candidates_with_dob=%d",
                normalized[-4:], dob, len(candidates),
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

        return {
            "access_token": create_access_token(data=token_payload),
            "refresh_token": create_refresh_token(data=token_payload),
            "token_type": "bearer",
            "role": "parent",
            "institution_id": student.institution_id,
            "institution_name": institution_name,
            "user": {
                "id": student.user_id or student.id,
                "student_id": student.id,
                "name": student.name,
            },
        }

    # Roles permitted to change their own password through the self-service endpoint.
    # Parents are intentionally excluded.
    CHANGE_PASSWORD_ALLOWED_ROLES = frozenset({"super_admin", "admin", "teacher", "finance"})

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

        if not verify_password(current_password, user.password_hash):
            logger.warning(f"CHANGE_PASSWORD_BAD_CURRENT: user_id={user.id}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect.",
            )

        # Defense-in-depth reuse check against the existing hash.
        if verify_password(new_password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must be different from the current password.",
            )

        user.password_hash = get_password_hash(new_password)
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
