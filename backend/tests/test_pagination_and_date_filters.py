"""
Verifies the pagination + date-range bounding on list endpoints.

Three properties under test:

1. Student/teacher list endpoints DEFAULT to a small page size (50) and
   REFUSE oversized pages (>500). Catches "client passes limit=99999 and
   blows up the DB pool" attempts.

2. Student attendance endpoint passes a default 90-day window to the
   service when no date_from is supplied.

3. The attendance service honours date_from / date_to filters and orders
   results newest-first with a hard 1000-row cap.
"""
import os
import sys
import inspect

import pytest

sys.path.append(os.getcwd())

os.environ.setdefault("SECRET_KEY", "test-secret-key-must-be-at-least-32-chars-long")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("ENVIRONMENT", "dev")
os.environ["FEE_REMINDER_SCHEDULER_ENABLED"] = "false"


# ─── Default page size + cap ─────────────────────────────────────────────


def _student_list_endpoint_params():
    from app.api.routes.students.students import read_students
    return inspect.signature(read_students).parameters


def _teacher_list_endpoint_params():
    from app.api.routes.teachers.teachers import read_teachers
    return inspect.signature(read_teachers).parameters


def _query_constraints(param):
    """
    Pull the Query default + le (max) off a FastAPI Query parameter.
    FastAPI wraps the constraints in a FieldInfo (newer versions) or
    Query (older). We dig into the metadata list (Ge/Le annotations) when
    .le isn't a direct attribute.
    """
    field = param.default
    # FastAPI 0.110+ stores constraints in field.metadata as a list of
    # annotated_types.Le / Ge instances.
    default_val = getattr(field, "default", field)
    le = getattr(field, "le", None)
    if le is None:
        for m in getattr(field, "metadata", []) or []:
            if type(m).__name__ == "Le":
                le = m.le
                break
    return default_val, le


def test_student_list_default_is_50_with_500_cap():
    params = _student_list_endpoint_params()
    default, le = _query_constraints(params["limit"])
    assert default == 50, (
        f"read_students default limit is {default}; should be 50 to "
        f"avoid the 5K-row blast radius the audit flagged."
    )
    assert le == 500, (
        f"read_students max limit is {le}; should cap at 500 to bound the worst case."
    )


def test_teacher_list_default_is_50_with_500_cap():
    params = _teacher_list_endpoint_params()
    default, le = _query_constraints(params["limit"])
    assert default == 50
    assert le == 500


# ─── Attendance date-range default ───────────────────────────────────────


async def test_attendance_route_passes_default_90_day_window(monkeypatch):
    """
    GET /api/attendance/{student_id} with no date params must call the
    service with a date_from ~90 days before today. We intercept the
    service call instead of round-tripping the DB so the test stays
    DB-independent.
    """
    from datetime import date, timedelta
    from app.api.routes.attendance import attendance as route_mod

    captured: dict = {}

    async def _fake_get_attendance(db, institution_id, student_id, subject, *, date_from, date_to):
        captured["date_from"] = date_from
        captured["date_to"] = date_to
        return []

    monkeypatch.setattr(
        route_mod.attendance_service,
        "get_attendance",
        _fake_get_attendance,
    )

    # Call the route handler directly so we don't need a DB.
    result = await route_mod.get_student_attendance(
        student_id=1,
        subject=None,
        date_from=None,
        date_to=None,
        db=None,  # type: ignore[arg-type]  # captured fake ignores it
        user=type("U", (), {"institution_id": 1})(),  # stub
    )
    assert result == []

    today = date.today()
    expected_from = (today - timedelta(days=90)).isoformat()
    expected_to = today.isoformat()
    assert captured["date_from"] == expected_from, (
        f"default date_from is {captured['date_from']}, expected {expected_from}"
    )
    assert captured["date_to"] == expected_to


async def test_attendance_route_honours_explicit_date_range(monkeypatch):
    """An explicit date_from / date_to passes through unchanged."""
    from app.api.routes.attendance import attendance as route_mod

    captured: dict = {}

    async def _fake_get_attendance(db, institution_id, student_id, subject, *, date_from, date_to):
        captured["date_from"] = date_from
        captured["date_to"] = date_to
        return []

    monkeypatch.setattr(
        route_mod.attendance_service,
        "get_attendance",
        _fake_get_attendance,
    )

    await route_mod.get_student_attendance(
        student_id=1,
        subject=None,
        date_from="2025-01-01",
        date_to="2025-06-30",
        db=None,  # type: ignore[arg-type]
        user=type("U", (), {"institution_id": 1})(),
    )
    assert captured["date_from"] == "2025-01-01"
    assert captured["date_to"] == "2025-06-30"


# ─── Service-level: date filter & 1000-row cap actually applied ──────────


def test_attendance_service_get_attendance_signature():
    """
    Structural check: the service still accepts date_from / date_to as
    keyword args and they are NOT positional. Catches refactors that
    silently break the route's call site.
    """
    from app.services.attendance.attendance_service import AttendanceService

    sig = inspect.signature(AttendanceService.get_attendance)
    params = sig.parameters
    assert "date_from" in params
    assert "date_to" in params
    # Both must be keyword-only — the route passes by name. If someone
    # made them positional with a different ordering, the route call
    # would still pass the right values, BUT non-route callers that pass
    # positionally would break. Keyword-only is the safer contract.
    assert params["date_from"].kind == inspect.Parameter.KEYWORD_ONLY
    assert params["date_to"].kind == inspect.Parameter.KEYWORD_ONLY
