"""add_missing_fk_indexes

Adds the foreign-key / hot-path indexes identified in the database indexing
report and reconciles model<->DB drift for the attendance & marks compound
indexes.

New indexes created here:
  * students.school_class_id    -> ix_students_school_class_id
  * students.parent_id          -> ix_students_parent_id
  * announcements.teacher_id    -> ix_announcements_teacher_id

Reconciled (created here only IF NOT EXISTS — they already exist in any DB
that ran migration c9f8a1b2e3d4; the statements are idempotent and exist so
this migration alone can bring a fresh/partial DB in line with the models,
now that these indexes are also declared in the SQLAlchemy models):
  * ix_attendance_date
  * ix_attendance_student_institution_subject_date
  * ix_attendance_class_date_institution
  * ix_marks_student_institution_test_subject
  * ix_marks_exam_institution_student

Production safety
-----------------
Every index is built with ``CREATE INDEX CONCURRENTLY IF NOT EXISTS`` so the
build does NOT take an ACCESS EXCLUSIVE lock and never blocks reads/writes on
the live ``students`` / ``announcements`` tables (important on Neon where a
plain CREATE INDEX would stall the single compute). CONCURRENTLY cannot run
inside a transaction, so the work is wrapped in an ``autocommit_block`` — the
rest of Alembic's transactional machinery is untouched.

Caveat: a CONCURRENTLY build can leave an INVALID index behind if it fails
mid-flight (e.g. the connection drops). The ``IF NOT EXISTS`` guard means a
re-run will NOT retry an invalid index — if a build fails, drop the invalid
index manually and re-run. This is the standard trade-off for non-blocking
index creation.

Revision ID: r6a7b8c9d0e1
Revises: q5f6a7b8c9d0
Create Date: 2026-05-30
"""
from typing import Sequence, Union

from alembic import op


revision: str = "r6a7b8c9d0e1"
down_revision: Union[str, Sequence[str], None] = "q5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (index_name, raw CREATE statement). CONCURRENTLY + IF NOT EXISTS so each is
# non-blocking and idempotent.
_CREATE_STATEMENTS = [
    # ── New FK / hot-path indexes ──────────────────────────────────────────
    (
        "ix_students_school_class_id",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_students_school_class_id "
        "ON students (school_class_id)",
    ),
    (
        "ix_students_parent_id",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_students_parent_id "
        "ON students (parent_id)",
    ),
    (
        "ix_announcements_teacher_id",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_announcements_teacher_id "
        "ON announcements (teacher_id)",
    ),
    # ── Drift reconciliation (idempotent; already present post-c9f8a1b2e3d4) ─
    (
        "ix_attendance_date",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_attendance_date "
        "ON attendance (date)",
    ),
    (
        "ix_attendance_student_institution_subject_date",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
        "ix_attendance_student_institution_subject_date "
        "ON attendance (student_id, institution_id, subject, date)",
    ),
    (
        "ix_attendance_class_date_institution",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
        "ix_attendance_class_date_institution "
        "ON attendance (school_class_id, date, institution_id)",
    ),
    (
        "ix_marks_student_institution_test_subject",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
        "ix_marks_student_institution_test_subject "
        "ON marks (student_id, institution_id, test_name, subject)",
    ),
    (
        "ix_marks_exam_institution_student",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
        "ix_marks_exam_institution_student "
        "ON marks (exam_id, institution_id, student_id)",
    ),
]

# Only the indexes THIS migration is the owner of get dropped on downgrade.
# The attendance/marks drift indexes belong to earlier migrations and are
# intentionally left alone.
_DROP_STATEMENTS = [
    "DROP INDEX CONCURRENTLY IF EXISTS ix_announcements_teacher_id",
    "DROP INDEX CONCURRENTLY IF EXISTS ix_students_parent_id",
    "DROP INDEX CONCURRENTLY IF EXISTS ix_students_school_class_id",
]


def upgrade() -> None:
    # CONCURRENTLY must run outside a transaction block.
    with op.get_context().autocommit_block():
        for _name, stmt in _CREATE_STATEMENTS:
            op.execute(stmt)


def downgrade() -> None:
    with op.get_context().autocommit_block():
        for stmt in _DROP_STATEMENTS:
            op.execute(stmt)
