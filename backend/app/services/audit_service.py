"""
Audit Logging Service
Tracks all sensitive user actions for compliance, forensics, and security monitoring.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Request
from datetime import datetime
from typing import Optional, Dict, Any
import logging

from app.models.core import AuditLog, User
from app.core.logger import logger

class AuditService:
    """Service for logging security-relevant actions"""
    
    @staticmethod
    async def log_action(
        db: AsyncSession,
        action: str,
        resource_type: str,
        resource_id: int,
        request: Optional[Request] = None,
        user_id: Optional[int] = None,
        institution_id: Optional[int] = None,
        description: Optional[str] = None,
        old_values: Optional[Dict[str, Any]] = None,
        new_values: Optional[Dict[str, Any]] = None,
        status: str = "SUCCESS",
        error_message: Optional[str] = None
    ) -> None:
        """
        Log a user action to the audit log.
        
        Args:
            db: AsyncSession for database
            action: Type of action (LOGIN, CREATE_USER, UPDATE_GRADE, etc.)
            resource_type: Type of resource (User, Mark, Announcement, etc.)
            resource_id: ID of the resource being acted upon
            request: Optional Request object to extract IP address and user agent
            user_id: ID of user performing the action
            institution_id: Institution the action belongs to
            description: Human-readable description of the action
            old_values: Previous values for update operations
            new_values: New values for update operations
            status: Whether action succeeded (SUCCESS or FAILURE)
            error_message: Error details if action failed
        """
        try:
            # Extract request context
            ip_address = None
            user_agent = None
            
            if request:
                ip_address = request.client.host if request.client else None
                user_agent = request.headers.get("user-agent", "")[:500]  # Limit length
            
            # Create audit log entry
            audit_log = AuditLog(
                user_id=user_id,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                institution_id=institution_id,
                description=description,
                old_values=old_values,
                new_values=new_values,
                ip_address=ip_address,
                user_agent=user_agent,
                status=status,
                error_message=error_message,
                timestamp=datetime.utcnow()
            )
            
            db.add(audit_log)
            await db.commit()
            
            # Log to application logger
            log_msg = f"AUDIT: action={action}, resource_type={resource_type}, resource_id={resource_id}, user_id={user_id}, status={status}"
            if status == "SUCCESS":
                logger.info(log_msg)
            else:
                logger.error(f"{log_msg}, error={error_message}")
                
        except Exception as e:
            logger.error(f"FAILED_TO_LOG_AUDIT: action={action}, error={str(e)}")
            # Don't raise - audit logging shouldn't break the application
    
    @staticmethod
    async def log_login(
        db: AsyncSession,
        user: User,
        request: Optional[Request] = None,
        success: bool = True,
        error_message: Optional[str] = None
    ) -> None:
        """Log a login attempt"""
        await AuditService.log_action(
            db=db,
            action="LOGIN",
            resource_type="User",
            resource_id=user.id if user else 0,
            request=request,
            user_id=user.id if user else None,
            institution_id=user.institution_id if user else None,
            description=f"User login attempt for {user.email if user else 'unknown'}",
            status="SUCCESS" if success else "FAILURE",
            error_message=error_message
        )
    
    @staticmethod
    async def log_user_creation(
        db: AsyncSession,
        user_id: int,
        institution_id: Optional[int],
        new_user_email: str,
        request: Optional[Request] = None,
        created_by_user_id: Optional[int] = None
    ) -> None:
        """Log user creation"""
        await AuditService.log_action(
            db=db,
            action="CREATE_USER",
            resource_type="User",
            resource_id=user_id,
            request=request,
            user_id=created_by_user_id,
            institution_id=institution_id,
            description=f"Created user account for {new_user_email}",
            new_values={"email": new_user_email},
            status="SUCCESS"
        )
    
    @staticmethod
    async def log_grade_change(
        db: AsyncSession,
        student_id: int,
        mark_id: int,
        old_score: Optional[float],
        new_score: float,
        request: Optional[Request] = None,
        user_id: Optional[int] = None,
        institution_id: Optional[int] = None
    ) -> None:
        """Log grade/mark changes"""
        await AuditService.log_action(
            db=db,
            action="UPDATE_GRADE",
            resource_type="Mark",
            resource_id=mark_id,
            request=request,
            user_id=user_id,
            institution_id=institution_id,
            description=f"Grade updated for student {student_id}: {old_score} → {new_score}",
            old_values={"score": old_score},
            new_values={"score": new_score},
            status="SUCCESS"
        )
    
    @staticmethod
    async def log_announcement(
        db: AsyncSession,
        announcement_id: int,
        action: str,  # CREATE, UPDATE, DELETE, PUBLISH
        request: Optional[Request] = None,
        user_id: Optional[int] = None,
        institution_id: Optional[int] = None,
        description: Optional[str] = None
    ) -> None:
        """Log announcement actions"""
        await AuditService.log_action(
            db=db,
            action=f"{action}_ANNOUNCEMENT",
            resource_type="Announcement",
            resource_id=announcement_id,
            request=request,
            user_id=user_id,
            institution_id=institution_id,
            description=description or f"Announcement {action.lower()}d",
            status="SUCCESS"
        )
    
    @staticmethod
    async def log_permission_change(
        db: AsyncSession,
        target_user_id: int,
        old_role: str,
        new_role: str,
        request: Optional[Request] = None,
        user_id: Optional[int] = None,
        institution_id: Optional[int] = None
    ) -> None:
        """Log permission/role changes"""
        await AuditService.log_action(
            db=db,
            action="PERMISSION_CHANGE",
            resource_type="User",
            resource_id=target_user_id,
            request=request,
            user_id=user_id,
            institution_id=institution_id,
            description=f"User role changed: {old_role} → {new_role}",
            old_values={"role": old_role},
            new_values={"role": new_role},
            status="SUCCESS"
        )
