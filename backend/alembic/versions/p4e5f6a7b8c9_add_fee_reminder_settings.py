"""add_fee_reminder_settings

Creates the `fee_reminder_settings` table — one row per institution holding
the automation mode + schedule + thresholds for the fee-reminder dispatch
flow. Default for every institution stays DISABLED so admin click-to-send
is the only path until they opt into automation.

Revision ID: p4e5f6a7b8c9
Revises: o3d4e5f6a7b8
Create Date: 2026-05-30
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "p4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "o3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(name: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    return name in insp.get_table_names()


def upgrade() -> None:
    if _has_table("fee_reminder_settings"):
        return

    op.create_table(
        "fee_reminder_settings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "institution_id",
            sa.Integer(),
            sa.ForeignKey("institutions.id"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "automation_mode",
            sa.String(length=20),
            nullable=False,
            server_default="DISABLED",
        ),
        sa.Column("day_of_week", sa.Integer(), nullable=True),
        sa.Column("day_of_month", sa.Integer(), nullable=True),
        sa.Column(
            "send_hour", sa.Integer(), nullable=False, server_default="9",
        ),
        sa.Column(
            "timezone",
            sa.String(length=64),
            nullable=False,
            server_default="Asia/Kolkata",
        ),
        sa.Column("overdue_days", sa.Integer(), nullable=True),
        sa.Column("cooldown_days", sa.Integer(), nullable=True),
        sa.Column(
            "voice_calls_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_run_summary", sa.Text(), nullable=True),
        sa.Column("last_run_triggered_by", sa.String(length=40), nullable=True),
        sa.Column(
            "updated_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=True,
        ),
    )
    op.create_index(
        "ix_fee_reminder_settings_institution_id",
        "fee_reminder_settings",
        ["institution_id"],
        unique=True,
    )


def downgrade() -> None:
    if not _has_table("fee_reminder_settings"):
        return
    op.drop_index(
        "ix_fee_reminder_settings_institution_id",
        table_name="fee_reminder_settings",
    )
    op.drop_table("fee_reminder_settings")
