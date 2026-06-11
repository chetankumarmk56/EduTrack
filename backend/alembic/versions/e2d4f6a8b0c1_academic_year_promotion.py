"""academic year as a first-class entity + promotion scaffolding

Adds the academic-year lifecycle schema that lets a school roll over to a new
year without re-entering data and without losing history:

  * ``academic_years``  — the year entity (per institution, one ``is_active``).
  * ``enrollments``     — one row per student per year (historical roster of
                          record, with immutable grade/section/class name
                          snapshots).
  * ``promotion_runs``  — audit + idempotency record for a year-end promotion.
  * ``students.admission_number`` — stable institution-wide admission identity.
  * ``academic_year_id`` on ``attendance`` / ``marks`` / ``exams`` /
    ``student_fees`` so academic data is year-scoped (clean new-year boundary;
    arrears labelling).

Backfill (per institution): generate admission numbers, create the current
April–March year as active, enroll every active student under it (snapshotting
their current class), and stamp all existing academic rows with that year — so
history is clean from day one.

Revision ID: e2d4f6a8b0c1
Revises: c8f2a1b4d6e7
Create Date: 2026-06-09

"""
from typing import Sequence, Union
from datetime import date

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e2d4f6a8b0c1'
down_revision: Union[str, Sequence[str], None] = 'c8f2a1b4d6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _current_year_label(today: date | None = None) -> str:
    """India April–March convention. Mirrors
    finance.ledger_helpers.resolve_academic_year — inlined so the migration
    stays frozen and independent of later app refactors."""
    today = today or date.today()
    start = today.year if today.month >= 4 else today.year - 1
    return f"{start}-{start + 1}"


