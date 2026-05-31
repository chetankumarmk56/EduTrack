"""add roll_number to students with per-class alphabetical backfill

Revision ID: e1f2a3b4c5d6
Revises: f1a92c4b6e02
Create Date: 2026-05-17

Roll numbers are assigned per school class, in alphabetical order of the
student's name. Position 1 is the first student alphabetically, N is the
last. The column is kept nullable so unassigned (no school_class_id)
students remain valid.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('students', sa.Column('roll_number', sa.Integer(), nullable=True))
    op.create_index('ix_students_roll_number', 'students', ['roll_number'])

    # Backfill: per (institution_id, school_class_id), assign 1..N in name order.
    op.execute(text("""
        WITH ranked AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY institution_id, school_class_id
                    ORDER BY LOWER(name), id
                ) AS rn
            FROM students
            WHERE school_class_id IS NOT NULL
        )
        UPDATE students s
        SET roll_number = ranked.rn
        FROM ranked
        WHERE s.id = ranked.id
    """))


def downgrade() -> None:
    op.drop_index('ix_students_roll_number', table_name='students')
    op.drop_column('students', 'roll_number')
