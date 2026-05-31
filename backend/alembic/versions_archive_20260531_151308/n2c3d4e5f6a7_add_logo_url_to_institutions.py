"""add logo_url to institutions

Stores the storage identifier (S3 key or /static/uploads path) for the
school logo uploaded by super-admin on school creation. Nullable — schools
created without a logo keep NULL here and the UI falls back to a generic
building icon.

Revision ID: n2c3d4e5f6a7
Revises: m1b2c3d4e5f6
Create Date: 2026-05-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "n2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "m1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return column_name in {c["name"] for c in inspector.get_columns(table_name)}


def upgrade() -> None:
    if not _has_column("institutions", "logo_url"):
        with op.batch_alter_table("institutions", schema=None) as batch_op:
            batch_op.add_column(sa.Column("logo_url", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("institutions", schema=None) as batch_op:
        batch_op.drop_column("logo_url")
