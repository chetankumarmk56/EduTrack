"""
Account-deletion request workflow.

A user (parent/student/teacher/admin) can request deletion of their own account
from the web portal or the mobile app. The request lands here as ``PENDING`` and
is reviewed by an approver:

  * parent / student / teacher requests → approved by an ADMIN of the same school
  * admin requests                      → approved by a SUPER_ADMIN

On approval the target user's ``is_active`` is set to ``False`` — access is
revoked immediately via the auth dependency (``get_current_user`` rejects
inactive users) and the Redis ``user_cache`` is invalidated so the revocation is
effectively instant. Full data erasure is handled separately under the Data
Processing Agreement; this row is the auditable record of the request and its
disposition.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Index
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.core import TimestampMixin
import enum


class AccountDeletionStatus(str, enum.Enum):
    """Lifecycle of an account-deletion request."""
    PENDING = "PENDING"      # awaiting reviewer action
    APPROVED = "APPROVED"    # reviewer approved → account deactivated
    REJECTED = "REJECTED"    # reviewer declined
    CANCELLED = "CANCELLED"  # withdrawn by the requester before review


class AccountDeletionRequest(Base, TimestampMixin):
    """A user-submitted request to delete their own account, awaiting/post review."""
    __tablename__ = "account_deletion_requests"

    id = Column(Integer, primary_key=True, index=True)

    # Tenancy + requester. institution_id is nullable only to tolerate the
    # (blocked) super-admin edge — every real requester carries one.
    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    requester_role = Column(String, nullable=False, index=True)  # role snapshot at request time
    requester_name = Column(String, nullable=True)
    requester_email = Column(String, nullable=True)

    reason = Column(Text, nullable=True)

    status = Column(
        String, nullable=False,
        default=AccountDeletionStatus.PENDING.value, index=True,
    )

    # Review disposition.
    reviewed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_by_name = Column(String, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    review_note = Column(Text, nullable=True)

    # Relationships (disambiguated — two FKs point at users).
    user = relationship("User", foreign_keys=[user_id])
    reviewer = relationship("User", foreign_keys=[reviewed_by_user_id])

    __table_args__ = (
        Index("ix_acct_del_inst_status", "institution_id", "status"),
        Index("ix_acct_del_role_status", "requester_role", "status"),
    )
