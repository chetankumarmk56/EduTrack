"""add room_number to school_classes

Revision ID: b9e4d5c2a8f7
Revises: a8f3c2d1b4e6
Create Date: 2026-05-09 00:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b9e4d5c2a8f7'
down_revision: Union[str, Sequence[str], None] = 'a8f3c2d1b4e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add a room_number column to school_classes — one room per class+section."""
    op.execute("ALTER TABLE school_classes ADD COLUMN IF NOT EXISTS room_number VARCHAR")


def downgrade() -> None:
    op.execute("ALTER TABLE school_classes DROP COLUMN IF EXISTS room_number")
