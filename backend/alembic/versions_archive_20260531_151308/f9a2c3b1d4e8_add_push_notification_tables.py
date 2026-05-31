"""add device_tokens and push_delivery_logs

Revision ID: f9a2c3b1d4e8
Revises: e1f2a3b4c5d6
Create Date: 2026-05-18

Backing tables for Expo push notifications.

* `device_tokens` keeps one row per (user, expo token). Tokens are unique
  globally because Expo reuses the same value across reinstalls, and we want
  re-registering to bump the existing row rather than spawn a duplicate.
  Inactive tokens (rejected by Expo as DeviceNotRegistered etc.) are kept
  with `is_active=false` so we can audit history.

* `push_delivery_logs` records every dispatch attempt — one row per
  (notification, token) — so we can answer "why didn't parent X get this?"
  without polling Expo's receipt API.

The previous `device_tokens` table dropped in 13c11b62bf63 had a different
shape and no FK to institutions, so this migration drops any leftover before
recreating to keep environments that never ran that migration consistent.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f9a2c3b1d4e8'
down_revision: Union[str, Sequence[str], None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Defensive: drop any stale device_tokens left from older deployments.
    op.execute("DROP TABLE IF EXISTS device_tokens CASCADE")

    op.create_table(
        'device_tokens',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('institution_id', sa.Integer(), nullable=False),
        sa.Column('expo_push_token', sa.String(), nullable=False),
        sa.Column('platform', sa.String(), nullable=False, server_default='android'),
        sa.Column('device_name', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('invalidated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['institution_id'], ['institutions.id']),
        sa.UniqueConstraint('expo_push_token', name='uq_device_tokens_expo_push_token'),
    )
    op.create_index('ix_device_tokens_user_id', 'device_tokens', ['user_id'])
    op.create_index('ix_device_tokens_institution_id', 'device_tokens', ['institution_id'])
    op.create_index('ix_device_tokens_expo_push_token', 'device_tokens', ['expo_push_token'])
    op.create_index('ix_device_tokens_is_active', 'device_tokens', ['is_active'])
    op.create_index('ix_device_tokens_user_active', 'device_tokens', ['user_id', 'is_active'])

    op.create_table(
        'push_delivery_logs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('institution_id', sa.Integer(), nullable=False),
        sa.Column('notification_type', sa.String(), nullable=False),
        sa.Column('reference_id', sa.String(), nullable=True),
        sa.Column('device_token_id', sa.Integer(), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='queued'),
        sa.Column('expo_ticket_id', sa.String(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['institution_id'], ['institutions.id']),
        sa.ForeignKeyConstraint(['device_token_id'], ['device_tokens.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_push_delivery_logs_institution_id', 'push_delivery_logs', ['institution_id'])
    op.create_index('ix_push_delivery_logs_notification_type', 'push_delivery_logs', ['notification_type'])
    op.create_index('ix_push_delivery_logs_reference_id', 'push_delivery_logs', ['reference_id'])
    op.create_index('ix_push_delivery_logs_status', 'push_delivery_logs', ['status'])
    op.create_index('ix_push_delivery_logs_user_id', 'push_delivery_logs', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_push_delivery_logs_user_id', table_name='push_delivery_logs')
    op.drop_index('ix_push_delivery_logs_status', table_name='push_delivery_logs')
    op.drop_index('ix_push_delivery_logs_reference_id', table_name='push_delivery_logs')
    op.drop_index('ix_push_delivery_logs_notification_type', table_name='push_delivery_logs')
    op.drop_index('ix_push_delivery_logs_institution_id', table_name='push_delivery_logs')
    op.drop_table('push_delivery_logs')

    op.drop_index('ix_device_tokens_user_active', table_name='device_tokens')
    op.drop_index('ix_device_tokens_is_active', table_name='device_tokens')
    op.drop_index('ix_device_tokens_expo_push_token', table_name='device_tokens')
    op.drop_index('ix_device_tokens_institution_id', table_name='device_tokens')
    op.drop_index('ix_device_tokens_user_id', table_name='device_tokens')
    op.drop_table('device_tokens')