def upgrade() -> None:
    # ── academic_years ─────────────────────────────────────────────────────
    op.create_table(
        'academic_years',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('institution_id', sa.Integer(), nullable=False),
        sa.Column('label', sa.String(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('status', sa.String(), nullable=False, server_default='ACTIVE'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['institution_id'], ['institutions.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('institution_id', 'label', name='uq_academic_year_inst_label'),
    )
    op.create_index(op.f('ix_academic_years_id'), 'academic_years', ['id'], unique=False)
    op.create_index(op.f('ix_academic_years_institution_id'), 'academic_years', ['institution_id'], unique=False)
    op.create_index(op.f('ix_academic_years_label'), 'academic_years', ['label'], unique=False)
    op.create_index(op.f('ix_academic_years_is_active'), 'academic_years', ['is_active'], unique=False)

    # ── enrollments ────────────────────────────────────────────────────────
    op.create_table(
        'enrollments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('student_id', sa.Integer(), nullable=False),
        sa.Column('school_class_id', sa.Integer(), nullable=True),
        sa.Column('grade_id', sa.Integer(), nullable=True),
        sa.Column('academic_year_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='ACTIVE'),
        sa.Column('roll_number', sa.Integer(), nullable=True),
        sa.Column('grade_name_snapshot', sa.String(), nullable=True),
        sa.Column('section_name_snapshot', sa.String(), nullable=True),
        sa.Column('class_name_snapshot', sa.String(), nullable=True),
        sa.Column('institution_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ),
        sa.ForeignKeyConstraint(['school_class_id'], ['school_classes.id'], ),
        sa.ForeignKeyConstraint(['grade_id'], ['grades.id'], ),
        sa.ForeignKeyConstraint(['academic_year_id'], ['academic_years.id'], ),
        sa.ForeignKeyConstraint(['institution_id'], ['institutions.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('student_id', 'academic_year_id', name='uq_enrollment_student_year'),
    )
    op.create_index(op.f('ix_enrollments_id'), 'enrollments', ['id'], unique=False)
    op.create_index(op.f('ix_enrollments_student_id'), 'enrollments', ['student_id'], unique=False)
    op.create_index(op.f('ix_enrollments_school_class_id'), 'enrollments', ['school_class_id'], unique=False)
    op.create_index(op.f('ix_enrollments_grade_id'), 'enrollments', ['grade_id'], unique=False)
    op.create_index(op.f('ix_enrollments_academic_year_id'), 'enrollments', ['academic_year_id'], unique=False)
    op.create_index(op.f('ix_enrollments_status'), 'enrollments', ['status'], unique=False)
    op.create_index(op.f('ix_enrollments_institution_id'), 'enrollments', ['institution_id'], unique=False)
    op.create_index('ix_enrollment_year_class', 'enrollments', ['academic_year_id', 'school_class_id'], unique=False)

    # ── promotion_runs ─────────────────────────────────────────────────────
    op.create_table(
        'promotion_runs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('institution_id', sa.Integer(), nullable=False),
        sa.Column('from_year_id', sa.Integer(), nullable=False),
        sa.Column('to_year_id', sa.Integer(), nullable=False),
        sa.Column('performed_by_id', sa.Integer(), nullable=True),
        sa.Column('summary', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['institution_id'], ['institutions.id'], ),
        sa.ForeignKeyConstraint(['from_year_id'], ['academic_years.id'], ),
        sa.ForeignKeyConstraint(['to_year_id'], ['academic_years.id'], ),
        sa.ForeignKeyConstraint(['performed_by_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('institution_id', 'from_year_id', name='uq_promotion_run_inst_from_year'),
    )
    op.create_index(op.f('ix_promotion_runs_id'), 'promotion_runs', ['id'], unique=False)
    op.create_index(op.f('ix_promotion_runs_institution_id'), 'promotion_runs', ['institution_id'], unique=False)
    op.create_index(op.f('ix_promotion_runs_from_year_id'), 'promotion_runs', ['from_year_id'], unique=False)
    op.create_index(op.f('ix_promotion_runs_to_year_id'), 'promotion_runs', ['to_year_id'], unique=False)

    # ── new columns ────────────────────────────────────────────────────────
    op.add_column('students', sa.Column('admission_number', sa.String(), nullable=True))
    op.create_index(op.f('ix_students_admission_number'), 'students', ['admission_number'], unique=False)

    for tbl in ('attendance', 'marks', 'exams', 'student_fees'):
        op.add_column(tbl, sa.Column('academic_year_id', sa.Integer(), nullable=True))
        op.create_index(op.f(f'ix_{tbl}_academic_year_id'), tbl, ['academic_year_id'], unique=False)
        op.create_foreign_key(
            f'fk_{tbl}_academic_year_id_academic_years', tbl,
            'academic_years', ['academic_year_id'], ['id'],
        )

    # ── backfill ───────────────────────────────────────────────────────────
    label = _current_year_label()
    start_date = date(int(label.split('-')[0]), 4, 1)
    end_date = date(int(label.split('-')[0]) + 1, 3, 31)

    # 1. Stable admission numbers for existing students.
    op.execute(sa.text(
        "UPDATE students SET admission_number = 'ADM-' || institution_id || '-' || id "
        "WHERE admission_number IS NULL"
    ))

    # 2. One active current-year row per institution.
    op.execute(sa.text(
        "INSERT INTO academic_years "
        "(institution_id, label, start_date, end_date, is_active, status, created_at) "
        "SELECT id, :label, :start, :end, true, 'ACTIVE', now() FROM institutions"
    ).bindparams(label=label, start=start_date, end=end_date))

    # 3. Enroll every active student under their institution's active year,
    #    snapshotting their current grade/section/class names.
    op.execute(sa.text(
        "INSERT INTO enrollments "
        "(student_id, school_class_id, grade_id, academic_year_id, status, roll_number, "
        " grade_name_snapshot, section_name_snapshot, class_name_snapshot, institution_id, created_at) "
        "SELECT s.id, s.school_class_id, sc.grade_id, ay.id, 'ACTIVE', s.roll_number, "
        "       g.name, sec.name, "
        "       COALESCE(sc.display_name, g.name || '-' || sec.name, g.name), "
        "       s.institution_id, now() "
        "FROM students s "
        "JOIN academic_years ay ON ay.institution_id = s.institution_id AND ay.is_active = true "
        "LEFT JOIN school_classes sc ON sc.id = s.school_class_id "
        "LEFT JOIN grades g ON g.id = sc.grade_id "
        "LEFT JOIN sections sec ON sec.id = sc.section_id "
        "WHERE s.is_active = true"
    ))

    # 4. Stamp existing academic rows with the active year (per institution).
    for tbl in ('attendance', 'marks', 'exams', 'student_fees'):
        op.execute(sa.text(
            f"UPDATE {tbl} AS t SET academic_year_id = ay.id "
            "FROM academic_years ay "
            "WHERE ay.institution_id = t.institution_id AND ay.is_active = true "
            "AND t.academic_year_id IS NULL"
        ))


def downgrade() -> None:
    # Drop the stamped columns first (they FK academic_years), then the tables.
    for tbl in ('attendance', 'marks', 'exams', 'student_fees'):
        op.drop_constraint(f'fk_{tbl}_academic_year_id_academic_years', tbl, type_='foreignkey')
        op.drop_index(op.f(f'ix_{tbl}_academic_year_id'), table_name=tbl)
        op.drop_column(tbl, 'academic_year_id')

    op.drop_index(op.f('ix_students_admission_number'), table_name='students')
    op.drop_column('students', 'admission_number')

    op.drop_index(op.f('ix_promotion_runs_to_year_id'), table_name='promotion_runs')
    op.drop_index(op.f('ix_promotion_runs_from_year_id'), table_name='promotion_runs')
    op.drop_index(op.f('ix_promotion_runs_institution_id'), table_name='promotion_runs')
    op.drop_index(op.f('ix_promotion_runs_id'), table_name='promotion_runs')
    op.drop_table('promotion_runs')

    op.drop_index('ix_enrollment_year_class', table_name='enrollments')
    op.drop_index(op.f('ix_enrollments_institution_id'), table_name='enrollments')
    op.drop_index(op.f('ix_enrollments_status'), table_name='enrollments')
    op.drop_index(op.f('ix_enrollments_academic_year_id'), table_name='enrollments')
    op.drop_index(op.f('ix_enrollments_grade_id'), table_name='enrollments')
    op.drop_index(op.f('ix_enrollments_school_class_id'), table_name='enrollments')
    op.drop_index(op.f('ix_enrollments_student_id'), table_name='enrollments')
    op.drop_index(op.f('ix_enrollments_id'), table_name='enrollments')
    op.drop_table('enrollments')

    op.drop_index(op.f('ix_academic_years_is_active'), table_name='academic_years')
    op.drop_index(op.f('ix_academic_years_label'), table_name='academic_years')
    op.drop_index(op.f('ix_academic_years_institution_id'), table_name='academic_years')
    op.drop_index(op.f('ix_academic_years_id'), table_name='academic_years')
    op.drop_table('academic_years')
