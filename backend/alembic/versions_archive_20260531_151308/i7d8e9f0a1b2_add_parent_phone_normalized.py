"""add_parent_phone_normalized

Adds ``students.parent_phone_normalized`` — a last-10-digits canonical form
of ``parent_phone`` used for parent-login lookups. Backfills from existing
data so the index is immediately useful, then indexes it.

Why: the previous parent-by-phone login (auth_service.authenticate_parent_by_phone)
loaded every student with matching DOB into Python, then filtered on
phone. With 50k students across 100 schools, a single login could
materialise thousands of rows from other schools' tenants into one
worker's memory.

The new column is shared across tenants (a phone number is not
institution-scoped at the database layer) but every consumer must still
read ``institution_id`` off the matched ``students`` row — never trust a
request header.

Revision ID: i7d8e9f0a1b2
Revises: h6c7d8e9f0a1
Create Date: 2026-05-23
"""
from alembic import op
import sqlalchemy as sa


revision = "i7d8e9f0a1b2"
down_revision = "h6c7d8e9f0a1"
branch_labels = None
depends_on = None


def _last_10_digits(raw):
    """Same logic as app.models.directory.directory._normalize_phone_to_last10.

    Duplicated here on purpose: Alembic migrations should never import
    runtime code — that breaks when a future refactor changes the module
    layout and you try to replay an old migration.
    """
    if raw is None:
        return None
    digits = "".join(ch for ch in str(raw) if ch.isdigit())
    if len(digits) < 10:
        return None
    return digits[-10:]


def upgrade():
    # 1. Add the column nullable so the table isn't rewritten in-place
    #    on Postgres (would block writes on a large students table).
    op.add_column(
        "students",
        sa.Column("parent_phone_normalized", sa.String(length=10), nullable=True),
    )

    # 2. Backfill from existing parent_phone values. We do this in Python
    #    rather than a SQL regex so the rule matches the runtime
    #    validator byte-for-byte (no risk of "Postgres regex stripped
    #    differently than Python str.isdigit").
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, parent_phone FROM students WHERE parent_phone IS NOT NULL")
    ).fetchall()
    updates = []
    for row_id, phone in rows:
        normalized = _last_10_digits(phone)
        if normalized:
            updates.append({"row_id": row_id, "norm": normalized})

    if updates:
        # Chunked UPDATE so a 50k-row backfill doesn't push a massive
        # transaction across the wire all at once.
        chunk_size = 500
        for i in range(0, len(updates), chunk_size):
            chunk = updates[i:i + chunk_size]
            conn.execute(
                sa.text(
                    "UPDATE students SET parent_phone_normalized = :norm "
                    "WHERE id = :row_id"
                ),
                chunk,
            )

    # 3. Compound index on (parent_phone_normalized, dob). This is the
    #    exact lookup the new authenticate_parent_by_phone uses. dob is
    #    already a string column so no casting needed.
    op.create_index(
        "ix_students_parent_phone_norm_dob",
        "students",
        ["parent_phone_normalized", "dob"],
    )


def downgrade():
    op.drop_index("ix_students_parent_phone_norm_dob", table_name="students")
    op.drop_column("students", "parent_phone_normalized")
