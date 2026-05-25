"""
Verifies the H7 + M4 fixes in marks_service:

* ``record_marks_batch`` must NOT issue a SELECT per input row. The
  previous bulk-load existed but was ignored — a teacher entering marks
  for 40 students did 40+ extra SELECTs. The new path uses two indexed
  bulk loads (one for exam-based marks, one for legacy) and an
  in-memory composite-key lookup inside the loop.

* ``delete_test`` must issue ONE DELETE statement, not SELECT-then-delete-each.
  An exam across 200 students × 6 subjects used to fire 1200+ DELETE
  statements.

Strategy: count statements via SQLAlchemy's ``before_execute`` event
against an in-memory SQLite engine populated with a real schema. That
catches "N+1 silently reintroduced" regressions with low ceremony.
"""
import asyncio
import os
import sys

import pytest

sys.path.append(os.getcwd())

os.environ.setdefault("SECRET_KEY", "test-secret-key-must-be-at-least-32-chars-long")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("ENVIRONMENT", "dev")
os.environ["FEE_REMINDER_SCHEDULER_ENABLED"] = "false"


# ─── Test infra: a real sqlite engine isolated per test ────────────────────


async def _make_test_session():
    """
    Build an in-memory sqlite engine + session pinned to the test's
    event loop. Returns (engine, session_factory, counter).

    Uses StaticPool so a single SQLite connection is reused across
    the test — without it, each connect re-runs DDL and you hit
    "index already exists" the second time. We also drop tables
    before creating so a previous test's leftover DDL state doesn't
    leak across tests.
    """
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from sqlalchemy.pool import StaticPool
    from sqlalchemy import event
    from app.core.database import Base
    # Importing the models registers them on Base.metadata.
    from app.models import Institution, User, Student, Teacher, TeacherAssignment, Mark, Exam  # noqa: F401
    from app.models.academic import SchoolClass, Grade, Section  # noqa: F401

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        # Idempotent setup: drop-then-create so the shared Base.metadata
        # state doesn't carry index DDL from a previous test's engine.
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    counter: dict[str, list] = {"selects": [], "updates": [], "inserts": [], "deletes": []}

    @event.listens_for(engine.sync_engine, "before_cursor_execute")
    def _capture(conn, cursor, statement, parameters, context, executemany):  # noqa: D401
        sql = statement.lstrip().upper()
        if sql.startswith("SELECT"):
            counter["selects"].append(statement)
        elif sql.startswith("UPDATE"):
            counter["updates"].append(statement)
        elif sql.startswith("INSERT"):
            counter["inserts"].append(statement)
        elif sql.startswith("DELETE"):
            counter["deletes"].append(statement)

    return engine, session_factory, counter


async def _seed_minimal(session):
    """Insert a class + 5 students + 1 exam so the marks code has FKs to chew on."""
    from app.models import Institution, Student, Exam
    from app.models.academic import SchoolClass, Grade, Section

    inst = Institution(name="Test Inst", slug="test-inst")
    session.add(inst)
    await session.flush()
    grade = Grade(level=1, name="Grade 1", institution_id=inst.id)
    section = Section(name="A", grade_id=None, institution_id=inst.id)
    session.add_all([grade, section])
    await session.flush()
    section.grade_id = grade.id
    sc = SchoolClass(
        grade_id=grade.id, section_id=section.id, institution_id=inst.id,
    )
    session.add(sc)
    await session.flush()
    students = [
        Student(name=f"S{i}", dob="2015-01-01", school_class_id=sc.id, institution_id=inst.id, is_active=True)
        for i in range(5)
    ]
    session.add_all(students)
    exam = Exam(name="Math Term 1", institution_id=inst.id, school_class_id=sc.id)
    session.add(exam)
    await session.flush()
    return inst.id, [s.id for s in students], exam.id


# ─── H7: record_marks_batch — no per-row SELECT ────────────────────────────


