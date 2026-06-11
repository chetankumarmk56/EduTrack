"""drop account deletion requests

Removes the ``account_deletion_requests`` table that backed the in-app
account-deletion request → approval workflow (added in f3a5c7e9b1d2). That
self-service flow has been retired: account/data deletion is now handled
administratively (users contact their School Administrator, who can escalate to
ArkenEdu support), as documented at arkenedu.com/account-deletion.

The table was created by f3a5c7e9b1d2, so dropping the table also drops its
indexes. ``IF EXISTS`` / ``CASCADE`` keeps this a safe no-op on any database
where the table was never materialised. ``downgrade`` faithfully recreates the
table and indexes so the migration is fully reversible.

Revision ID: a4c6e8b0d2f5
Revises: f3a5c7e9b1d2
Create Date: 2026-06-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a4c6e8b0d2f5'
down_revision: Union[str, Sequence[str], None] = 'f3a5c7e9b1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Dropping the table also drops its indexes. IF EXISTS / CASCADE guards
    # against databases where the table was never materialised or has stray
    # dependents.
    op.execute(sa.text('DROP TABLE IF EXISTS "account_deletion_requests" CASCADE'))


def downgrade() -> None:
    # Recreate the table exactly as f3a5c7e9b1d2 did, so the feature can be
    # restored by downgrading.
    op.create_table(
        "account_deletion_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("institution_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("requester_role", sa.String(), nullable=False),
        sa.Column("requester_name", sa.String(), nullable=True),
        sa.Column("requester_email", sa.String(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="PENDING"),
        sa.Column("reviewed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("reviewed_by_name", sa.String(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["institution_id"], ["institutions.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_account_deletion_requests_id"), "account_deletion_requests", ["id"])
    op.create_index(op.f("ix_account_deletion_requests_institution_id"), "account_deletion_requests", ["institution_id"])
    op.create_index(op.f("ix_account_deletion_requests_user_id"), "account_deletion_requests", ["user_id"])
    op.create_index(op.f("ix_account_deletion_requests_requester_role"), "account_deletion_requests", ["requester_role"])
    op.create_index(op.f("ix_account_deletion_requests_status"), "account_deletion_requests", ["status"])
    op.create_index("ix_acct_del_inst_status", "account_deletion_requests", ["institution_id", "status"])
    op.create_index("ix_acct_del_role_status", "account_deletion_requests", ["requester_role", "status"])
