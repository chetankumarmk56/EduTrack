"""add_compound_indexes_for_batch_queries

Revision ID: c9f8a1b2e3d4
Revises: add_account_lockout, add_audit_logs, d68199a01738
Create Date: 2026-04-27 14:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9f8a1b2e3d4'
down_revision: Union[str, Sequence[str], None] = ('add_account_lockout', 'add_audit_logs', 'd68199a01738')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema - Add compound indexes for hot query paths.

    Uses IF NOT EXISTS so the migration is safe to run on databases where
    these indexes were already created out-of-band (e.g. via metadata.create_all).
    """
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_attendance_student_institution_subject_date "
        "ON attendance (student_id, institution_id, subject, date)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_attendance_class_date_institution "
        "ON attendance (school_class_id, date, institution_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_marks_student_institution_test_subject "
        "ON marks (student_id, institution_id, test_name, subject)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_marks_exam_institution_student "
        "ON marks (exam_id, institution_id, student_id)"
    )
    # Note: the original migration tried to index students(institution_id, student_id),
    # but students has no student_id column (just `id`). That index was always broken
    # and is omitted here.


def downgrade() -> None:
    """Downgrade schema - Drop compound indexes."""
    op.execute('DROP INDEX IF EXISTS ix_marks_exam_institution_student')
    op.execute('DROP INDEX IF EXISTS ix_marks_student_institution_test_subject')
    op.execute('DROP INDEX IF EXISTS ix_attendance_class_date_institution')
    op.execute('DROP INDEX IF EXISTS ix_attendance_student_institution_subject_date')
