"""add tuition_fee and fee_due_date to grades

Revision ID: a1b2c3d4e5f6
Revises: f1a92c4b6e02
Create Date: 2026-05-16

The Grade SQLAlchemy model already had these columns, but no migration ever
created them in the database. Adding them now so the admin "Class Payment Fee"
form can persist values.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'f1a92c4b6e02'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_columns(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {c['name'] for c in inspector.get_columns(table_name)}


def upgrade() -> None:
    # Idempotent — production DB (built from alembic) is missing these columns,
    # but dev DBs built via Base.metadata.create_all() already have them.
    existing = _existing_columns('grades')
    with op.batch_alter_table('grades', schema=None) as batch_op:
        if 'tuition_fee' not in existing:
            batch_op.add_column(sa.Column('tuition_fee', sa.Float(), nullable=True, server_default='0'))
        if 'fee_due_date' not in existing:
            batch_op.add_column(sa.Column('fee_due_date', sa.Date(), nullable=True))


def downgrade() -> None:
    existing = _existing_columns('grades')
    with op.batch_alter_table('grades', schema=None) as batch_op:
        if 'fee_due_date' in existing:
            batch_op.drop_column('fee_due_date')
        if 'tuition_fee' in existing:
            batch_op.drop_column('tuition_fee')
