"""add_institution_payment_settings

Per-institution settings for the manual payment workflow — UPI ID,
bank details, QR image URL. Replaces the env-variable approach so each
school in a multi-tenant deployment can maintain its own payment
information from the admin portal.

Revision ID: l0a1b2c3d4e5
Revises: k9f0a1b2c3d4
Create Date: 2026-05-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "l0a1b2c3d4e5"
down_revision: Union[str, Sequence[str], None] = "k9f0a1b2c3d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "institution_payment_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "institution_id", sa.Integer(),
            sa.ForeignKey("institutions.id"), nullable=False,
        ),
        sa.Column("upi_id", sa.String(length=160), nullable=True),
        sa.Column("upi_display_name", sa.String(length=200), nullable=True),
        sa.Column("bank_name", sa.String(length=200), nullable=True),
        sa.Column("bank_account_number", sa.String(length=80), nullable=True),
        sa.Column("bank_ifsc", sa.String(length=40), nullable=True),
        sa.Column("bank_account_holder", sa.String(length=200), nullable=True),
        sa.Column("qr_image_url", sa.String(length=1024), nullable=True),
        sa.Column("payment_instructions", sa.Text(), nullable=True),
        sa.Column("updated_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("institution_id", name="uq_institution_payment_settings_inst"),
    )
    op.create_index(
        op.f("ix_institution_payment_settings_id"),
        "institution_payment_settings", ["id"], unique=False,
    )
    op.create_index(
        op.f("ix_institution_payment_settings_institution_id"),
        "institution_payment_settings", ["institution_id"], unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_institution_payment_settings_institution_id"), table_name="institution_payment_settings")
    op.drop_index(op.f("ix_institution_payment_settings_id"), table_name="institution_payment_settings")
    op.drop_table("institution_payment_settings")
