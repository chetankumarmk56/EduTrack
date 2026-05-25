"""
Tests for the Homework announcement category and per-child confirmation flow.

Properties under test:
1. Backward-compatible: a NORMAL announcement still validates without homework fields.
2. HOMEWORK requires due_date at the schema layer.
3. Confirming homework writes one row keyed by (announcement, student).
4. Duplicate confirmation is idempotent — same row, no error.
5. A parent cannot confirm a child that isn't theirs (403).
6. A parent cannot confirm against a non-homework announcement (400).
7. ``get_announcements_for_parent`` returns per-child status and counts.
"""
import os
import sys
from datetime import datetime, timezone, timedelta

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
    # Side-effect imports so all tables are registered on metadata.
    from app.models import (  # noqa: F401
        Institution, User, Student, Teacher, TeacherAssignment, Parent,
        Announcement,
    )
    from app.models.communication import HomeworkConfirmation, AnnouncementRead  # noqa: F401
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


async def _seed_world(session):
    """Set up: 1 institution, 1 class, 2 students, 1 parent (of both), 1 teacher."""
    from app.models import Institution, Student, Teacher, Parent, User
    from app.models.academic import SchoolClass, Grade, Section

    inst = Institution(name="Test Inst", slug="test-inst")
    session.add(inst); await session.flush()

    grade = Grade(level=1, name="G1", institution_id=inst.id)
    section = Section(name="A", institution_id=inst.id)
    session.add_all([grade, section]); await session.flush()
    section.grade_id = grade.id
    klass = SchoolClass(grade_id=grade.id, section_id=section.id, institution_id=inst.id)
    session.add(klass); await session.flush()

    parent_user = User(name="Parent One", email="p1@x.com", password_hash="x", role="parent", institution_id=inst.id)
    teacher_user = User(name="Teacher One", email="t1@x.com", password_hash="x", role="teacher", institution_id=inst.id)
    other_parent_user = User(name="Other Parent", email="op@x.com", password_hash="x", role="parent", institution_id=inst.id)
    session.add_all([parent_user, teacher_user, other_parent_user]); await session.flush()

    parent = Parent(user_id=parent_user.id, institution_id=inst.id)
    other_parent = Parent(user_id=other_parent_user.id, institution_id=inst.id)
    session.add_all([parent, other_parent]); await session.flush()

    teacher = Teacher(name="Teacher One", email="t1@x.com", user_id=teacher_user.id, institution_id=inst.id, is_active=True)
    session.add(teacher); await session.flush()

    s_a = Student(name="Child A", parent_name="Parent One", dob="2015-01-01",
                  school_class_id=klass.id, parent_id=parent.id, institution_id=inst.id, is_active=True)
    s_b = Student(name="Child B", parent_name="Parent One", dob="2015-02-01",
                  school_class_id=klass.id, parent_id=parent.id, institution_id=inst.id, is_active=True)
    s_other = Student(name="Other Child", parent_name="Other Parent", dob="2015-03-01",
                      school_class_id=klass.id, parent_id=other_parent.id, institution_id=inst.id, is_active=True)
    session.add_all([s_a, s_b, s_other]); await session.flush()

    return {
        "inst_id": inst.id, "class_id": klass.id,
        "parent_user_id": parent_user.id, "parent_id": parent.id,
        "other_parent_user_id": other_parent_user.id, "other_parent_id": other_parent.id,
        "teacher_user_id": teacher_user.id, "teacher_id": teacher.id,
        "child_a_id": s_a.id, "child_b_id": s_b.id, "other_child_id": s_other.id,
    }


def test_normal_announcement_schema_unchanged():
    """Old payloads without category/due_date still validate (backward compat)."""
    from app.schemas.communication import AnnouncementCreate
    a = AnnouncementCreate(title="t", message="m", type="CLASS", priority="NORMAL", class_id=1)
    assert a.category.value == "NORMAL"
    assert a.due_date is None


def test_homework_requires_due_date():
    from app.schemas.communication import AnnouncementCreate
    with pytest.raises(Exception) as exc:
        AnnouncementCreate(title="t", message="m", type="CLASS", priority="NORMAL",
                           category="HOMEWORK", class_id=1)
    assert "due_date" in str(exc.value)


@pytest.mark.asyncio
async def test_confirm_homework_writes_one_row_per_student():
    from app.services.announcement.homework_service import homework_service
    from app.models import Announcement
    from app.models.communication import AnnouncementCategory, AnnouncementType, AnnouncementPriority

    engine, session_factory = await _make_test_session()
    async with session_factory() as session:
        seed = await _seed_world(session)
        ann = Announcement(
            title="HW", message="do it", type=AnnouncementType.CLASS,
            priority=AnnouncementPriority.NORMAL, category=AnnouncementCategory.HOMEWORK,
            class_id=seed["class_id"], teacher_id=seed["teacher_id"],
            institution_id=seed["inst_id"],
            due_date=datetime.now(timezone.utc) + timedelta(days=2),
        )
        session.add(ann); await session.commit()
        ann_id = ann.id

    async with session_factory() as session:
        row_a = await homework_service.confirm_homework(
            session, ann_id, seed["parent_user_id"], seed["inst_id"], seed["child_a_id"]
        )
        row_b = await homework_service.confirm_homework(
            session, ann_id, seed["parent_user_id"], seed["inst_id"], seed["child_b_id"]
        )
        assert row_a.student_id == seed["child_a_id"]
        assert row_b.student_id == seed["child_b_id"]


