from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user, UserContext
from app.models.core import User
from app.core.security import verify_password, create_access_token

from app.schemas.auth import Token
from app.schemas.directory import StudentResponse, TeacherResponse, ParentResponse

router = APIRouter(
    prefix="/api/auth",
    tags=["auth"]
)

@router.post("/login", response_model=Token)
async def login_for_access_token(
    request: Request,
    db: Session = Depends(get_db),
    form_data: OAuth2PasswordRequestForm = Depends()
):
    """
    Standard OAuth2 compatible token login for Admin and SuperAdmin roles.
    Uses bcrypt-hashed password verification and issues a JWT token.
    """
    # Identify user by email
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if user account is active
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Your account has been deactivated.")

    # Validate Institution Context (Skip for super_admin)
    if user.role != "super_admin":
        institution_id_header = request.headers.get("X-Institution-Id")
        if institution_id_header:
            try:
                requested_id = int(institution_id_header)
                if user.institution_id != requested_id:
                    raise HTTPException(
                        status_code=403, 
                        detail="You do not have administrative access to this institution."
                    )
            except ValueError:
                pass # Fallback if header is malformed

        # Check if institution is active
        if user.institution and not user.institution.is_active:
            raise HTTPException(status_code=403, detail="Your institution's access has been suspended.")
    
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role, "institution_id": user.institution_id}
    )
    
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "role": user.role,
        "institution_id": user.institution_id,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email
        }
    }

@router.get("/me", response_model=UserContext)
async def read_users_me(current_user: UserContext = Depends(get_current_user)):
    """
    Returns the decoded UserContext profile of the current authenticated user securely.
    """
    return current_user
