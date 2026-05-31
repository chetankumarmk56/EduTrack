"""refactor parent contact details onto parents table

Moves guardian contact details out of the denormalized ``students`` columns
(``parent_name``/``parent_email``/``parent_phone``/``parent_phone_normalized``)
and into the ``parents`` table as the single source of truth. Adds
``primary_phone``/``secondary_phone`` (renaming the old ``phone``), plus
``name``/``email`` and an indexed ``primary_phone_normalized`` used for
parent-portal login. Also adds optional ``students.address`` and
``students.blood_group``.

Existing data is migrated safely: every student's guardian details are
copied onto a parent record (find-or-create keyed on the normalized primary
phone within the institution, so siblings share one record), then the old
student columns and index are dropped.

Revision ID: q5f6a7b8c9d0
Revises: p4e5f6a7b8c9
Create Date: 2026-05-30
"""
from alembic import op
import sqlalchemy as sa


revision = "q5f6a7b8c9d0"
down_revision = "p4e5f6a7b8c9"
branch_labels = None
depends_on = None


def _last_10_digits(raw):
    """Same logic as app.models.directory.directory._normalize_phone_to_last10.

    Duplicated on purpose: Alembic migrations should never import runtime
    code — that breaks when a future refactor changes the module layout and
    you try to replay an old migration.
    """
    if raw is None:
        return None
    digits = "".join(ch for ch in str(raw) if ch.isdigit())
    if len(digits) < 10:
        return None
    return digits[-10:]


def upgrade():
    conn = op.get_bind()

    # 1. New parent columns (nullable so the table isn't rewritten in place).
    op.add_column("parents", sa.Column("name", sa.String(), nullable=True))
    op.add_column("parents", sa.Column("email", sa.String(), nullable=True))
    op.add_column("parents", sa.Column("primary_phone", sa.String(), nullable=True))
    op.add_column("parents", sa.Column("secondary_phone", sa.String(), nullable=True))
    op.add_column(
        "parents",
        sa.Column("primary_phone_normalized", sa.String(length=10), nullable=True),
    )

    # 2. New optional student columns.
    op.add_column("students", sa.Column("address", sa.String(), nullable=True))
    op.add_column("students", sa.Column("blood_group", sa.String(), nullable=True))

    # 3. Migrate existing parents.phone -> primary_phone (+ normalized).
    existing_parents = conn.execute(
        sa.text("SELECT id, phone FROM parents WHERE phone IS NOT NULL")
    ).fetchall()
    for pid, phone in existing_parents:
        conn.execute(
            sa.text(
                "UPDATE parents SET primary_phone = :phone, "
                "primary_phone_normalized = :norm WHERE id = :pid"
            ),
            {"phone": phone, "norm": _last_10_digits(phone), "pid": pid},
        )

    # 4. Backfill guardian details from students.
    #
    #    Cache of (institution_id, normalized_phone) -> parent id so siblings
    #    on the same phone share one record. Seed it from parents that already
    #    have a normalized primary phone.
    parent_by_phone = {}
    seeded = conn.execute(
        sa.text(
            "SELECT id, institution_id, primary_phone_normalized FROM parents "
            "WHERE primary_phone_normalized IS NOT NULL"
        )
    ).fetchall()
    for pid, inst_id, norm in seeded:
        parent_by_phone.setdefault((inst_id, norm), pid)

    students = conn.execute(
        sa.text(
            "SELECT id, institution_id, parent_id, parent_name, parent_email, "
            "parent_phone FROM students"
        )
    ).fetchall()

    for sid, inst_id, parent_id, p_name, p_email, p_phone in students:
        norm = _last_10_digits(p_phone)

        # 4a. Student already linked to a parent — fill that parent's gaps.
        if parent_id:
            conn.execute(
                sa.text(
                    "UPDATE parents SET "
                    "name = COALESCE(name, :name), "
                    "email = COALESCE(email, :email), "
                    "primary_phone = COALESCE(primary_phone, :phone), "
                    "primary_phone_normalized = COALESCE(primary_phone_normalized, :norm) "
                    "WHERE id = :pid"
                ),
                {
                    "name": p_name,
                    "email": p_email,
                    "phone": p_phone,
                    "norm": norm,
                    "pid": parent_id,
                },
            )
            if norm:
                parent_by_phone.setdefault((inst_id, norm), parent_id)
            continue

        # 4b. No link and no usable phone — leave parent_id NULL (can't
        #     parent-login until an admin edits the record). Matches the
        #     prior "not backfilled" posture.
        if not norm:
            continue

        # 4c. Find-or-create a parent keyed on the normalized phone.
        key = (inst_id, norm)
        target_pid = parent_by_phone.get(key)
        if target_pid is None:
            target_pid = conn.execute(
                sa.text(
                    "INSERT INTO parents "
                    "(institution_id, name, email, primary_phone, primary_phone_normalized) "
                    "VALUES (:inst, :name, :email, :phone, :norm) RETURNING id"
                ),
                {
                    "inst": inst_id,
                    "name": p_name,
                    "email": p_email,
                    "phone": p_phone,
                    "norm": norm,
                },
            ).scalar()
            parent_by_phone[key] = target_pid
        conn.execute(
            sa.text("UPDATE students SET parent_id = :pid WHERE id = :sid"),
            {"pid": target_pid, "sid": sid},
        )

    # 5. Index the parent login-lookup column.
    op.create_index(
        "ix_parents_primary_phone_normalized",
        "parents",
        ["primary_phone_normalized"],
    )

    # 6. Drop the old student parent columns + indexes, and parents.phone.
    #    IF EXISTS: the compound index is created by alembic, but the
    #    single-column one only exists where the schema was built via
    #    create_all (tests) — guard so the drop is safe in both.
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_students_parent_phone_norm_dob"))
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_students_parent_phone_normalized"))
    op.drop_column("students", "parent_phone_normalized")
    op.drop_column("students", "parent_phone")
    op.drop_column("students", "parent_email")
    op.drop_column("students", "parent_name")
    op.drop_column("parents", "phone")


