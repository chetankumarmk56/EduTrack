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
from app.models import User, Teacher, Student, TeacherAssignment

# Token URL points to the main login endpoint
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login", auto_error=False)

class UserContext(BaseModel):
    id: int
    role: str
    institution_id: int
    name: str

async def get_current_user(
    token: str = Depends(oauth2_scheme), 
    db: AsyncSession = Depends(get_db)
) -> UserContext:
    """
    Extracts user and institution context from the JWT Bearer token.
    Validates token actively against the database guaranteeing identity security.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    try:
        payload = decode_access_token(token)
        user_id_val = payload.get("sub")
        role_val = payload.get("role")
        inst_val = payload.get("institution_id")
        
        if user_id_val is None or role_val is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, 
                detail="Invalid token structure."
            )
            
        user_id = int(user_id_val)
        institution_id = int(inst_val) if inst_val else 1
        
        # Unified Identity Fetch
        result = await db.execute(select(User).where(User.id == user_id))
        user_obj = result.scalars().first()
            
        if not user_obj:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, 
                detail="User record not found."
            )
        
        user_name = user_obj.name
        
        # Status Check: Account Activation
        if not getattr(user_obj, "is_active", True):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="User account is deactivated."
            )
            
        return UserContext(id=user_id, role=role_val, institution_id=institution_id, name=user_name)
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired")
    except (jwt.JWTError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication token")

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
require_payment_admin = RoleChecker(["super_admin", "admin", "finance"])

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

async def get_record_or_404(db: AsyncSession, model, record_id: int, institution_id: int):
    result = await db.execute(select(model).where(
        model.id == record_id, 
        model.institution_id == institution_id
    ))
    record = result.scalars().first()
    
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail=f"{model.__name__} not found or access denied"
        )
    return record
