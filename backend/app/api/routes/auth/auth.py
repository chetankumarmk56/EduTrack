from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user, UserContext
from app.core.limiter import limiter, RATE_LIMITS
from app.services.auth import auth_service
from app.schemas.auth import Token, ChangePasswordRequest, ChangePasswordResponse
from app.core.logger import logger

router = APIRouter(
    prefix="/api/auth",
    tags=["auth"]
)

@router.post("/login", response_model=Token)
@limiter.limit(RATE_LIMITS["auth_login"])
async def login_for_access_token(
    request: Request,  # required positionally so slowapi can read the client IP
    response: Response,
    db: AsyncSession = Depends(get_db),
    form_data: OAuth2PasswordRequestForm = Depends()
):
    """
    Standard OAuth2 compatible token login for Admin and SuperAdmin roles.
    Uses bcrypt-hashed password verification and issues a JWT token.
    """
    from app.services.auth.auth_service import resolve_institution_id
    inst_header = request.headers.get("X-Institution-Id")
    institution_id = await resolve_institution_id(db, inst_header)
    # If a header was supplied but didn't resolve, the Institution ID is wrong.
    # Reject before checking the password so it can't grant access to another school.
    if inst_header and institution_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unknown Institution ID. Check with your school admin.",
        )

    user = await auth_service.authenticate_user(
        db, 
        form_data.username, 
        form_data.password, 
        institution_id=institution_id
    )
    
    if not user:
        logger.warning(f"AUTH_FAILURE: Login failed for username={form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token_data = await auth_service.create_token(user)
    refresh_token = token_data.pop("refresh_token")

    # Stamp BOTH the access and refresh cookies as HttpOnly. The web SPA
    # reads neither directly — every authenticated request rides on the
    # cookies via `withCredentials: true`. Mobile clients ignore the
    # cookies and use the `access_token` field in the response body via
    # SecureStore + Authorization header instead.
    from app.services.auth.auth_service import set_auth_cookies
    set_auth_cookies(
        response,
        role=user.role,
        user_id=user.id,
        access_token=token_data["access_token"],
        refresh_token=refresh_token,
    )

    logger.info(f"AUTH_SUCCESS: user_id={user.id}, role={user.role}, institution_id={user.institution_id}")
    return token_data

@router.post("/refresh", response_model=Token)
@limiter.limit(RATE_LIMITS["auth_refresh"])
async def refresh_access_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """
    Stateless refresh endpoint. Uses HttpOnly cookie to issue a new access token.
    Validates using JWT signature only - identity extracted from token, not headers.
    """
    from app.core.security import decode_access_token, create_access_token
    from app.core.config import settings
    from jose import JWTError
    
    # Get role from header to narrow down cookie search (not used for authentication)
    role = request.headers.get("X-Portal-Role", "parent")
    
    # Strategy: Browser sends all matching cookies. We find one with valid JWT.
    # Look for cookies matching pattern: edu_refresh_{role}_*
    refresh_token = None
    
    try:
        # Search for any cookie matching edu_refresh_{role}_* (e.g. edu_refresh_parent_60)
        for cookie_name, cookie_value in request.cookies.items():
            if cookie_name.startswith(f"edu_refresh_{role}_") or cookie_name == f"edu_refresh_{role}":
                # Try to decode this cookie
                try:
                    payload = decode_access_token(cookie_value)
                    # Validate it's a refresh token
                    if payload.get("type") == "refresh":
                        refresh_token = cookie_value
                        logger.debug(f"REFRESH_COOKIE_FOUND: cookie_name={cookie_name}, user_id={payload.get('sub')}")
                        break  # Use the first valid refresh token found
                except (JWTError, Exception) as e:
                    # This cookie's token is invalid, try next one
                    logger.debug(f"REFRESH_COOKIE_INVALID: cookie_name={cookie_name}, error={str(e)}")
                    continue
    except Exception as e:
        logger.error(f"REFRESH_COOKIE_SEARCH_ERROR: {str(e)}")
        pass
    
    if not refresh_token:
        logger.warning(f"REFRESH_FAILURE: No valid refresh token found for role={role}, available_cookies={list(request.cookies.keys())}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing or invalid"
        )
    
    try:
        # Decode and validate the token
        payload = decode_access_token(refresh_token)
        
        # Verify token type
        if payload.get("type") != "refresh":
            logger.warning(f"REFRESH_VALIDATION_FAILED: Invalid token type, expected 'refresh', got '{payload.get('type')}'")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )
        
        # Extract identity from JWT (the only trusted source)
        user_id = int(payload.get("sub", 0))
        user_role = payload.get("role")
        raw_inst_id = payload.get("institution_id")
        if not raw_inst_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing institution context",
            )
        institution_id = int(raw_inst_id)
        user_name = payload.get("name")
        
        # Validate role consistency between token and request
        if user_role != role:
            logger.warning(f"REFRESH_ROLE_MISMATCH: user_id={user_id}, token_role={user_role}, request_role={role}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Role mismatch: Token role does not match portal role"
            )
        
        # Issue new access token with identity from JWT
        new_access_token = create_access_token(data={
            "sub": str(user_id),
            "role": user_role,
            "institution_id": institution_id,
            "name": user_name
        })

        # Re-stamp the access cookie so the web SPA picks up the rotated
        # token transparently — same path/Same-Site flags as login.
        # Refresh cookie itself is NOT rotated here (it has its own TTL);
        # if you start rotating refresh tokens too, set refresh_token here.
        from app.services.auth.auth_service import set_auth_cookies
        set_auth_cookies(
            response,
            role=user_role,
            user_id=user_id,
            access_token=new_access_token,
        )

        logger.info(f"REFRESH_SUCCESS: user_id={user_id}, role={user_role}, institution_id={institution_id}")

        return {
            "access_token": new_access_token,
            "token_type": "bearer",
            "role": user_role,
            "institution_id": institution_id
        }
        
    except HTTPException:
        # Re-raise HTTP exceptions (our custom validations)
        raise
    except Exception as e:
        logger.error(f"REFRESH_TOKEN_VALIDATION_ERROR: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token validation failed"
        )

@router.get("/me", response_model=UserContext)
async def read_users_me(current_user: UserContext = Depends(get_current_user)):
    """
    Returns the decoded UserContext profile of the current authenticated user securely.
    """
    return current_user


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    current_user: UserContext = Depends(get_current_user),
):
    """
    Clear both the access and refresh cookies for the current user's role.

    Requires auth so an unauthenticated attacker can't trigger
    arbitrary Set-Cookie clears as a DoS vector. The cookies are
    cleared scoped to the caller's own role+user_id — sister sessions
    (e.g. an admin still logged in alongside a parent in the same
    browser) are untouched.
    """
    from app.services.auth.auth_service import clear_auth_cookies
    clear_auth_cookies(
        response,
        role=current_user.role,
        user_id=current_user.id,
    )
    logger.info(f"LOGOUT: user_id={current_user.id} role={current_user.role}")
    return {"status": "ok"}


@router.post("/change-password", response_model=ChangePasswordResponse)
@limiter.limit(RATE_LIMITS["auth_change_password"])
async def change_password(
    request: Request,
    payload: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
):
    """
    Authenticated password change. User identity is taken from the JWT —
    the request body never carries a user_id. All business logic lives in
    AuthService.change_password; this handler is a thin HTTP adapter.
    """
    await auth_service.change_password(
        db=db,
        user_id=current_user.id,
        role=current_user.role,
        current_password=payload.current_password,
        new_password=payload.new_password,
    )
    return ChangePasswordResponse(message="Password updated successfully")
