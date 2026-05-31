"""
Verifies the parent-by-phone login lookup uses the indexed
``parents.primary_phone_normalized`` column instead of scanning every
matching-DOB student into worker memory.

Two layers:

1. Model: the validator auto-populates ``primary_phone_normalized`` on
   every write to ``Parent.primary_phone``. Catches the regression
   "someone removed the @validates and writes broke the index target."

2. Service: ``authenticate_parent_by_phone`` issues exactly ONE SELECT
   that joins ``students`` to ``parents`` and filters on the new column
   with a LIMIT, not the old "load every matching-DOB student" scan. We
   intercept ``db.execute`` to count queries and inspect the compiled SQL.
"""
import os
import sys

import pytest

sys.path.append(os.getcwd())

os.environ.setdefault("SECRET_KEY", "test-secret-key-must-be-at-least-32-chars-long")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("ENVIRONMENT", "dev")
os.environ["FEE_REMINDER_SCHEDULER_ENABLED"] = "false"


# ─── Validator: normalization at write time ─────────────────────────────────


def test_validator_normalizes_various_phone_formats():
    """
    The @validates on Parent.primary_phone must canonicalise to
    last-10-digits. Cover the formats parents actually type at enrollment.
    """
    from app.models.directory import Parent

    cases = [
        ("9876543210", "9876543210"),       # bare 10 digits
        ("+91 98765 43210", "9876543210"),  # country code + spaces
        ("+91-98765-43210", "9876543210"),  # country code + dashes
        ("098765-43210", "9876543210"),     # trunk 0 prefix
        ("(987) 654-3210", "9876543210"),   # US formatting
    ]
    for raw, expected in cases:
        p = Parent(primary_phone=raw)
        assert p.primary_phone_normalized == expected, (
            f"normalize({raw!r}) = {p.primary_phone_normalized!r}, expected {expected!r}"
        )


def test_validator_handles_empty_and_short_input():
    """
    Empty / too-short numbers must yield ``None`` so the column never
    contains a partial value that would false-match.
    """
    from app.models.directory import Parent

    for raw in (None, "", "123", "+91 987"):
        p = Parent(primary_phone=raw)
        assert p.primary_phone_normalized is None, (
            f"short input {raw!r} produced {p.primary_phone_normalized!r}"
        )


def test_validator_reapplies_on_update():
    """
    Setting primary_phone a second time updates the normalized form.
    Catches the regression "validator only fires on insert."
    """
    from app.models.directory import Parent
    p = Parent(primary_phone="+91 9876543210")
    assert p.primary_phone_normalized == "9876543210"
    p.primary_phone = "8765432109"
    assert p.primary_phone_normalized == "8765432109"
    p.primary_phone = None
    assert p.primary_phone_normalized is None


# ─── Service: single indexed query, not a broad scan ────────────────────────


class _CountingSession:
    """
    AsyncSession stub that captures every execute() call so we can
    assert on the query shape. We don't need a real DB — the test
    cares about "how many queries does the service issue and what
    are they bound against".
    """
    def __init__(self):
        self.statements: list = []

    async def execute(self, stmt):
        self.statements.append(stmt)
        # Return a result object that matches what the service expects.
        class _ScalarResult:
            def all(self_inner):
                return []
        class _Result:
            def scalars(self_inner):
                return _ScalarResult()
        return _Result()


async def test_service_issues_one_indexed_query(monkeypatch):
    """
    A failed-lookup path must hit the DB exactly once and the WHERE
    clause must reference ``primary_phone_normalized`` (the indexed
    column) — not the old per-student ``parent_phone`` column.
    """
    from app.services.auth.auth_service import AuthService

    session = _CountingSession()
    out = await AuthService.authenticate_parent_by_phone(
        session,
        parent_phone="+91 9876543210",
        dob="2010-04-01",
    )
    assert out is None  # no matches in our stub

    assert len(session.statements) == 1, (
        f"expected exactly 1 query, got {len(session.statements)}: "
        f"{session.statements}"
    )

    # Compile to inspect the WHERE clause text. We use literal_binds=False
    # so we see column names, not values.
    compiled = str(session.statements[0])
    assert "primary_phone_normalized" in compiled, (
        f"query must filter on primary_phone_normalized; got:\n{compiled}"
    )
    assert "LIMIT" in compiled.upper() or " :param_" in compiled, (
        f"query must carry a LIMIT defence-in-depth cap; got:\n{compiled}"
    )


async def test_service_short_circuits_on_unnormalizable_phone():
    """
    A bogus phone (under 10 digits) returns None WITHOUT hitting the DB.
    Catches the case where an attacker spams the endpoint with garbage
    to fish for timing differences against the DB.
    """
    from app.services.auth.auth_service import AuthService

    session = _CountingSession()
    out = await AuthService.authenticate_parent_by_phone(
        session,
        parent_phone="123",
        dob="2010-04-01",
    )
    assert out is None
    assert len(session.statements) == 0, (
        f"expected zero DB calls for invalid phone, got {len(session.statements)}"
    )


# ─── Migration sanity: backfill helper matches runtime validator ───────────


def test_migration_normalizer_matches_model_validator():
    """
    If a migration ships its own _last_10_digits helper (to avoid importing
    runtime code at backfill time), that helper MUST stay in sync with the
    model validator or backfilled values will silently diverge from new writes.

    The specific migration that introduced primary_phone_normalized was later
    consolidated into the clean baseline (a6d38a450102).  When the file is
    absent the test skips — the guard is preserved for any future migration
    that carries its own copy of the function.
    """
    import importlib.util
    here = os.path.dirname(os.path.abspath(__file__))
    mig_path = os.path.join(
        here, "..", "alembic", "versions",
        "q5f6a7b8c9d0_refactor_parent_contact_to_parents.py",
    )
    if not os.path.exists(mig_path):
        pytest.skip(
            "Migration q5f6a7b8c9d0 was consolidated into the clean baseline "
            "(a6d38a450102) — no standalone backfill helper to verify."
        )
    spec = importlib.util.spec_from_file_location("mig_under_test", mig_path)
    mig = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mig)

    from app.models.directory.directory import _normalize_phone_to_last10

    cases = [
        None, "", "x", "123",
        "9876543210", "+91 9876543210", "098765-43210",
        "(987) 654-3210",
    ]
    for raw in cases:
        assert mig._last_10_digits(raw) == _normalize_phone_to_last10(raw), (
            f"migration backfill diverges from runtime validator on {raw!r}"
        )
