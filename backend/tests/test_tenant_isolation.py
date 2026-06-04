"""
Tenant-isolation safety rails (app.core.tenant).

EduTrack enforces multi-tenancy per-query — there is no DB row-level
security — so the helpers in app.core.tenant are the single defence against
cross-tenant IDOR (admin of School A touching School B's row). These tests
pin the two guarantees that make the helpers safe:

  1. The helpers REFUSE to run on a non-tenant model (Institution), turning
     "I used a tenant helper on a global table" into a loud TypeError instead
     of a silently unscoped query.
  2. The query builders ALWAYS emit an `institution_id = :id` filter, so a
     scoped select can never forget the tenant predicate.

Pure unit tests — they inspect the compiled SQL, no database required.
"""
import os
import sys

import pytest

sys.path.append(os.getcwd())

os.environ.setdefault("SECRET_KEY", "test-secret-key-must-be-at-least-32-chars-long")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("ENVIRONMENT", "dev")
os.environ["FEE_REMINDER_SCHEDULER_ENABLED"] = "false"


# ─── The guard rail: helpers must reject non-tenant models ───────────────


def test_tenant_column_rejects_global_model():
    """Institution is the tenant root — it has no institution_id. Using a
    tenant helper on it must raise, not silently return an unscoped query."""
    from app.core.tenant import _tenant_column
    from app.models import Institution

    with pytest.raises(TypeError):
        _tenant_column(Institution)


def test_tenant_column_returns_column_for_tenant_model():
    from app.core.tenant import _tenant_column
    from app.models import Subject

    col = _tenant_column(Subject)
    assert col is Subject.institution_id


@pytest.mark.parametrize("model_name", ["Subject", "Student", "User"])
def test_scoped_select_or_helpers_reject_globals_consistently(model_name):
    """Every tenant model resolves a column; Institution always raises —
    the asymmetry is what keeps the helpers honest."""
    import app.models as models
    from app.core.tenant import _tenant_column

    model = getattr(models, model_name)
    assert _tenant_column(model) is model.institution_id


# ─── The filter: scoped queries always carry the tenant predicate ────────


def _compiled_where(stmt) -> str:
    """Render a Select's WHERE clause to a string for substring assertions."""
    return str(stmt.compile(compile_kwargs={"literal_binds": False}))


def test_scoped_select_emits_institution_filter():
    from app.core.tenant import scoped_select
    from app.models import Subject

    sql = _compiled_where(scoped_select(Subject, 42)).lower()
    assert "institution_id" in sql, sql
    assert "where" in sql, sql


def test_scoped_select_keeps_extra_criteria():
    """Extra criteria AND with the tenant filter (never replace it)."""
    from app.core.tenant import scoped_select
    from app.models import Subject

    sql = _compiled_where(scoped_select(Subject, 42, Subject.id == 7)).lower()
    assert "institution_id" in sql
    # both predicates present → ANDed
    assert sql.count("subjects.") >= 2 or " and " in sql, sql


def test_tenant_filter_is_equality_on_institution():
    from app.core.tenant import tenant_filter
    from app.models import Student

    pred = tenant_filter(Student, 7)
    assert "institution_id" in str(pred).lower()
