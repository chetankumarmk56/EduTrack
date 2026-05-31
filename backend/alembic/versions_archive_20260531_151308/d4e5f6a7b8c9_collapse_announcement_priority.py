"""collapse announcement priority to normal/important

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-05-16

The announcement priority column previously held LOW / MEDIUM / HIGH.
We've simplified the model to NORMAL (default) and IMPORTANT, so existing
rows need their string values remapped.

Production was found to have priority as VARCHAR(6) — wide enough for the
old LOW/MEDIUM/HIGH values but not the new IMPORTANT (9 chars), causing
the data update to fail with StringDataRightTruncation. The earlier
b2c3d4e5f6a7 migration only widened columns that were still native enum
on each environment, so prod skipped it. We widen the column here
defensively before remapping the values.
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _priority_char_max_length(bind) -> int | None:
    row = bind.execute(text("""
        SELECT character_maximum_length
        FROM information_schema.columns
        WHERE table_name = 'announcements' AND column_name = 'priority'
    """)).first()
    return row[0] if row else None


def upgrade() -> None:
    bind = op.get_bind()
    max_len = _priority_char_max_length(bind)
    # Widen the column if it's narrower than the longest new value ('IMPORTANT', 9 chars).
    # NULL max_len means TEXT/unbounded VARCHAR — already wide enough.
    if max_len is not None and max_len < 32:
        op.execute("ALTER TABLE announcements ALTER COLUMN priority TYPE VARCHAR(32)")

    op.execute("UPDATE announcements SET priority = 'IMPORTANT' WHERE priority = 'HIGH'")
    op.execute("UPDATE announcements SET priority = 'NORMAL' WHERE priority IN ('LOW', 'MEDIUM')")


def downgrade() -> None:
    # Best-effort: old MEDIUM values were collapsed into NORMAL and can't be recovered.
    # We don't shrink the column back — keeping VARCHAR(32) is harmless and
    # avoids a second round-trip of truncation risk on a re-upgrade.
    op.execute("UPDATE announcements SET priority = 'HIGH' WHERE priority = 'IMPORTANT'")
    op.execute("UPDATE announcements SET priority = 'LOW' WHERE priority = 'NORMAL'")
