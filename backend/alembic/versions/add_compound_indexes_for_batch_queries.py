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
    """Upgrade schema - Add compound indexes for hot query paths."""
    # Attendance batch queries: (student_id, institution_id, subject, date)
    op.create_index(
        'ix_attendance_student_institution_subject_date',
        'attendance',
        ['student_id', 'institution_id', 'subject', 'date'],
        unique=False
    )
    
    # Attendance queries by class: (school_class_id, date, institution_id)
    op.create_index(
        'ix_attendance_class_date_institution',
        'attendance',
        ['school_class_id', 'date', 'institution_id'],
        unique=False
    )
    
    # Marks queries: (student_id, institution_id, test_name, subject)
    op.create_index(
        'ix_marks_student_institution_test_subject',
        'marks',
        ['student_id', 'institution_id', 'test_name', 'subject'],
        unique=False
    )
    
    # Marks queries by exam: (exam_id, institution_id, student_id)
    op.create_index(
        'ix_marks_exam_institution_student',
        'marks',
        ['exam_id', 'institution_id', 'student_id'],
        unique=False
    )
    
    # Student queries by institution: (institution_id, student_id)
    op.create_index(
        'ix_students_institution_id_student_id',
        'students',
        ['institution_id', 'student_id'],
        unique=False
    )


def downgrade() -> None:
    """Downgrade schema - Drop compound indexes."""
    op.drop_index('ix_students_institution_id_student_id', table_name='students')
    op.drop_index('ix_marks_exam_institution_student', table_name='marks')
    op.drop_index('ix_marks_student_institution_test_subject', table_name='marks')
    op.drop_index('ix_attendance_class_date_institution', table_name='attendance')
    op.drop_index('ix_attendance_student_institution_subject_date', table_name='attendance')
