"""add_manual_payment_tables

Introduces the parallel manual-payment workflow:

* ``manual_payment_requests``      — parent-submitted UPI/bank transfers
                                      awaiting (or past) admin verification.
* ``manual_payment_audit_logs``    — append-only event trail for each
                                      request: submitted / viewed /
                                      approved / rejected / etc.

These tables live alongside the legacy ``payments`` / ``finance_ledger``
tables but are entirely independent — the new flow may be dropped by
downgrading this revision without affecting any existing payment data.

Revision ID: k9f0a1b2c3d4
Revises: j8e9f0a1b2c3
Create Date: 2026-05-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "k9f0a1b2c3d4"
down_revision: Union[str, Sequence[str], None] = "j8e9f0a1b2c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "manual_payment_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("institution_id", sa.Integer(), sa.ForeignKey("institutions.id"), nullable=False),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id"), nullable=False),
        sa.Column("submitted_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("student_name", sa.String(length=200), nullable=False),
        sa.Column("parent_name", sa.String(length=200), nullable=False),
        sa.Column("class_name", sa.String(length=120), nullable=True),
        sa.Column("section_name", sa.String(length=40), nullable=True),
        sa.Column("fee_type", sa.String(length=40), nullable=True, server_default="TUITION"),
        sa.Column("installment_label", sa.String(length=120), nullable=True),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("approved_amount", sa.Float(), nullable=True),
        sa.Column("transaction_reference", sa.String(length=120), nullable=False),
        sa.Column("transaction_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payer_name", sa.String(length=200), nullable=True),
        sa.Column("payer_upi", sa.String(length=120), nullable=True),
        sa.Column("screenshot_url", sa.String(length=1024), nullable=True),
        sa.Column("parent_note", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=40),
            nullable=False,
            server_default="PENDING_VERIFICATION",
        ),
        sa.Column("admin_note", sa.Text(), nullable=True),
        sa.Column("rejection_reason", sa.String(length=500), nullable=True),
        sa.Column("reviewed_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("first_viewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("receipt_number", sa.String(length=80), nullable=True),
        sa.Column("receipt_url", sa.String(length=1024), nullable=True),
        sa.Column("receipt_generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "submitted_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("receipt_number", name="uq_manual_payment_requests_receipt_number"),
    )
    op.create_index(op.f("ix_manual_payment_requests_id"), "manual_payment_requests", ["id"], unique=False)
    op.create_index(op.f("ix_manual_payment_requests_institution_id"), "manual_payment_requests", ["institution_id"], unique=False)
    op.create_index(op.f("ix_manual_payment_requests_student_id"), "manual_payment_requests", ["student_id"], unique=False)
    op.create_index(op.f("ix_manual_payment_requests_status"), "manual_payment_requests", ["status"], unique=False)
    op.create_index(op.f("ix_manual_payment_requests_transaction_reference"), "manual_payment_requests", ["transaction_reference"], unique=False)
    op.create_index(op.f("ix_manual_payment_requests_receipt_number"), "manual_payment_requests", ["receipt_number"], unique=False)
    op.create_index(op.f("ix_manual_payment_requests_submitted_at"), "manual_payment_requests", ["submitted_at"], unique=False)
    op.create_index("ix_manual_payment_requests_inst_status", "manual_payment_requests", ["institution_id", "status"], unique=False)
    op.create_index("ix_manual_payment_requests_inst_submitted_at", "manual_payment_requests", ["institution_id", "submitted_at"], unique=False)
    op.create_index("ix_manual_payment_requests_dedupe", "manual_payment_requests", ["institution_id", "student_id", "transaction_reference"], unique=False)

    op.create_table(
        "manual_payment_audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "payment_request_id", sa.Integer(),
            sa.ForeignKey("manual_payment_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("institution_id", sa.Integer(), sa.ForeignKey("institutions.id"), nullable=False),
        sa.Column("event", sa.String(length=60), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("actor_role", sa.String(length=40), nullable=True),
        sa.Column("actor_name", sa.String(length=200), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("from_status", sa.String(length=40), nullable=True),
        sa.Column("to_status", sa.String(length=40), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_manual_payment_audit_logs_id"), "manual_payment_audit_logs", ["id"], unique=False)
    op.create_index(op.f("ix_manual_payment_audit_logs_payment_request_id"), "manual_payment_audit_logs", ["payment_request_id"], unique=False)
    op.create_index(op.f("ix_manual_payment_audit_logs_institution_id"), "manual_payment_audit_logs", ["institution_id"], unique=False)
    op.create_index(op.f("ix_manual_payment_audit_logs_event"), "manual_payment_audit_logs", ["event"], unique=False)
    op.create_index(op.f("ix_manual_payment_audit_logs_created_at"), "manual_payment_audit_logs", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_manual_payment_audit_logs_created_at"), table_name="manual_payment_audit_logs")
    op.drop_index(op.f("ix_manual_payment_audit_logs_event"), table_name="manual_payment_audit_logs")
    op.drop_index(op.f("ix_manual_payment_audit_logs_institution_id"), table_name="manual_payment_audit_logs")
    op.drop_index(op.f("ix_manual_payment_audit_logs_payment_request_id"), table_name="manual_payment_audit_logs")
    op.drop_index(op.f("ix_manual_payment_audit_logs_id"), table_name="manual_payment_audit_logs")
    op.drop_table("manual_payment_audit_logs")

    op.drop_index("ix_manual_payment_requests_dedupe", table_name="manual_payment_requests")
    op.drop_index("ix_manual_payment_requests_inst_submitted_at", table_name="manual_payment_requests")
    op.drop_index("ix_manual_payment_requests_inst_status", table_name="manual_payment_requests")
    op.drop_index(op.f("ix_manual_payment_requests_submitted_at"), table_name="manual_payment_requests")
    op.drop_index(op.f("ix_manual_payment_requests_receipt_number"), table_name="manual_payment_requests")
    op.drop_index(op.f("ix_manual_payment_requests_transaction_reference"), table_name="manual_payment_requests")
    op.drop_index(op.f("ix_manual_payment_requests_status"), table_name="manual_payment_requests")
    op.drop_index(op.f("ix_manual_payment_requests_student_id"), table_name="manual_payment_requests")
    op.drop_index(op.f("ix_manual_payment_requests_institution_id"), table_name="manual_payment_requests")
    op.drop_index(op.f("ix_manual_payment_requests_id"), table_name="manual_payment_requests")
    op.drop_table("manual_payment_requests")
