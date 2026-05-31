"""add timetable tables

Revision ID: a8f3c2d1b4e6
Revises: add_whatsapp_to_teachers
Create Date: 2026-05-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a8f3c2d1b4e6'
down_revision: Union[str, Sequence[str], None] = 'add_whatsapp_to_teachers'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'schedule_periods',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('institution_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('period_type', sa.String(), nullable=False),
        sa.Column('order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('start_time', sa.Time(), nullable=False),
        sa.Column('end_time', sa.Time(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(['institution_id'], ['institutions.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_schedule_periods_institution_id',
        'schedule_periods',
        ['institution_id'],
    )
    op.create_index(
        'ix_schedule_periods_id',
        'schedule_periods',
        ['id'],
    )

    op.create_table(
        'timetable_slots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('institution_id', sa.Integer(), nullable=False),
        sa.Column('school_class_id', sa.Integer(), nullable=False),
        sa.Column('schedule_period_id', sa.Integer(), nullable=False),
        sa.Column('day_of_week', sa.Integer(), nullable=False),
        sa.Column('subject_id', sa.Integer(), nullable=True),
        sa.Column('teacher_id', sa.Integer(), nullable=True),
        sa.Column('room', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(['institution_id'], ['institutions.id']),
        sa.ForeignKeyConstraint(['school_class_id'], ['school_classes.id']),
        sa.ForeignKeyConstraint(['schedule_period_id'], ['schedule_periods.id']),
        sa.ForeignKeyConstraint(['subject_id'], ['subjects.id']),
        sa.ForeignKeyConstraint(['teacher_id'], ['teachers.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'school_class_id', 'schedule_period_id', 'day_of_week',
            name='uq_timetable_class_period_day',
        ),
    )
    op.create_index(
        'ix_timetable_slots_institution_id',
        'timetable_slots',
        ['institution_id'],
    )
    op.create_index(
        'ix_timetable_slots_school_class_id',
        'timetable_slots',
        ['school_class_id'],
    )
    op.create_index(
        'ix_timetable_slots_schedule_period_id',
        'timetable_slots',
        ['schedule_period_id'],
    )
    op.create_index(
        'ix_timetable_slots_id',
        'timetable_slots',
        ['id'],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_timetable_slots_id', table_name='timetable_slots')
    op.drop_index('ix_timetable_slots_schedule_period_id', table_name='timetable_slots')
    op.drop_index('ix_timetable_slots_school_class_id', table_name='timetable_slots')
    op.drop_index('ix_timetable_slots_institution_id', table_name='timetable_slots')
    op.drop_table('timetable_slots')

    op.drop_index('ix_schedule_periods_id', table_name='schedule_periods')
    op.drop_index('ix_schedule_periods_institution_id', table_name='schedule_periods')
    op.drop_table('schedule_periods')
