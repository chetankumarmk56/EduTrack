"""Pydantic schemas for the account-deletion request workflow."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class AccountDeletionRequestCreate(BaseModel):
    """Body for a user submitting a deletion request for their own account."""
    reason: Optional[str] = None


class AccountDeletionReviewAction(BaseModel):
    """Optional note an approver can attach when approving/rejecting."""
    note: Optional[str] = None


class AccountDeletionRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    institution_id: Optional[int] = None
    user_id: int
    requester_role: str
    requester_name: Optional[str] = None
    requester_email: Optional[str] = None
    reason: Optional[str] = None
    status: str
    reviewed_by_user_id: Optional[int] = None
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_note: Optional[str] = None
    created_at: Optional[datetime] = None


class AccountDeletionMessageResponse(BaseModel):
    """Wraps a mutation result with a human-readable message for the UI toast."""
    message: str
    request: Optional[AccountDeletionRequestResponse] = None
