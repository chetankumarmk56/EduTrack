from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from app.models.core import User
from app.core.security import verify_password, create_access_token
from typing import Optional

class AuthService:
    @staticmethod
    async def authenticate_user(
        db: AsyncSession, 
        email: str, 
        password: str, 
        institution_id: Optional[int] = None
    ) -> Optional[User]:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalars().first()
        
        if not user or not verify_password(password, user.password_hash):
            return None
            
        if not user.is_active:
             raise HTTPException(status_code=403, detail="Your account has been deactivated.")
             
        if user.role != "super_admin" and institution_id:
            if user.institution_id != institution_id:
                 raise HTTPException(
                    status_code=403, 
                    detail="You do not have administrative access to this institution."
                )
        
        # Check institution status
        # In async, we might need to fetch the institution if it's not loaded
        # For now, we'll assume it's a simple check or we fetch it.
        if user.role != "super_admin":
            from app.models.core import Institution
            inst_result = await db.execute(select(Institution).where(Institution.id == user.institution_id))
            institution = inst_result.scalars().first()
            if institution and not institution.is_active:
                raise HTTPException(status_code=403, detail="Your institution's access has been suspended.")

        return user

    @staticmethod
    def create_token(user: User):
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

auth_service = AuthService()
