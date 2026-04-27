"""Add account lockout fields for brute force protection.

Revision ID: add_account_lockout
Revises: 
Create Date: 2026-04-27 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_account_lockout'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new columns to users table for account lockout
    op.add_column('users', sa.Column('failed_login_attempts', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('locked_until', sa.DateTime(), nullable=True))
    
    # Set existing rows to 0 failed attempts (migrations safety)
    op.execute("UPDATE users SET failed_login_attempts = 0 WHERE failed_login_attempts IS NULL")


def downgrade() -> None:
    # Remove the columns if downgrading
    op.drop_column('users', 'locked_until')
    op.drop_column('users', 'failed_login_attempts')
