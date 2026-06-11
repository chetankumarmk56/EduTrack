"""
Service layer for the account-deletion request workflow.

Authorisation model:
  * parent / student / teacher requests → an ADMIN of the SAME institution reviews.
  * admin requests                      → a SUPER_ADMIN reviews.

Approval deactivates the target account (``User.is_active = False``) and
invalidates the auth cache so access is revoked immediately. Actual data erasure
is a separate operational step under the DPA.
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import UserContext
from app.core.logger import logger
from app.core.user_cache import user_cache
from app.models import User
from app.models.core import AuditLog
from app.models.account_deletion import AccountDeletionRequest, AccountDeletionStatus

# Roles whose deletion requests an institution ADMIN may approve.
_ADMIN_REVIEWABLE_ROLES = ("parent", "student", "teacher")


async def _write_audit(
    db: AsyncSession,
    *,
    user_id: Optional[int],
    action: str,
    resource_id: Optional[int],
    institution_id: Optional[int],
    description: str,
) -> None:
    db.add(AuditLog(
        user_id=user_id,
        action=action,
        resource_type="AccountDeletionRequest",
        resource_id=resource_id,
        institution_id=institution_id,
        description=description,
    ))


async def create_request(
    db: AsyncSession, user: UserContext, reason: Optional[str],
) -> AccountDeletionRequest:
    """Create a PENDING deletion request for the caller's own account."""
    if user.role == "super_admin":
        # No approver sits above a super-admin; this flow isn't for them.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Super-admin accounts cannot be deleted through this workflow.",
        )

    # One open request per user — return-as-conflict so the UI can show status.
    existing = await db.execute(
        select(AccountDeletionRequest).where(
            AccountDeletionRequest.user_id == user.id,
            AccountDeletionRequest.status == AccountDeletionStatus.PENDING.value,
        )
    )
    if existing.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have a deletion request pending review.",
        )

    # Pull the email for the reviewer's context.
    user_row = (await db.execute(select(User).where(User.id == user.id))).scalars().first()
    if not user_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    req = AccountDeletionRequest(
        institution_id=user.institution_id or None,
        user_id=user.id,
        requester_role=user.role,
        requester_name=user_row.name,
        requester_email=user_row.email,
        reason=(reason or None),
        status=AccountDeletionStatus.PENDING.value,
    )
    db.add(req)
    await _write_audit(
        db, user_id=user.id, action="REQUEST_ACCOUNT_DELETION",
        resource_id=None, institution_id=user.institution_id or None,
        description=f"{user.role} requested account deletion.",
    )
    await db.commit()
    await db.refresh(req)
    logger.info("Account deletion requested by user_id=%s role=%s", user.id, user.role)
    return req


async def get_my_request(
    db: AsyncSession, user: UserContext,
) -> Optional[AccountDeletionRequest]:
    """Most recent deletion request by the caller (any status), or None."""
    result = await db.execute(
        select(AccountDeletionRequest)
        .where(AccountDeletionRequest.user_id == user.id)
        .order_by(AccountDeletionRequest.id.desc())
    )
    return result.scalars().first()


async def cancel_my_request(
    db: AsyncSession, user: UserContext,
) -> AccountDeletionRequest:
    """Withdraw the caller's PENDING request."""
    result = await db.execute(
        select(AccountDeletionRequest).where(
            AccountDeletionRequest.user_id == user.id,
            AccountDeletionRequest.status == AccountDeletionStatus.PENDING.value,
        )
    )
    req = result.scalars().first()
    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No pending deletion request to cancel.",
        )
    req.status = AccountDeletionStatus.CANCELLED.value
    await db.commit()
    await db.refresh(req)
    return req


async def list_requests_for_reviewer(
    db: AsyncSession, reviewer: UserContext, status_filter: str = "PENDING",
) -> List[AccountDeletionRequest]:
    """
    Requests the caller is entitled to review:
      * admin       → parent/student/teacher requests within their institution.
      * super_admin → admin requests (across institutions).
    """
    stmt = select(AccountDeletionRequest)

    if status_filter and status_filter.upper() != "ALL":
        stmt = stmt.where(AccountDeletionRequest.status == status_filter.upper())

    if reviewer.role == "super_admin":
        stmt = stmt.where(AccountDeletionRequest.requester_role == "admin")
    else:  # admin (require_admin already excluded teacher/parent/student)
        stmt = stmt.where(
            AccountDeletionRequest.institution_id == reviewer.institution_id,
            AccountDeletionRequest.requester_role.in_(_ADMIN_REVIEWABLE_ROLES),
        )

    stmt = stmt.order_by(AccountDeletionRequest.created_at.desc(), AccountDeletionRequest.id.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def _load_reviewable_or_403(
    db: AsyncSession, reviewer: UserContext, request_id: int,
) -> AccountDeletionRequest:
    req = (await db.execute(
        select(AccountDeletionRequest).where(AccountDeletionRequest.id == request_id)
    )).scalars().first()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found.")

    if reviewer.role == "super_admin":
        if req.requester_role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Super-admins review admin deletion requests only.",
            )
    else:  # admin
        if req.requester_role not in _ADMIN_REVIEWABLE_ROLES or req.institution_id != reviewer.institution_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only review requests from users in your school.",
            )
    return req


async def approve_request(
    db: AsyncSession, reviewer: UserContext, request_id: int, note: Optional[str],
) -> AccountDeletionRequest:
    """Approve a request: deactivate the target account and record the review."""
    req = await _load_reviewable_or_403(db, reviewer, request_id)
    if req.status != AccountDeletionStatus.PENDING.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Request already {req.status.lower()}.",
        )

    target = (await db.execute(select(User).where(User.id == req.user_id))).scalars().first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target user not found.")

    target.is_active = False  # revoke access (get_current_user rejects inactive users)

    req.status = AccountDeletionStatus.APPROVED.value
    req.reviewed_by_user_id = reviewer.id
    req.reviewed_by_name = reviewer.name
    req.reviewed_at = datetime.now(timezone.utc)
    req.review_note = (note or None)

    await _write_audit(
        db, user_id=reviewer.id, action="APPROVE_ACCOUNT_DELETION",
        resource_id=req.id, institution_id=req.institution_id,
        description=f"Approved deletion of user_id={req.user_id} ({req.requester_role}); account deactivated.",
    )
    await db.commit()
    # Bound revocation latency to the next request — drop any cached is_active=True.
    await user_cache.invalidate(req.user_id)
    await db.refresh(req)
    logger.info("Account deletion approved request_id=%s by reviewer_id=%s", req.id, reviewer.id)
    return req


async def reject_request(
    db: AsyncSession, reviewer: UserContext, request_id: int, note: Optional[str],
) -> AccountDeletionRequest:
    """Decline a request — the account stays active."""
    req = await _load_reviewable_or_403(db, reviewer, request_id)
    if req.status != AccountDeletionStatus.PENDING.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Request already {req.status.lower()}.",
        )

    req.status = AccountDeletionStatus.REJECTED.value
    req.reviewed_by_user_id = reviewer.id
    req.reviewed_by_name = reviewer.name
    req.reviewed_at = datetime.now(timezone.utc)
    req.review_note = (note or None)

    await _write_audit(
        db, user_id=reviewer.id, action="REJECT_ACCOUNT_DELETION",
        resource_id=req.id, institution_id=req.institution_id,
        description=f"Rejected deletion request for user_id={req.user_id}.",
    )
    await db.commit()
    await db.refresh(req)
    return req
