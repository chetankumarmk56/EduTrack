"""drop_razorpay_artifacts

Removes Razorpay-specific surface area from the schema after the project
moved to a UPI-only manual-verification flow:

  * Drop the `payment_transactions` table (used for Razorpay webhook
    idempotency only).
  * Drop `razorpay_order_id` / `razorpay_payment_id` columns on `payments`.
  * Drop `razorpay_order_id` / `razorpay_payment_id` columns on
    `finance_ledger`, and add `external_reference` to hold UTRs / cash refs.

Revision ID: o3d4e5f6a7b8
Revises: n2c3d4e5f6a7
Create Date: 2026-05-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "o3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "n2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(name: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    return name in insp.get_table_names()


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if table not in insp.get_table_names():
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def _has_index(table: str, name: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if table not in insp.get_table_names():
        return False
    return name in {ix["name"] for ix in insp.get_indexes(table)}


def upgrade() -> None:
    # 1) Drop payment_transactions (Razorpay webhook idempotency).
    if _has_table("payment_transactions"):
        for ix_name in ("ix_payment_transactions_razorpay_payment_id",
                        "ix_payment_transactions_order_id",
                        "ix_payment_transactions_id"):
            if _has_index("payment_transactions", ix_name):
                op.drop_index(ix_name, table_name="payment_transactions")
        op.drop_table("payment_transactions")

    # 2) payments.razorpay_*
    if _has_column("payments", "razorpay_order_id"):
        op.drop_column("payments", "razorpay_order_id")
    if _has_column("payments", "razorpay_payment_id"):
        op.drop_column("payments", "razorpay_payment_id")

    # 3) finance_ledger.razorpay_*
    for ix_name in ("ix_finance_ledger_razorpay_order_id",
                    "ix_finance_ledger_razorpay_payment_id"):
        if _has_index("finance_ledger", ix_name):
            op.drop_index(ix_name, table_name="finance_ledger")
    if _has_column("finance_ledger", "razorpay_order_id"):
        op.drop_column("finance_ledger", "razorpay_order_id")
    if _has_column("finance_ledger", "razorpay_payment_id"):
        op.drop_column("finance_ledger", "razorpay_payment_id")

    # 4) Add finance_ledger.external_reference (UTR / cash ref).
    if not _has_column("finance_ledger", "external_reference"):
        op.add_column(
            "finance_ledger",
            sa.Column("external_reference", sa.String(), nullable=True),
        )
        op.create_index(
            "ix_finance_ledger_external_reference",
            "finance_ledger",
            ["external_reference"],
        )


def downgrade() -> None:
    # Re-add columns as nullable so the downgrade is reversible without
    # backfill. Indexes are recreated. No restoration of payment_transactions
    # data — the table was Razorpay-only and not meant to outlive that flow.
    if _has_index("finance_ledger", "ix_finance_ledger_external_reference"):
        op.drop_index("ix_finance_ledger_external_reference", table_name="finance_ledger")
    if _has_column("finance_ledger", "external_reference"):
        op.drop_column("finance_ledger", "external_reference")

    if not _has_column("finance_ledger", "razorpay_payment_id"):
        op.add_column(
            "finance_ledger",
            sa.Column("razorpay_payment_id", sa.String(), nullable=True),
        )
        op.create_index(
            "ix_finance_ledger_razorpay_payment_id",
            "finance_ledger",
            ["razorpay_payment_id"],
            unique=True,
        )
    if not _has_column("finance_ledger", "razorpay_order_id"):
        op.add_column(
            "finance_ledger",
            sa.Column("razorpay_order_id", sa.String(), nullable=True),
        )
        op.create_index(
            "ix_finance_ledger_razorpay_order_id",
            "finance_ledger",
            ["razorpay_order_id"],
        )

    if not _has_column("payments", "razorpay_order_id"):
        op.add_column("payments", sa.Column("razorpay_order_id", sa.String(), nullable=True))
    if not _has_column("payments", "razorpay_payment_id"):
        op.add_column("payments", sa.Column("razorpay_payment_id", sa.String(), nullable=True))

    if not _has_table("payment_transactions"):
        op.create_table(
            "payment_transactions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("razorpay_payment_id", sa.String(), nullable=False, unique=True),
            sa.Column("order_id", sa.String(), nullable=True),
            sa.Column("amount", sa.Float(), nullable=True),
            sa.Column("status", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True)),
            sa.Column("updated_at", sa.DateTime(timezone=True)),
        )