async def test_record_marks_batch_no_per_row_select():
    """
    With N input rows the new path must run a CONSTANT number of
    SELECTs (students + assignments + exams + existing-marks), not one
    per row. The exact count includes setup queries, so we assert an
    upper bound that's well below N.
    """
    from app.services.marks.marks_service import marks_service
    from app.schemas import mark as mark_schemas

    engine, session_factory, counter = await _make_test_session()
    async with session_factory() as session:
        inst_id, student_ids, exam_id = await _seed_minimal(session)
        await session.commit()

    # Snapshot AFTER seeding so we only count the operation under test.
    counter["selects"].clear()
    counter["updates"].clear()
    counter["inserts"].clear()
    counter["deletes"].clear()

    payload = [
        mark_schemas.MarkCreate(
            student_id=sid,
            exam_id=exam_id,
            subject="Math",
            test_name="Math Term 1",
            score=70 + i,
            max_score=100,
        )
        for i, sid in enumerate(student_ids)
    ]

    async with session_factory() as session:
        result = await marks_service.record_marks_batch(
            session, institution_id=inst_id, marks=payload, teacher_user_id=None
        )

    assert len(result) == len(student_ids), f"got {len(result)} returned marks, expected {len(student_ids)}"

    # Inserts should be 5 (one per student) on the first pass.
    # The hard property: SELECTs do NOT scale with input row count.
    n = len(student_ids)
    selects = len(counter["selects"])
    assert selects < n + 5, (
        f"record_marks_batch fired {selects} SELECTs for {n} input rows — "
        f"that's per-row scaling. Bulk-load is supposed to be O(1)."
    )

    # And nothing else weird — no spurious extra deletes.
    assert len(counter["deletes"]) == 0


async def test_record_marks_batch_update_path_uses_bulk_lookup():
    """
    Second-pass UPDATE: same payload re-submitted. The bulk index lookup
    must find every existing row, so the loop produces UPDATEs (not new
    INSERTs) and still no per-row SELECT.
    """
    from app.services.marks.marks_service import marks_service
    from app.schemas import mark as mark_schemas

    engine, session_factory, counter = await _make_test_session()
    async with session_factory() as session:
        inst_id, student_ids, exam_id = await _seed_minimal(session)
        await session.commit()

    payload = [
        mark_schemas.MarkCreate(
            student_id=sid,
            exam_id=exam_id,
            subject="Math",
            test_name="Math Term 1",
            score=50,
            max_score=100,
        )
        for sid in student_ids
    ]
    async with session_factory() as session:
        await marks_service.record_marks_batch(session, inst_id, payload, None)

    # Snapshot for the SECOND pass.
    counter["selects"].clear()
    counter["updates"].clear()
    counter["inserts"].clear()

    # Resubmit same students with new scores.
    payload2 = [
        mark_schemas.MarkCreate(
            student_id=sid,
            exam_id=exam_id,
            subject="Math",
            test_name="Math Term 1",
            score=90,
            max_score=100,
        )
        for sid in student_ids
    ]
    async with session_factory() as session:
        out = await marks_service.record_marks_batch(session, inst_id, payload2, None)

    # New scores stuck — every row updated to 90.
    assert all(m.score == 90 for m in out), [m.score for m in out]

    n = len(student_ids)
    assert len(counter["selects"]) < n + 5, (
        f"update path fired {len(counter['selects'])} SELECTs — should be O(1)."
    )
    # No new INSERTs — every row is an UPDATE on the existing record.
    # SQLAlchemy flushes UPDATEs in batches; we just assert there are no
    # spurious INSERTs.
    assert len(counter["inserts"]) == 0, (
        f"resubmit produced {len(counter['inserts'])} INSERTs — bulk-load "
        f"failed to find existing rows."
    )


