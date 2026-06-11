"""
Account-deletion request endpoints.

Any authenticated user can request deletion of their own account; reviewers
(admins for their school's users, super-admins for admins) list and act on those
requests. See ``app.services.account_deletion`` for the authorisation rules.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_admin, UserContext
from app.schemas import account_deletion as schemas
from app.services.account_deletion import account_deletion_service as svc

router = APIRouter(prefix="/api/account-deletion", tags=["account-deletion"])


# ── Self-service (any authenticated user) ──────────────────────────────────────

@router.post("/requests", response_model=schemas.AccountDeletionMessageResponse)
async def create_my_request(
    payload: schemas.AccountDeletionRequestCreate,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
):
    """Submit a deletion request for the caller's own account."""
    req = await svc.create_request(db, user, payload.reason)
    return {
        "message": "Account deletion request submitted. Your school will review it.",
        "request": req,
    }


@router.get("/requests/me", response_model=Optional[schemas.AccountDeletionRequestResponse])
async def get_my_request(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
):
    """The caller's most recent deletion request (any status), or null."""
    return await svc.get_my_request(db, user)


@router.post("/requests/me/cancel", response_model=schemas.AccountDeletionMessageResponse)
async def cancel_my_request(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
):
    """Withdraw the caller's pending deletion request."""
    req = await svc.cancel_my_request(db, user)
    return {"message": "Your deletion request was cancelled.", "request": req}


# ── Reviewer (admin / super-admin) ─────────────────────────────────────────────

@router.get("/requests", response_model=List[schemas.AccountDeletionRequestResponse])
async def list_requests(
    status_filter: str = "PENDING",
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_admin),
):
    """
    Requests the caller may review. Admins see their school's
    parent/student/teacher requests; super-admins see admin requests.
    Pass ``status_filter=ALL`` to include reviewed requests.
    """
    return await svc.list_requests_for_reviewer(db, user, status_filter)


@router.post("/requests/{request_id}/approve", response_model=schemas.AccountDeletionMessageResponse)
async def approve_request(
    request_id: int,
    payload: Optional[schemas.AccountDeletionReviewAction] = None,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_admin),
):
    """Approve a request — deactivates the target account."""
    note = payload.note if payload else None
    req = await svc.approve_request(db, user, request_id, note)
    return {
        "message": "Account deletion approved. The account has been deactivated.",
        "request": req,
    }


@router.post("/requests/{request_id}/reject", response_model=schemas.AccountDeletionMessageResponse)
async def reject_request(
    request_id: int,
    payload: Optional[schemas.AccountDeletionReviewAction] = None,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_admin),
):
    """Decline a request — the account stays active."""
    note = payload.note if payload else None
    req = await svc.reject_request(db, user, request_id, note)
    return {"message": "Deletion request rejected.", "request": req}
