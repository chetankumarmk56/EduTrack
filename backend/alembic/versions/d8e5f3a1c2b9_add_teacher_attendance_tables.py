"""add teacher attendance tables

Revision ID: d8e5f3a1c2b9
Revises: c7a3f9d2e1b8
Create Date: 2026-05-14 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'd8e5f3a1c2b9'
down_revision = 'c7a3f9d2e1b8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'teacher_attendance',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('teacher_id', sa.Integer(), sa.ForeignKey('teachers.id'), nullable=False, index=True),
        sa.Column('institution_id', sa.Integer(), sa.ForeignKey('institutions.id'), nullable=False, index=True),
        sa.Column('date', sa.String(), nullable=False, index=True),
        sa.Column('check_in_time', sa.String(), nullable=True),
        sa.Column('check_out_time', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='PRESENT'),
        sa.Column('remarks', sa.Text(), nullable=True),
        sa.Column('is_edited', sa.Integer(), server_default='0'),
        sa.Column('edited_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    op.create_index('ix_teacher_attendance_inst_date', 'teacher_attendance', ['institution_id', 'date'])
    op.create_index('ix_teacher_attendance_teacher_date', 'teacher_attendance', ['teacher_id', 'date'], unique=True)

    op.create_table(
        'teacher_leave_requests',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('teacher_id', sa.Integer(), sa.ForeignKey('teachers.id'), nullable=False, index=True),
        sa.Column('institution_id', sa.Integer(), sa.ForeignKey('institutions.id'), nullable=False, index=True),
        sa.Column('leave_type', sa.String(), nullable=False),
        sa.Column('start_date', sa.String(), nullable=False),
        sa.Column('end_date', sa.String(), nullable=False),
        sa.Column('days_count', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='PENDING'),
        sa.Column('approved_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('rejection_reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    op.create_index('ix_teacher_leave_inst_teacher', 'teacher_leave_requests', ['institution_id', 'teacher_id'])
    op.create_index('ix_teacher_leave_inst_status', 'teacher_leave_requests', ['institution_id', 'status'])

    op.create_table(
        'teacher_attendance_audit_logs',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('institution_id', sa.Integer(), sa.ForeignKey('institutions.id'), nullable=False, index=True),
        sa.Column('teacher_id', sa.Integer(), sa.ForeignKey('teachers.id'), nullable=False, index=True),
        sa.Column('entity_type', sa.String(), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=True),
        sa.Column('attendance_id', sa.Integer(), sa.ForeignKey('teacher_attendance.id', ondelete='SET NULL'), nullable=True),
        sa.Column('changed_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('old_value', sa.Text(), nullable=True),
        sa.Column('new_value', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_teacher_audit_inst_teacher', 'teacher_attendance_audit_logs', ['institution_id', 'teacher_id'])


def downgrade():
    op.drop_table('teacher_attendance_audit_logs')
    op.drop_table('teacher_leave_requests')
    op.drop_table('teacher_attendance')
