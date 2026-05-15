"""add uploaded_files table

Revision ID: f1a92c4b6e02
Revises: d8e5f3a1c2b9
Create Date: 2026-05-14 14:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'f1a92c4b6e02'
down_revision = 'd8e5f3a1c2b9'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'uploaded_files',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column(
            'teacher_id',
            sa.Integer(),
            sa.ForeignKey('teachers.id', ondelete='CASCADE'),
            nullable=False,
            index=True,
        ),
        sa.Column(
            'institution_id',
            sa.Integer(),
            sa.ForeignKey('institutions.id'),
            nullable=False,
            index=True,
        ),
        sa.Column('storage_backend', sa.String(length=16), nullable=False, server_default='s3'),
        sa.Column('storage_key', sa.String(length=512), nullable=False),
        sa.Column('original_filename', sa.String(length=255), nullable=False),
        sa.Column(
            'mime_type',
            sa.String(length=128),
            nullable=False,
            server_default='application/octet-stream',
        ),
        sa.Column('file_size', sa.Integer(), nullable=False),
        sa.Column('extracted_text', sa.Text(), nullable=True),
        sa.Column(
            'extraction_status', sa.String(length=16), nullable=False, server_default='pending'
        ),
        sa.Column('tags', sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column('subject', sa.String(length=120), nullable=True),
        sa.Column('category', sa.String(length=64), nullable=True),
        sa.Column(
            'uploaded_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            'is_deleted', sa.Boolean(), nullable=False, server_default=sa.text('false')
        ),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    op.create_index(
        'ix_uploaded_files_owner_active',
        'uploaded_files',
        ['teacher_id', 'is_deleted'],
    )
    op.create_index(
        'ix_uploaded_files_uploaded_at', 'uploaded_files', ['uploaded_at']
    )
    op.create_index(
        'ix_uploaded_files_is_deleted', 'uploaded_files', ['is_deleted']
    )


def downgrade():
    op.drop_index('ix_uploaded_files_is_deleted', table_name='uploaded_files')
    op.drop_index('ix_uploaded_files_uploaded_at', table_name='uploaded_files')
    op.drop_index('ix_uploaded_files_owner_active', table_name='uploaded_files')
    op.drop_table('uploaded_files')
