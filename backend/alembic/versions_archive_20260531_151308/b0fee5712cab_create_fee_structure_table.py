"""create fee_structure table (repair missing baseline table)

Revision ID: b0fee5712cab
Revises: 18fc8cb8e614
Create Date: 2026-05-31

Repairs a broken Alembic chain. The ``fee_structure`` table is referenced by
later migrations (40725f2c5fc5, 544e16dad7a0, 13c11b62bf63) and by the
``FeeStructure`` ORM model, but **no migration ever created it** -- it was
dropped from the squashed ``ca81cf371b8d_initial_baseline``. This migration
recreates it (base columns matching the model) immediately before the first
migration that alters it (40725f2c5fc5). The late-fee columns
(due_date / late_fee_per_day / max_late_fee) are intentionally NOT created here
because 40725f2c5fc5 adds them right after.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import func


# revision identifiers, used by Alembic.
revision: str = 'b0fee5712cab'
down_revision: Union[str, Sequence[str], None] = '18fc8cb8e614'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Idempotent: a partially-migrated RDS (or a hand-patched DB) may already
    # have the table -- skip creation in that case so re-running is safe.
    bind = op.get_bind()
    if sa.inspect(bind).has_table('fee_structure'):
        return

    op.create_table(
        'fee_structure',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('student_id', sa.Integer(), sa.ForeignKey('students.id'), nullable=True),
        sa.Column('fee_type', sa.String(), nullable=True),
        sa.Column('total_amount', sa.Float(), nullable=True),
        sa.Column('paid_amount', sa.Float(), server_default='0', nullable=True),
        sa.Column('priority', sa.Integer(), server_default='0', nullable=True),
        sa.Column('institution_id', sa.Integer(), sa.ForeignKey('institutions.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f('ix_fee_structure_id'), 'fee_structure', ['id'])
    op.create_index(op.f('ix_fee_structure_student_id'), 'fee_structure', ['student_id'])
    op.create_index(op.f('ix_fee_structure_institution_id'), 'fee_structure', ['institution_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_fee_structure_institution_id'), table_name='fee_structure')
    op.drop_index(op.f('ix_fee_structure_student_id'), table_name='fee_structure')
    op.drop_index(op.f('ix_fee_structure_id'), table_name='fee_structure')
    op.drop_table('fee_structure')
