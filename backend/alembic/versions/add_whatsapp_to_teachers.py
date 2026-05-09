"""add_whatsapp_to_teachers

Revision ID: add_whatsapp_to_teachers
Revises: c9f8a1b2e3d4
Create Date: 2026-04-29 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_whatsapp_to_teachers'
down_revision: Union[str, Sequence[str], None] = 'c9f8a1b2e3d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema. Idempotent — safe to run on DBs where the column was
    already added via metadata.create_all()."""
    op.execute("ALTER TABLE teachers ADD COLUMN IF NOT EXISTS whatsapp VARCHAR")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('teachers', 'whatsapp')
