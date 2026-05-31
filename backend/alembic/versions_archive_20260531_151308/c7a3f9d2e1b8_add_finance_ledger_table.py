"""add_finance_ledger_table

Revision ID: c7a3f9d2e1b8
Revises: b9e4d5c2a8f7
Create Date: 2026-05-14 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c7a3f9d2e1b8"
down_revision: Union[str, Sequence[str], None] = "b9e4d5c2a8f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "finance_ledger",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("receipt_number", sa.String(), nullable=False),
        sa.Column("entry_type", sa.String(length=32), nullable=False, server_default="PAYMENT"),
        sa.Column("payment_id", sa.Integer(), sa.ForeignKey("payments.id"), nullable=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id"), nullable=False),
        sa.Column("class_id", sa.Integer(), sa.ForeignKey("school_classes.id"), nullable=True),
        sa.Column("institution_id", sa.Integer(), sa.ForeignKey("institutions.id"), nullable=False),
        sa.Column("student_name", sa.String(), nullable=False),
        sa.Column("class_name", sa.String(), nullable=True),
        sa.Column("fee_type", sa.String(), nullable=True, server_default="TUITION"),
        sa.Column("academic_year", sa.String(), nullable=False),
        sa.Column("razorpay_order_id", sa.String(), nullable=True),
        sa.Column("razorpay_payment_id", sa.String(), nullable=True),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("gateway_fee", sa.Float(), nullable=True, server_default="0"),
        sa.Column("net_amount", sa.Float(), nullable=True),
        sa.Column("payment_method", sa.String(), nullable=False),
        sa.Column("payment_status", sa.String(), nullable=False, server_default="SUCCESS"),
        sa.Column(
            "payment_date",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("recorded_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("receipt_number", name="uq_finance_ledger_receipt_number"),
        sa.UniqueConstraint("razorpay_payment_id", name="uq_finance_ledger_razorpay_payment_id"),
    )

    op.create_index(op.f("ix_finance_ledger_id"), "finance_ledger", ["id"], unique=False)
    op.create_index(op.f("ix_finance_ledger_receipt_number"), "finance_ledger", ["receipt_number"], unique=False)
    op.create_index(op.f("ix_finance_ledger_entry_type"), "finance_ledger", ["entry_type"], unique=False)
    op.create_index(op.f("ix_finance_ledger_payment_id"), "finance_ledger", ["payment_id"], unique=False)
    op.create_index(op.f("ix_finance_ledger_student_id"), "finance_ledger", ["student_id"], unique=False)
    op.create_index(op.f("ix_finance_ledger_class_id"), "finance_ledger", ["class_id"], unique=False)
    op.create_index(op.f("ix_finance_ledger_institution_id"), "finance_ledger", ["institution_id"], unique=False)
    op.create_index(op.f("ix_finance_ledger_academic_year"), "finance_ledger", ["academic_year"], unique=False)
    op.create_index(op.f("ix_finance_ledger_razorpay_order_id"), "finance_ledger", ["razorpay_order_id"], unique=False)
    op.create_index(op.f("ix_finance_ledger_razorpay_payment_id"), "finance_ledger", ["razorpay_payment_id"], unique=False)
    op.create_index(op.f("ix_finance_ledger_payment_status"), "finance_ledger", ["payment_status"], unique=False)
    op.create_index(op.f("ix_finance_ledger_payment_date"), "finance_ledger", ["payment_date"], unique=False)
    op.create_index(
        "ix_finance_ledger_payment_date_inst",
        "finance_ledger",
        ["institution_id", "payment_date"],
        unique=False,
    )
    op.create_index(
        "ix_finance_ledger_student_inst",
        "finance_ledger",
        ["institution_id", "student_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_finance_ledger_student_inst", table_name="finance_ledger")
    op.drop_index("ix_finance_ledger_payment_date_inst", table_name="finance_ledger")
    op.drop_index(op.f("ix_finance_ledger_payment_date"), table_name="finance_ledger")
    op.drop_index(op.f("ix_finance_ledger_payment_status"), table_name="finance_ledger")
    op.drop_index(op.f("ix_finance_ledger_razorpay_payment_id"), table_name="finance_ledger")
    op.drop_index(op.f("ix_finance_ledger_razorpay_order_id"), table_name="finance_ledger")
    op.drop_index(op.f("ix_finance_ledger_academic_year"), table_name="finance_ledger")
    op.drop_index(op.f("ix_finance_ledger_institution_id"), table_name="finance_ledger")
    op.drop_index(op.f("ix_finance_ledger_class_id"), table_name="finance_ledger")
    op.drop_index(op.f("ix_finance_ledger_student_id"), table_name="finance_ledger")
    op.drop_index(op.f("ix_finance_ledger_payment_id"), table_name="finance_ledger")
    op.drop_index(op.f("ix_finance_ledger_entry_type"), table_name="finance_ledger")
    op.drop_index(op.f("ix_finance_ledger_receipt_number"), table_name="finance_ledger")
    op.drop_index(op.f("ix_finance_ledger_id"), table_name="finance_ledger")
    op.drop_table("finance_ledger")
