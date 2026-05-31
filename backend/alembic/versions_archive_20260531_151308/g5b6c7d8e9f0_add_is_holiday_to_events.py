"""add is_holiday column to events

Revision ID: g5b6c7d8e9f0
Revises: f9a2c3b1d4e8
Create Date: 2026-05-20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'g5b6c7d8e9f0'
down_revision: Union[str, Sequence[str], None] = 'f9a2c3b1d4e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'events',
        sa.Column('is_holiday', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('events', 'is_holiday')
