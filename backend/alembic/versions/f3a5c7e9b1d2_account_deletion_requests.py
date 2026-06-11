"""account deletion requests

Adds the ``account_deletion_requests`` table backing the in-app account-deletion
request → approval workflow:

  * parent/student/teacher requests are approved by an institution ADMIN;
  * admin requests are approved by a SUPER_ADMIN.

On approval the application sets ``users.is_active = False`` (handled in the
service layer, not this migration). This table is the auditable record of the
request and its disposition.

Revision ID: f3a5c7e9b1d2
Revises: e2d4f6a8b0c1
Create Date: 2026-06-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3a5c7e9b1d2'
down_revision: Union[str, Sequence[str], None] = 'e2d4f6a8b0c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
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


def downgrade() -> None:
    op.drop_index("ix_acct_del_role_status", table_name="account_deletion_requests")
    op.drop_index("ix_acct_del_inst_status", table_name="account_deletion_requests")
    op.drop_index(op.f("ix_account_deletion_requests_status"), table_name="account_deletion_requests")
    op.drop_index(op.f("ix_account_deletion_requests_requester_role"), table_name="account_deletion_requests")
    op.drop_index(op.f("ix_account_deletion_requests_user_id"), table_name="account_deletion_requests")
    op.drop_index(op.f("ix_account_deletion_requests_institution_id"), table_name="account_deletion_requests")
    op.drop_index(op.f("ix_account_deletion_requests_id"), table_name="account_deletion_requests")
    op.drop_table("account_deletion_requests")
