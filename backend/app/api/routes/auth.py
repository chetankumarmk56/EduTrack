from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user, UserContext
from app.services.auth_service import auth_service
from app.schemas.auth import Token

router = APIRouter(
    prefix="/api/auth",
    tags=["auth"]
)

@router.post("/login", response_model=Token)
async def login_for_access_token(
    request: Request,
    db: AsyncSession = Depends(get_db),
    form_data: OAuth2PasswordRequestForm = Depends()
):
    """
    Standard OAuth2 compatible token login for Admin and SuperAdmin roles.
    Uses bcrypt-hashed password verification and issues a JWT token.
    """
    institution_id = None
    institution_id_header = request.headers.get("X-Institution-Id")
    if institution_id_header:
        try:
            institution_id = int(institution_id_header)
        except ValueError:
            pass

    user = await auth_service.authenticate_user(
        db, 
        form_data.username, 
        form_data.password, 
        institution_id=institution_id
    )
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return auth_service.create_token(user)

@router.get("/me", response_model=UserContext)
async def read_users_me(current_user: UserContext = Depends(get_current_user)):
    """
    Returns the decoded UserContext profile of the current authenticated user securely.
    """
    return current_user
