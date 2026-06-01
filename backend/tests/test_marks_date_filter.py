"""
Verifies the M6-marks date-range bounding on ``get_marks``.

Three properties under test:

1. The route applies a 365-day default window when no date_from is given.
2. Explicit date_from / date_to pass through to the service.
3. The service honours the range against ``Mark.created_at`` and caps
   the result count + orders newest-first.

The service-level integration test uses a real in-memory sqlite engine
so a future refactor that drops the WHERE clause or the LIMIT fails CI.
"""
import os
import sys
from datetime import date, datetime, timedelta, timezone

import pytest

sys.path.append(os.getcwd())

os.environ.setdefault("SECRET_KEY", "test-secret-key-must-be-at-least-32-chars-long")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("ENVIRONMENT", "dev")
os.environ["FEE_REMINDER_SCHEDULER_ENABLED"] = "false"


# ─── Route layer defaults ─────────────────────────────────────────────────


async def test_marks_route_applies_365_day_default(monkeypatch):
    """
    GET /api/marks/{student_id} with no date params must call the
    service with a 365-day window. Intercept the service call to keep
    this test DB-independent.
    """
    from app.api.routes.marks import marks as route_mod

    captured: dict = {}

    async def _fake_get_marks(db, institution_id, student_id, *, date_from, date_to):
        captured["date_from"] = date_from
        captured["date_to"] = date_to
        return []

    monkeypatch.setattr(route_mod.marks_service, "get_marks", _fake_get_marks)

    await route_mod.get_student_marks(
        student_id=1,
        date_from=None,
        date_to=None,
        db=None,  # type: ignore[arg-type]
        user=type("U", (), {"institution_id": 1, "role": "admin"})(),
    )

    today = date.today()
    expected_from = (today - timedelta(days=365)).isoformat()
    assert captured["date_from"] == expected_from, (
        f"default date_from is {captured['date_from']}, expected {expected_from}"
    )
    assert captured["date_to"] == today.isoformat()


async def test_marks_route_passes_explicit_range_through(monkeypatch):
    """Explicit dates round-trip unchanged."""
    from app.api.routes.marks import marks as route_mod

    captured: dict = {}

    async def _fake_get_marks(db, institution_id, student_id, *, date_from, date_to):
        captured["date_from"] = date_from
        captured["date_to"] = date_to
        return []

    monkeypatch.setattr(route_mod.marks_service, "get_marks", _fake_get_marks)

    await route_mod.get_student_marks(
        student_id=1,
        date_from="2024-09-01",
        date_to="2025-06-30",
        db=None,  # type: ignore[arg-type]
        user=type("U", (), {"institution_id": 1, "role": "admin"})(),
    )
    assert captured["date_from"] == "2024-09-01"
    assert captured["date_to"] == "2025-06-30"


# ─── Service-level: real DB ──────────────────────────────────────────────


async def _make_test_session():
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from sqlalchemy.pool import StaticPool
    from app.core.database import Base
    from app.models import Institution, Student, Mark, Exam  # noqa: F401
    from app.models.academic import SchoolClass, Grade, Section  # noqa: F401

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    return engine, async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def _seed_marks_across_dates(session, *, days_ago_list):
    """Seed one student + a Mark for each `days_ago` value."""
    from app.models import Institution, Student, Mark
    from app.models.academic import SchoolClass, Grade, Section

    inst = Institution(name="T", slug="t")
    session.add(inst)
    await session.flush()
    grade = Grade(level=1, name="G1", institution_id=inst.id)
    section = Section(name="A", institution_id=inst.id)
    session.add_all([grade, section])
    await session.flush()
    section.grade_id = grade.id
    cls = SchoolClass(grade_id=grade.id, section_id=section.id, institution_id=inst.id)
    session.add(cls)
    await session.flush()
    student = Student(
        name="Marky", dob="2015-01-01", school_class_id=cls.id,
        institution_id=inst.id, is_active=True,
    )
    session.add(student)
    await session.flush()

    now = datetime.now(timezone.utc)
    marks: list = []
    for days_ago in days_ago_list:
        m = Mark(
            student_id=student.id, subject="Math", test_name=f"T{days_ago}",
            score=days_ago, max_score=100, institution_id=inst.id,
        )
        session.add(m)
        await session.flush()
        # Override the server-default created_at with our chosen timestamp.
        m.created_at = now - timedelta(days=days_ago)
    await session.flush()
    return inst.id, student.id


async def test_service_filters_by_date_from():
    from app.services.marks.marks_service import marks_service

    engine, factory = await _make_test_session()
    async with factory() as session:
        inst_id, sid = await _seed_marks_across_dates(
            session, days_ago_list=[5, 30, 100, 400, 1000],
        )
        await session.commit()

    # Window: last 90 days → only the 5- and 30-day-ago marks should appear.
    cutoff_date = (date.today() - timedelta(days=90)).isoformat()
    async with factory() as session:
        out = await marks_service.get_marks(
            session, inst_id, sid, date_from=cutoff_date,
        )
    scores = {m.score for m in out}
    assert scores == {5, 30}, (
        f"date_from filter broken: expected {{5, 30}}, got {scores}"
    )


async def test_service_filters_by_date_to():
    from app.services.marks.marks_service import marks_service

    engine, factory = await _make_test_session()
    async with factory() as session:
        inst_id, sid = await _seed_marks_across_dates(
            session, days_ago_list=[5, 30, 100, 400],
        )
        await session.commit()

    # Window: anything older than 50 days ago → ≥50 day-old marks.
    upper = (date.today() - timedelta(days=50)).isoformat()
    async with factory() as session:
        out = await marks_service.get_marks(
            session, inst_id, sid, date_to=upper,
        )
    scores = {m.score for m in out}
    assert scores == {100, 400}, (
        f"date_to filter broken: expected {{100, 400}}, got {scores}"
    )


async def test_service_orders_newest_first():
    from app.services.marks.marks_service import marks_service

    engine, factory = await _make_test_session()
    async with factory() as session:
        inst_id, sid = await _seed_marks_across_dates(
            session, days_ago_list=[60, 5, 30, 90],
        )
        await session.commit()

    async with factory() as session:
        out = await marks_service.get_marks(session, inst_id, sid)

    scores_in_order = [m.score for m in out]
    # days_ago=5 is newest; days_ago=90 is oldest.
    assert scores_in_order == sorted(scores_in_order), (
        f"results not ordered newest-first: {scores_in_order}"
    )


def test_get_marks_signature_is_keyword_only():
    """
    Structural guard: date_from/date_to must remain keyword-only so
    positional callers can't accidentally re-order them.
    """
    import inspect
    from app.services.marks.marks_service import MarksService
    sig = inspect.signature(MarksService.get_marks)
    params = sig.parameters
    assert "date_from" in params
    assert "date_to" in params
    assert params["date_from"].kind == inspect.Parameter.KEYWORD_ONLY
    assert params["date_to"].kind == inspect.Parameter.KEYWORD_ONLY
