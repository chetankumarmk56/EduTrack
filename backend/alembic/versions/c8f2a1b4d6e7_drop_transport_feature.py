"""drop transport feature

Removes the bus/transport feature from the schema:

* Drops the six transport tables (buses, routes, stops, student_transport,
  bus_locations, transport_notification_logs). These were never created by a
  migration — they only ever existed via ``Base.metadata.create_all`` in dev —
  so the drops use ``IF EXISTS`` and are no-ops on databases where they were
  never materialised.
* Drops the ``transport_fee`` column from ``school_classes``. This column WAS
  created by the clean baseline, so it is dropped unconditionally. Any value it
  held is folded away; ``total_fee`` is recomputed from tuition + other fees by
  the application going forward.

Revision ID: c8f2a1b4d6e7
Revises: b7e1c2d3f4a5
Create Date: 2026-06-02

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c8f2a1b4d6e7'
down_revision: Union[str, Sequence[str], None] = 'b7e1c2d3f4a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Dropped child-first so foreign keys never block the drop. CASCADE is a
# belt-and-braces guard for any stray dependent object.
_TRANSPORT_TABLES = (
    "transport_notification_logs",
    "bus_locations",
    "student_transport",
    "stops",
    "routes",
    "buses",
)


def upgrade() -> None:
    for table in _TRANSPORT_TABLES:
        op.execute(sa.text(f'DROP TABLE IF EXISTS "{table}" CASCADE'))

    # transport_fee was part of the clean baseline; remove it and let the app
    # recompute total_fee from the remaining tuition + other fees.
    op.execute(sa.text(
        "UPDATE school_classes "
        "SET total_fee = COALESCE(tuition_fee, 0) + COALESCE(other_fee, 0)"
    ))
    op.drop_column("school_classes", "transport_fee")


def downgrade() -> None:
    """Restore the transport_fee column only.

    The six transport tables were never migration-managed (they were created by
    ``create_all`` at runtime), so they are intentionally not recreated here —
    downgrading restores the dropped column and the runtime metadata create
    will re-materialise the tables if the models are ever reintroduced.
    """
    op.add_column(
        "school_classes",
        sa.Column("transport_fee", sa.Float(), nullable=True, server_default="0"),
    )
