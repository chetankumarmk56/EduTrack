"""add_homework_to_announcements

Extends the Announcement model to support a Homework category and adds a
per-student confirmation table.

Design notes:
- ``announcements.category`` is added as a non-null VARCHAR with a server
  default of 'NORMAL' so existing rows backfill in place without a rewrite,
  and old clients that POST without a category keep working.
- Homework-specific columns (``due_date``, ``subject``, ``instructions``)
  are nullable — they live on the same table to avoid a second join on the
  parent feed, which is the hottest read path.
- ``homework_confirmations`` enforces uniqueness on (announcement_id,
  student_id) — not (announcement_id, parent_id) — because one parent may
  have multiple children on the same class-wide homework, and each child
  needs its own confirmation row.

Revision ID: j8e9f0a1b2c3
Revises: i7d8e9f0a1b2
Create Date: 2026-05-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "j8e9f0a1b2c3"
down_revision: Union[str, Sequence[str], None] = "i7d8e9f0a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add category column with server default so backfill is implicit.
    op.add_column(
        "announcements",
        sa.Column(
            "category",
            sa.String(length=32),
            nullable=False,
            server_default="NORMAL",
        ),
    )
    op.create_index(
        "ix_announcements_category", "announcements", ["category"], unique=False
    )

    # 2. Homework-only optional fields. All nullable so old rows are valid.
    op.add_column(
        "announcements", sa.Column("due_date", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "announcements", sa.Column("subject", sa.String(length=120), nullable=True)
    )
    op.add_column("announcements", sa.Column("instructions", sa.Text(), nullable=True))

    # 3. Per-student homework confirmation table.
    op.create_table(
        "homework_confirmations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("announcement_id", sa.UUID(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column(
            "confirmed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["announcement_id"], ["announcements.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_id"], ["parents.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "announcement_id", "student_id", name="uq_homework_confirmation_student"
        ),
    )
    op.create_index(
        "ix_homework_confirmations_announcement",
        "homework_confirmations",
        ["announcement_id"],
        unique=False,
    )
    op.create_index(
        "ix_homework_confirmations_student",
        "homework_confirmations",
        ["student_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_homework_confirmations_student", table_name="homework_confirmations"
    )
    op.drop_index(
        "ix_homework_confirmations_announcement", table_name="homework_confirmations"
    )
    op.drop_table("homework_confirmations")

    op.drop_column("announcements", "instructions")
    op.drop_column("announcements", "subject")
    op.drop_column("announcements", "due_date")
    op.drop_index("ix_announcements_category", table_name="announcements")
    op.drop_column("announcements", "category")
