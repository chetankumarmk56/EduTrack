"""add file_type + question bank columns to uploaded_files

Adds the columns that let the same ``uploaded_files`` table back both
teacher uploads and AI-generated artifacts (initially Question Banks).

Revision ID: h6c7d8e9f0a1
Revises: g5b6c7d8e9f0
Create Date: 2026-05-21 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'h6c7d8e9f0a1'
down_revision = 'g5b6c7d8e9f0'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'uploaded_files',
        sa.Column(
            'file_type',
            sa.String(length=32),
            nullable=False,
            server_default='upload',
        ),
    )
    op.add_column(
        'uploaded_files',
        sa.Column('display_name', sa.String(length=255), nullable=True),
    )
    op.add_column(
        'uploaded_files',
        sa.Column(
            'version',
            sa.Integer(),
            nullable=False,
            server_default='1',
        ),
    )
    op.add_column(
        'uploaded_files',
        sa.Column('source_school_id', sa.String(length=64), nullable=True),
    )
    op.add_column(
        'uploaded_files',
        sa.Column('source_teacher_id', sa.String(length=64), nullable=True),
    )
    op.add_column(
        'uploaded_files',
        sa.Column('source_grade_id', sa.String(length=64), nullable=True),
    )
    op.add_column(
        'uploaded_files',
        sa.Column('source_subject_id', sa.String(length=64), nullable=True),
    )
    op.add_column(
        'uploaded_files',
        sa.Column('source_chapter_id', sa.String(length=64), nullable=True),
    )

    op.create_index(
        'ix_uploaded_files_file_type',
        'uploaded_files',
        ['file_type'],
    )
    op.create_index(
        'ix_uploaded_files_owner_type',
        'uploaded_files',
        ['teacher_id', 'file_type'],
    )


def downgrade():
    op.drop_index('ix_uploaded_files_owner_type', table_name='uploaded_files')
    op.drop_index('ix_uploaded_files_file_type', table_name='uploaded_files')
    op.drop_column('uploaded_files', 'source_chapter_id')
    op.drop_column('uploaded_files', 'source_subject_id')
    op.drop_column('uploaded_files', 'source_grade_id')
    op.drop_column('uploaded_files', 'source_teacher_id')
    op.drop_column('uploaded_files', 'source_school_id')
    op.drop_column('uploaded_files', 'version')
    op.drop_column('uploaded_files', 'display_name')
    op.drop_column('uploaded_files', 'file_type')