@pytest.mark.asyncio
async def test_duplicate_confirmation_is_idempotent():
    from app.services.announcement.homework_service import homework_service
    from app.models import Announcement
    from app.models.communication import AnnouncementCategory, AnnouncementType, AnnouncementPriority

    engine, session_factory = await _make_test_session()
    async with session_factory() as session:
        seed = await _seed_world(session)
        ann = Announcement(
            title="HW", message="m", type=AnnouncementType.CLASS,
            priority=AnnouncementPriority.NORMAL, category=AnnouncementCategory.HOMEWORK,
            class_id=seed["class_id"], teacher_id=seed["teacher_id"],
            institution_id=seed["inst_id"],
            due_date=datetime.now(timezone.utc) + timedelta(days=2),
        )
        session.add(ann); await session.commit()
        ann_id = ann.id

    async with session_factory() as session:
        r1 = await homework_service.confirm_homework(
            session, ann_id, seed["parent_user_id"], seed["inst_id"], seed["child_a_id"]
        )
        r2 = await homework_service.confirm_homework(
            session, ann_id, seed["parent_user_id"], seed["inst_id"], seed["child_a_id"]
        )
        assert r1.id == r2.id


@pytest.mark.asyncio
async def test_parent_cannot_confirm_other_parents_child():
    from fastapi import HTTPException
    from app.services.announcement.homework_service import homework_service
    from app.models import Announcement
    from app.models.communication import AnnouncementCategory, AnnouncementType, AnnouncementPriority

    engine, session_factory = await _make_test_session()
    async with session_factory() as session:
        seed = await _seed_world(session)
        ann = Announcement(
            title="HW", message="m", type=AnnouncementType.CLASS,
            priority=AnnouncementPriority.NORMAL, category=AnnouncementCategory.HOMEWORK,
            class_id=seed["class_id"], teacher_id=seed["teacher_id"],
            institution_id=seed["inst_id"],
            due_date=datetime.now(timezone.utc) + timedelta(days=2),
        )
        session.add(ann); await session.commit()
        ann_id = ann.id

    async with session_factory() as session:
        with pytest.raises(HTTPException) as exc:
            await homework_service.confirm_homework(
                session, ann_id, seed["parent_user_id"], seed["inst_id"], seed["other_child_id"]
            )
        assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_cannot_confirm_against_non_homework_announcement():
    from fastapi import HTTPException
    from app.services.announcement.homework_service import homework_service
    from app.models import Announcement
    from app.models.communication import AnnouncementCategory, AnnouncementType, AnnouncementPriority

    engine, session_factory = await _make_test_session()
    async with session_factory() as session:
        seed = await _seed_world(session)
        ann = Announcement(
            title="Update", message="m", type=AnnouncementType.CLASS,
            priority=AnnouncementPriority.NORMAL, category=AnnouncementCategory.NORMAL,
            class_id=seed["class_id"], teacher_id=seed["teacher_id"],
            institution_id=seed["inst_id"],
        )
        session.add(ann); await session.commit()
        ann_id = ann.id

    async with session_factory() as session:
        with pytest.raises(HTTPException) as exc:
            await homework_service.confirm_homework(
                session, ann_id, seed["parent_user_id"], seed["inst_id"], seed["child_a_id"]
            )
        assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_parent_feed_returns_homework_status_for_each_child():
    from app.services.announcement.announcement_service import announcement_service
    from app.services.announcement.homework_service import homework_service
    from app.models import Announcement
    from app.models.communication import AnnouncementCategory, AnnouncementType, AnnouncementPriority

    engine, session_factory = await _make_test_session()
    async with session_factory() as session:
        seed = await _seed_world(session)
        ann = Announcement(
            title="HW", message="m", type=AnnouncementType.CLASS,
            priority=AnnouncementPriority.NORMAL, category=AnnouncementCategory.HOMEWORK,
            class_id=seed["class_id"], teacher_id=seed["teacher_id"],
            institution_id=seed["inst_id"],
            due_date=datetime.now(timezone.utc) + timedelta(days=2),
        )
        session.add(ann); await session.commit()
        ann_id = ann.id

    async with session_factory() as session:
        # Parent confirms for child A only.
        await homework_service.confirm_homework(
            session, ann_id, seed["parent_user_id"], seed["inst_id"], seed["child_a_id"]
        )

    async with session_factory() as session:
        feed = await announcement_service.get_announcements_for_parent(
            session,
            institution_id=seed["inst_id"],
            parent_id=seed["parent_id"],
            viewer_user_id=seed["parent_user_id"],
        )
    assert len(feed) == 1
    item = feed[0]
    assert item["category"] == AnnouncementCategory.HOMEWORK
    children = {c["student_id"]: c for c in item["homework_my_children"]}
    assert children[seed["child_a_id"]]["confirmed"] is True
    assert children[seed["child_b_id"]]["confirmed"] is False
    # Class has 3 students, only 1 confirmed.
    assert item["homework_confirmed_count"] == 1
    assert item["homework_target_count"] == 3
