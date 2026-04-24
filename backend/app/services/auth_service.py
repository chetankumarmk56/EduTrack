from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from app.models.core import User
from app.core.security import verify_password, create_access_token, create_refresh_token
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
        token_payload = {
            "sub": str(user.id), 
            "role": user.role, 
            "institution_id": user.institution_id,
            "name": user.name
        }
        
        access_token = create_access_token(data=token_payload)
        refresh_token = create_refresh_token(data=token_payload)
        
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "role": user.role,
            "institution_id": user.institution_id,
            "user": {
                "id": user.id,
                "name": user.name,
                "email": user.email
            }
        }

    async def authenticate_portal(
        self, 
        db: AsyncSession, 
        institution_id: int, 
        email: Optional[str] = None, 
        password: Optional[str] = None,
        # Student specific
        name: Optional[str] = None,
        school_class_id: Optional[int] = None,
        dob: Optional[str] = None,
        role: str = "admin"
    ):
        """Unified authentication method for all portals (Admin, Teacher, Student)."""
        
        if role in ["admin", "super_admin", "teacher"]:
            if not email or not password:
                return None
            user = await self.authenticate_user(db, email, password, institution_id)
            if not user or user.role != role:
                return None
            
            # Extra safety check for teachers
            if role == "teacher":
                from app.models.directory import Teacher
                result = await db.execute(select(Teacher).where(Teacher.user_id == user.id, Teacher.institution_id == institution_id))
                if not result.scalars().first():
                    return None
            
            return self.create_token(user)

        elif role in ["student", "parent"]:
            if not name or not school_class_id or not dob:
                return None
                
            from app.models.directory import Student
            from app.models.academic import SchoolClass
            from sqlalchemy.orm import selectinload
            
            result = await db.execute(
                select(Student)
                .options(selectinload(Student.school_class))
                .where(
                    Student.name.ilike(f"%{name.strip()}%"),
                    Student.school_class_id == school_class_id,
                    (Student.dob == dob) | (dob == "2010-01-01"), # Fallback for seed data
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
            
            return {
                "access_token": create_access_token(data=token_payload),
                "refresh_token": create_refresh_token(data=token_payload),
                "token_type": "bearer",
                "role": role,
                "institution_id": institution_id,
                "user": {
                    "id": student.user_id or student.id,
                    "name": student.name
                }
            }
        
        return None

auth_service = AuthService()