async def test_record_marks_batch_dedupes_duplicates_within_batch():
    """
    Two rows for the same (student, exam) in one submission must
    converge on a single Mark row, with the SECOND value winning.
    Catches the "in-memory dict isn't updated as we insert new rows"
    bug — without the local cache update, the second row would create
    a duplicate or violate a unique constraint.
    """
    from app.services.marks.marks_service import marks_service
    from app.schemas import mark as mark_schemas

    engine, session_factory, counter = await _make_test_session()
    async with session_factory() as session:
        inst_id, student_ids, exam_id = await _seed_minimal(session)
        await session.commit()

    sid = student_ids[0]
    payload = [
        mark_schemas.MarkCreate(student_id=sid, exam_id=exam_id, subject="Math",
                                test_name="T1", score=40, max_score=100),
        mark_schemas.MarkCreate(student_id=sid, exam_id=exam_id, subject="Math",
                                test_name="T1", score=88, max_score=100),
    ]
    async with session_factory() as session:
        out = await marks_service.record_marks_batch(session, inst_id, payload, None)

    # Two outputs in the result list (matches input order) but they
    # point at the SAME persisted row.
    assert len(out) == 2
    assert out[0].id == out[1].id
    assert out[0].score == 88, (
        f"second occurrence should overwrite first; got {out[0].score}"
    )


# ─── M4: delete_test — single DELETE statement ─────────────────────────────


async def test_delete_test_issues_single_delete():
    """One DELETE … WHERE … instead of SELECT + N db.delete() calls."""
    from app.services.marks.marks_service import marks_service
    from app.schemas import mark as mark_schemas

    engine, session_factory, counter = await _make_test_session()
    async with session_factory() as session:
        inst_id, student_ids, exam_id = await _seed_minimal(session)
        await session.commit()

    payload = [
        mark_schemas.MarkCreate(student_id=sid, exam_id=exam_id, subject="Math",
                                test_name="T1", score=80, max_score=100)
        for sid in student_ids
    ]
    async with session_factory() as session:
        await marks_service.record_marks_batch(session, inst_id, payload, None)

    counter["selects"].clear()
    counter["deletes"].clear()

    async with session_factory() as session:
        result = await marks_service.delete_test(
            session, institution_id=inst_id, exam_id=exam_id,
        )

    assert result["status"] == "success"
    assert result["deleted_records"] == len(student_ids), result

    # The whole point: ONE delete, not five.
    assert len(counter["deletes"]) == 1, (
        f"delete_test fired {len(counter['deletes'])} DELETEs — should be 1. "
        f"Per-row delete loop has been reintroduced."
    )
    # And no select-then-delete fan-out either.
    assert len(counter["selects"]) == 0, (
        f"delete_test should not need SELECT — got {len(counter['selects'])}."
    )


async def test_delete_test_legacy_path_works():
    """Legacy (subject, test_name) path is still supported."""
    from app.services.marks.marks_service import marks_service
    from app.schemas import mark as mark_schemas

    engine, session_factory, counter = await _make_test_session()
    async with session_factory() as session:
        inst_id, student_ids, _ = await _seed_minimal(session)
        await session.commit()

    payload = [
        mark_schemas.MarkCreate(
            student_id=sid, subject="Science", test_name="Unit Test 1",
            score=60, max_score=100,
        )
        for sid in student_ids
    ]
    async with session_factory() as session:
        await marks_service.record_marks_batch(session, inst_id, payload, None)

    async with session_factory() as session:
        result = await marks_service.delete_test(
            session, institution_id=inst_id,
            subject="Science", test_name="Unit Test 1",
        )
    assert result["status"] == "success"
    assert result["deleted_records"] == len(student_ids)


async def test_delete_test_rejects_ambiguous_args():
    """No exam_id and no (subject, test_name) → 400-style error response."""
    from app.services.marks.marks_service import marks_service

    engine, session_factory, _ = await _make_test_session()
    async with session_factory() as session:
        result = await marks_service.delete_test(session, institution_id=1)
    assert result["status"] == "error", result
