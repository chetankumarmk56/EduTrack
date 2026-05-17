"""collapse announcement priority to normal/important

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-05-16

The announcement priority column previously held LOW / MEDIUM / HIGH.
We've simplified the model to NORMAL (default) and IMPORTANT, so existing
rows need their string values remapped. The column is already VARCHAR
(see b2c3d4e5f6a7), so no schema change is required.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE announcements SET priority = 'IMPORTANT' WHERE priority = 'HIGH'")
    op.execute("UPDATE announcements SET priority = 'NORMAL' WHERE priority IN ('LOW', 'MEDIUM')")


def downgrade() -> None:
    # Best-effort: old MEDIUM values were collapsed into NORMAL and can't be recovered.
    op.execute("UPDATE announcements SET priority = 'HIGH' WHERE priority = 'IMPORTANT'")
    op.execute("UPDATE announcements SET priority = 'LOW' WHERE priority = 'NORMAL'")
