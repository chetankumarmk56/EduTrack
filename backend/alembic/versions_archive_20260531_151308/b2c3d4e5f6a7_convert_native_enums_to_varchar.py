"""convert native enum columns to varchar

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-16

The models declare these enum columns with native_enum=False (i.e. VARCHAR),
but older migrations created them as Postgres native ENUM types. SQLAlchemy
then sends VARCHAR values that Postgres refuses to auto-cast — every INSERT
fails with "column X is of type Y but expression is of type character varying".

Converts the columns to VARCHAR and drops the now-unused enum types.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (table, column, enum type name to drop)
COLUMNS = [
    ('student_fees', 'status', 'studentfeestatus'),
    ('announcements', 'type', 'announcementtype'),
    ('announcements', 'priority', 'announcementpriority'),
]


def _column_udt(bind, table: str, column: str) -> tuple[str, str] | None:
    row = bind.execute(text("""
        SELECT data_type, udt_name
        FROM information_schema.columns
        WHERE table_name = :t AND column_name = :c
    """), {'t': table, 'c': column}).first()
    return (row[0], row[1]) if row else None


def upgrade() -> None:
    bind = op.get_bind()
    for table, column, enum_name in COLUMNS:
        info = _column_udt(bind, table, column)
        if info is None:
            continue  # Table/column doesn't exist (skip silently)
        data_type, udt = info
        # 'USER-DEFINED' means it's a custom type — i.e. our native enum.
        if data_type == 'USER-DEFINED':
            op.execute(
                f"ALTER TABLE {table} ALTER COLUMN {column} "
                f"TYPE VARCHAR(32) USING {column}::text"
            )

    # Drop enum types (CASCADE clears any leftover dependencies).
    for _, _, enum_name in COLUMNS:
        op.execute(f"DROP TYPE IF EXISTS {enum_name} CASCADE")


def downgrade() -> None:
    # Recreate the enum types and convert columns back.
    op.execute("CREATE TYPE studentfeestatus AS ENUM ('UNPAID', 'PARTIAL', 'PAID')")
    op.execute("CREATE TYPE announcementtype AS ENUM ('CLASS', 'STUDENT')")
    op.execute("CREATE TYPE announcementpriority AS ENUM ('LOW', 'MEDIUM', 'HIGH')")
    op.execute("ALTER TABLE student_fees ALTER COLUMN status TYPE studentfeestatus USING status::studentfeestatus")
    op.execute("ALTER TABLE announcements ALTER COLUMN type TYPE announcementtype USING type::announcementtype")
    op.execute("ALTER TABLE announcements ALTER COLUMN priority TYPE announcementpriority USING priority::announcementpriority")
