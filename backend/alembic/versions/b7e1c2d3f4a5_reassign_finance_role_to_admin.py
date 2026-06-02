"""reassign finance role to admin

The Finance role has been removed from the system; all finance-related
operations are now handled by the Admin role. Existing users that were
provisioned with role='finance' are migrated to role='admin' so they
retain access to every surface previously available to them (finance
dashboard, ledger, manual-payment review, etc.).

No schema change is required — `users.role` is a free-form String column,
not a database enum — so this is a data-only migration.

Revision ID: b7e1c2d3f4a5
Revises: a6d38a450102
Create Date: 2026-06-02

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7e1c2d3f4a5'
down_revision: Union[str, Sequence[str], None] = 'a6d38a450102'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Promote any remaining finance users to admin."""
    op.execute(
        sa.text("UPDATE users SET role = 'admin' WHERE role = 'finance'")
    )


def downgrade() -> None:
    """No-op.

    The finance role is no longer a valid value and there is no record of
    which admins were previously finance users, so this migration cannot be
    safely reversed. Downgrading leaves the promoted users as admins.
    """
    pass
