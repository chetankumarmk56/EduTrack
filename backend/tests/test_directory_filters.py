"""
Verifies the H8 filter additions to the directory endpoints.

The admin directory used to pull 500 students per page view and filter
client-side. The fix pushes filters into SQL via three new query params
on ``GET /api/directory/`` (students) and two on ``GET /api/directory/teachers/``:

* school_class_id — restrict students to one class (the common admin path)
* search          — ILIKE on student name / parent name / parent email
                    (and name / email for teachers)
* is_active       — hide soft-deleted rows from admin lists

These tests exercise the SQL filters end-to-end against a real
in-memory sqlite engine so a future refactor that drops the filter
silently fails CI.
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


async def _make_test_session():
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from sqlalchemy.pool import StaticPool
    from app.core.database import Base
    # Register model classes on the metadata.
    from app.models import Institution, User, Student, Teacher, TeacherAssignment, Mark, Exam  # noqa: F401
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

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return engine, session_factory


async def _seed_two_classes_with_students(session):
    from app.models import Institution, Student, Teacher
    from app.models.directory import Parent
    from app.models.academic import SchoolClass, Grade, Section

    inst = Institution(name="Test Inst", slug="test-inst")
    session.add(inst)
    await session.flush()

    grade = Grade(level=1, name="Grade 1", institution_id=inst.id)
    section_a = Section(name="A", institution_id=inst.id)
    section_b = Section(name="B", institution_id=inst.id)
    session.add_all([grade, section_a, section_b])
    await session.flush()
    section_a.grade_id = grade.id
    section_b.grade_id = grade.id

    class_1a = SchoolClass(grade_id=grade.id, section_id=section_a.id, institution_id=inst.id)
    class_1b = SchoolClass(grade_id=grade.id, section_id=section_b.id, institution_id=inst.id)
    session.add_all([class_1a, class_1b])
    await session.flush()

    # Guardian contact details live on the parents table; link each student
    # via parent_id so search can ILIKE the parent name/email.
    parents = [
        Parent(name="Anna Apple", email="aapple@x.com", institution_id=inst.id),
        Parent(name="Brian Berry", email="bberry@x.com", institution_id=inst.id),
        Parent(name="Carla Cherry", email="ccherry@x.com", institution_id=inst.id),
        Parent(name="Iris Ian", email="iian@x.com", institution_id=inst.id),
    ]
    session.add_all(parents)
    await session.flush()
    p_apple, p_berry, p_cherry, p_ian = parents

    students = [
        Student(name="Alice Apple", parent_id=p_apple.id,
                dob="2015-01-01", school_class_id=class_1a.id, institution_id=inst.id, is_active=True),
        Student(name="Bob Berry", parent_id=p_berry.id,
                dob="2015-02-01", school_class_id=class_1a.id, institution_id=inst.id, is_active=True),
        Student(name="Carol Cherry", parent_id=p_cherry.id,
                dob="2015-03-01", school_class_id=class_1b.id, institution_id=inst.id, is_active=True),
        Student(name="Inactive Ian", parent_id=p_ian.id,
                dob="2015-04-01", school_class_id=class_1b.id, institution_id=inst.id, is_active=False),
    ]
    session.add_all(students)

    teachers = [
        Teacher(name="Mr Smith", email="smith@school.edu", institution_id=inst.id, is_active=True),
        Teacher(name="Ms Jones", email="jones@school.edu", institution_id=inst.id, is_active=True),
        Teacher(name="Departed", email="gone@school.edu", institution_id=inst.id, is_active=False),
    ]
    session.add_all(teachers)
    await session.flush()
    return inst.id, class_1a.id, class_1b.id


# ─── Students ─────────────────────────────────────────────────────────────


async def test_get_students_filters_by_school_class():
    """Most important property: scope to one class instead of pulling all."""
    from app.services.student.student_service import StudentService

    engine, session_factory = await _make_test_session()
    async with session_factory() as session:
        inst_id, class_a, class_b = await _seed_two_classes_with_students(session)
        await session.commit()

    async with session_factory() as session:
        in_class_a = await StudentService.get_students(
            session, institution_id=inst_id, school_class_id=class_a,
        )
        in_class_b = await StudentService.get_students(
            session, institution_id=inst_id, school_class_id=class_b,
        )

    a_names = {s.name for s in in_class_a}
    b_names = {s.name for s in in_class_b}
    assert a_names == {"Alice Apple", "Bob Berry"}, a_names
    # Note: class_b includes the inactive Ian unless we also filter is_active.
    assert "Carol Cherry" in b_names
    assert b_names.isdisjoint(a_names)


async def test_get_students_filters_by_search():
    from app.services.student.student_service import StudentService

    engine, session_factory = await _make_test_session()
    async with session_factory() as session:
        inst_id, _, _ = await _seed_two_classes_with_students(session)
        await session.commit()

    async with session_factory() as session:
        # By student name
        by_name = await StudentService.get_students(
            session, institution_id=inst_id, search="bob",
        )
        assert {s.name for s in by_name} == {"Bob Berry"}

        # By parent email — same query path
        by_email = await StudentService.get_students(
            session, institution_id=inst_id, search="cherry@x",
        )
        assert {s.name for s in by_email} == {"Carol Cherry"}


async def test_get_students_filters_is_active():
    from app.services.student.student_service import StudentService

    engine, session_factory = await _make_test_session()
    async with session_factory() as session:
        inst_id, _, class_b = await _seed_two_classes_with_students(session)
        await session.commit()

    async with session_factory() as session:
        active = await StudentService.get_students(
            session, institution_id=inst_id,
            school_class_id=class_b, is_active=True,
        )
        all_in_class = await StudentService.get_students(
            session, institution_id=inst_id, school_class_id=class_b,
        )

    assert {s.name for s in active} == {"Carol Cherry"}
    assert "Inactive Ian" in {s.name for s in all_in_class}


async def test_get_students_combines_filters():
    """class_id + search must AND together, not OR."""
    from app.services.student.student_service import StudentService

    engine, session_factory = await _make_test_session()
    async with session_factory() as session:
        inst_id, class_a, class_b = await _seed_two_classes_with_students(session)
        await session.commit()

    async with session_factory() as session:
        # 'cherry' matches Carol (in class_b) via name and parent_email.
        # With class_a filter we should see nobody.
        out = await StudentService.get_students(
            session, institution_id=inst_id,
            school_class_id=class_a, search="cherry",
        )
    names = {s.name for s in out}
    assert names == set(), (
        f"AND-of-filters broken: class_a + 'cherry' should match nobody, got {names}"
    )

    # And the reverse direction — `cherry` + class_b should match Carol only.
    async with session_factory() as session:
        out = await StudentService.get_students(
            session, institution_id=inst_id,
            school_class_id=class_b, search="cherry",
        )
    assert {s.name for s in out} == {"Carol Cherry"}


# ─── Teachers ─────────────────────────────────────────────────────────────


async def test_get_teachers_filters_by_search_and_active():
    from app.services.teacher.teacher_service import TeacherService

    engine, session_factory = await _make_test_session()
    async with session_factory() as session:
        inst_id, _, _ = await _seed_two_classes_with_students(session)
        await session.commit()

    async with session_factory() as session:
        # Match by name
        by_name = await TeacherService.get_teachers(
            session, institution_id=inst_id, search="smith",
        )
        assert {t.name for t in by_name} == {"Mr Smith"}

        # Match by email
        by_email = await TeacherService.get_teachers(
            session, institution_id=inst_id, search="jones@",
        )
        assert {t.name for t in by_email} == {"Ms Jones"}

        # is_active filter
        active = await TeacherService.get_teachers(
            session, institution_id=inst_id, is_active=True,
        )
        all_t = await TeacherService.get_teachers(session, institution_id=inst_id)

    assert {t.name for t in active} == {"Mr Smith", "Ms Jones"}
    assert "Departed" in {t.name for t in all_t}


# ─── Route-level signature guards ─────────────────────────────────────────


def test_students_route_exposes_filter_params():
    """
    Structural check: the route must accept school_class_id / search /
    is_active. Without these, the admin UI's filter push is silently
    ignored and we're back to client-side scanning.
    """
    import inspect
    from app.api.routes.students.students import read_students
    params = inspect.signature(read_students).parameters
    for name in ("school_class_id", "search", "is_active"):
        assert name in params, f"read_students missing filter param {name!r}"


def test_teachers_route_exposes_filter_params():
    import inspect
    from app.api.routes.teachers.teachers import read_teachers
    params = inspect.signature(read_teachers).parameters
    for name in ("search", "is_active"):
        assert name in params, f"read_teachers missing filter param {name!r}"
