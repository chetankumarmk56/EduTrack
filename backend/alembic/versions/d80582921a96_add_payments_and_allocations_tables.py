"""add payments and payment_allocations tables

Revision ID: d80582921a96
Revises: d80582921a95
Create Date: 2026-05-22
"""
from typing import Union, Sequence

from alembic import op
import sqlalchemy as sa

revision: str = 'd80582921a96'
down_revision: Union[str, Sequence[str], None] = 'd80582921a95'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS payments (
            id SERIAL PRIMARY KEY,
            student_id INTEGER REFERENCES students(id),
            amount DOUBLE PRECISION,
            payment_mode VARCHAR,
            status VARCHAR,
            razorpay_order_id VARCHAR,
            razorpay_payment_id VARCHAR,
            created_at TIMESTAMPTZ DEFAULT now(),
            created_by_id INTEGER REFERENCES users(id),
            institution_id INTEGER REFERENCES institutions(id),
            updated_at TIMESTAMPTZ
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_payments_id ON payments (id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_payments_institution_id ON payments (institution_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_payments_student_id ON payments (student_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS payment_allocations (
            id SERIAL PRIMARY KEY,
            payment_id INTEGER REFERENCES payments(id),
            fee_type VARCHAR,
            allocated_amount DOUBLE PRECISION,
            institution_id INTEGER REFERENCES institutions(id),
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_payment_allocations_id ON payment_allocations (id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_payment_allocations_institution_id ON payment_allocations (institution_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_payment_allocations_payment_id ON payment_allocations (payment_id)")


def downgrade() -> None:
    op.drop_table('payment_allocations')
    op.drop_table('payments')
