"""add deleted_at to institutions for 90d soft-delete

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return column_name in {c['name'] for c in inspector.get_columns(table_name)}


def upgrade() -> None:
    if not _has_column('institutions', 'deleted_at'):
        with op.batch_alter_table('institutions', schema=None) as batch_op:
            batch_op.add_column(sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
        op.create_index('ix_institutions_deleted_at', 'institutions', ['deleted_at'])


def downgrade() -> None:
    op.drop_index('ix_institutions_deleted_at', table_name='institutions')
    with op.batch_alter_table('institutions', schema=None) as batch_op:
        batch_op.drop_column('deleted_at')
