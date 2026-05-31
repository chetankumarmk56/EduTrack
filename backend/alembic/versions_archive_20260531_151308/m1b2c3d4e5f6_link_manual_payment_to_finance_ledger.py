"""link_manual_payment_to_finance_ledger

Adds finance_ledger.manual_payment_request_id so admin-approved manual UPI
payments can show up in the unified finance ledger while still letting the
ledger UI stream the original PDF receipt from the manual_payment workflow.

Revision ID: m1b2c3d4e5f6
Revises: l0a1b2c3d4e5
Create Date: 2026-05-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "m1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "l0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "finance_ledger",
        sa.Column(
            "manual_payment_request_id",
            sa.Integer(),
            sa.ForeignKey("manual_payment_requests.id"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_finance_ledger_manual_payment_request_id",
        "finance_ledger",
        ["manual_payment_request_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_finance_ledger_manual_payment_request_id",
        table_name="finance_ledger",
    )
    op.drop_column("finance_ledger", "manual_payment_request_id")