def downgrade():
    conn = op.get_bind()

    # 1. Re-add the old student columns + parents.phone.
    op.add_column("students", sa.Column("parent_name", sa.String(), nullable=True))
    op.add_column("students", sa.Column("parent_email", sa.String(), nullable=True))
    op.add_column("students", sa.Column("parent_phone", sa.String(), nullable=True))
    op.add_column(
        "students",
        sa.Column("parent_phone_normalized", sa.String(length=10), nullable=True),
    )
    op.add_column("parents", sa.Column("phone", sa.String(), nullable=True))

    # 2. Copy guardian details back from the linked parent onto students.
    rows = conn.execute(
        sa.text(
            "SELECT s.id, p.name, p.email, p.primary_phone "
            "FROM students s JOIN parents p ON s.parent_id = p.id"
        )
    ).fetchall()
    for sid, name, email, phone in rows:
        conn.execute(
            sa.text(
                "UPDATE students SET parent_name = :name, parent_email = :email, "
                "parent_phone = :phone, parent_phone_normalized = :norm WHERE id = :sid"
            ),
            {
                "name": name,
                "email": email,
                "phone": phone,
                "norm": _last_10_digits(phone),
                "sid": sid,
            },
        )

    # 3. Restore parents.phone from primary_phone.
    conn.execute(sa.text("UPDATE parents SET phone = primary_phone"))

    # 4. Recreate the old compound login index (the only one alembic owned).
    op.create_index(
        "ix_students_parent_phone_norm_dob",
        "students",
        ["parent_phone_normalized", "dob"],
    )

    # 5. Drop the new columns/index.
    op.drop_index("ix_parents_primary_phone_normalized", table_name="parents")
    op.drop_column("parents", "primary_phone_normalized")
    op.drop_column("parents", "secondary_phone")
    op.drop_column("parents", "primary_phone")
    op.drop_column("parents", "email")
    op.drop_column("parents", "name")
    op.drop_column("students", "blood_group")
    op.drop_column("students", "address")
