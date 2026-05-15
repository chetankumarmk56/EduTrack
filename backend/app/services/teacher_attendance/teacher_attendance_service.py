"""Service layer for teacher attendance and leave management."""
import json
from datetime import datetime, timezone
from typing import Optional, List, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from sqlalchemy.orm import selectinload

from app.models.teacher_attendance import (
    TeacherAttendance, TeacherLeaveRequest, TeacherAttendanceAuditLog,
)
from app.models.directory import Teacher
from app.models.core import User


def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _now_time() -> str:
    return datetime.now().strftime("%H:%M")


def _enrich_attendance(row: TeacherAttendance, teacher_name: str = "") -> dict:
    return {
        "id": row.id,
        "teacher_id": row.teacher_id,
        "teacher_name": teacher_name,
        "date": row.date,
        "check_in_time": row.check_in_time,
        "check_out_time": row.check_out_time,
        "status": row.status,
        "remarks": row.remarks,
        "is_edited": row.is_edited,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def _enrich_leave(row: TeacherLeaveRequest, teacher_name: str = "", approved_by_name: str = "") -> dict:
    return {
        "id": row.id,
        "teacher_id": row.teacher_id,
        "teacher_name": teacher_name,
        "leave_type": row.leave_type,
        "start_date": row.start_date,
        "end_date": row.end_date,
        "days_count": row.days_count,
        "reason": row.reason,
        "status": row.status,
        "approved_by_id": row.approved_by_id,
        "approved_by_name": approved_by_name or None,
        "approved_at": row.approved_at,
        "rejection_reason": row.rejection_reason,
        "created_at": row.created_at,
    }


async def _get_teacher(db: AsyncSession, institution_id: int, teacher_id: int) -> Teacher:
    result = await db.execute(
        select(Teacher).where(Teacher.id == teacher_id, Teacher.institution_id == institution_id)
    )
    teacher = result.scalars().first()
    if not teacher:
        raise ValueError("Teacher not found")
    return teacher


async def _get_user_name(db: AsyncSession, user_id: int) -> str:
    result = await db.execute(select(User.name).where(User.id == user_id))
    name = result.scalar()
    return name or ""


async def _write_audit(
    db: AsyncSession,
    *,
    institution_id: int,
    teacher_id: int,
    changed_by_id: int,
    action: str,
    entity_type: str,
    entity_id: Optional[int] = None,
    attendance_id: Optional[int] = None,
    old_value: Optional[dict] = None,
    new_value: Optional[dict] = None,
):
    log = TeacherAttendanceAuditLog(
        institution_id=institution_id,
        teacher_id=teacher_id,
        entity_type=entity_type,
        entity_id=entity_id,
        attendance_id=attendance_id,
        changed_by_id=changed_by_id,
        action=action,
        old_value=json.dumps(old_value) if old_value else None,
        new_value=json.dumps(new_value) if new_value else None,
    )
    db.add(log)


# ── Teacher-facing operations ────────────────────────────────────────────────

async def teacher_check_in(
    db: AsyncSession,
    *,
    institution_id: int,
    teacher_id: int,
    user_id: int,
    remarks: Optional[str] = None,
) -> dict:
    today = _today()

    existing = await db.execute(
        select(TeacherAttendance).where(
            TeacherAttendance.teacher_id == teacher_id,
            TeacherAttendance.date == today,
            TeacherAttendance.institution_id == institution_id,
        )
    )
    rec = existing.scalars().first()
    if rec:
        raise ValueError("Already checked in today")

    teacher = await _get_teacher(db, institution_id, teacher_id)
    now_time = _now_time()
    rec = TeacherAttendance(
        teacher_id=teacher_id,
        institution_id=institution_id,
        date=today,
        check_in_time=now_time,
        status="PRESENT",
        remarks=remarks,
    )
    db.add(rec)
    await db.flush()

    await _write_audit(
        db,
        institution_id=institution_id,
        teacher_id=teacher_id,
        changed_by_id=user_id,
        action="CHECK_IN",
        entity_type="ATTENDANCE",
        entity_id=rec.id,
        attendance_id=rec.id,
        new_value={"check_in_time": now_time, "date": today},
    )
    await db.commit()
    await db.refresh(rec)
    return _enrich_attendance(rec, teacher.name)


async def teacher_check_out(
    db: AsyncSession,
    *,
    institution_id: int,
    teacher_id: int,
    user_id: int,
    remarks: Optional[str] = None,
) -> dict:
    today = _today()

    existing = await db.execute(
        select(TeacherAttendance).where(
            TeacherAttendance.teacher_id == teacher_id,
            TeacherAttendance.date == today,
            TeacherAttendance.institution_id == institution_id,
        )
    )
    rec = existing.scalars().first()
    if not rec:
        raise ValueError("No check-in found for today. Please check in first.")
    if rec.check_out_time:
        raise ValueError("Already checked out today")

    now_time = _now_time()
    old = {"check_out_time": rec.check_out_time}
    rec.check_out_time = now_time
    if remarks:
        rec.remarks = (rec.remarks or "") + f" | Checkout note: {remarks}"

    await _write_audit(
        db,
        institution_id=institution_id,
        teacher_id=teacher_id,
        changed_by_id=user_id,
        action="CHECK_OUT",
        entity_type="ATTENDANCE",
        entity_id=rec.id,
        attendance_id=rec.id,
        old_value=old,
        new_value={"check_out_time": now_time},
    )
    await db.commit()
    await db.refresh(rec)

    teacher = await _get_teacher(db, institution_id, teacher_id)
    return _enrich_attendance(rec, teacher.name)


async def get_today_status(
    db: AsyncSession,
    *,
    institution_id: int,
    teacher_id: int,
) -> Optional[dict]:
    today = _today()
    result = await db.execute(
        select(TeacherAttendance).where(
            TeacherAttendance.teacher_id == teacher_id,
            TeacherAttendance.date == today,
            TeacherAttendance.institution_id == institution_id,
        )
    )
    rec = result.scalars().first()
    if not rec:
        return None
    teacher = await _get_teacher(db, institution_id, teacher_id)
    return _enrich_attendance(rec, teacher.name)


async def get_my_attendance_history(
    db: AsyncSession,
    *,
    institution_id: int,
    teacher_id: int,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> Tuple[int, List[dict]]:
    conditions = [
        TeacherAttendance.teacher_id == teacher_id,
        TeacherAttendance.institution_id == institution_id,
    ]
    if date_from:
        conditions.append(TeacherAttendance.date >= date_from)
    if date_to:
        conditions.append(TeacherAttendance.date <= date_to)

    count_result = await db.execute(
        select(func.count()).select_from(TeacherAttendance).where(and_(*conditions))
    )
    total = count_result.scalar() or 0

    rows_result = await db.execute(
        select(TeacherAttendance)
        .where(and_(*conditions))
        .order_by(TeacherAttendance.date.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = rows_result.scalars().all()
    teacher = await _get_teacher(db, institution_id, teacher_id)
    return total, [_enrich_attendance(r, teacher.name) for r in rows]


# ── Leave operations ─────────────────────────────────────────────────────────

def _count_working_days(start: str, end: str) -> int:
    from datetime import date
    s = date.fromisoformat(start)
    e = date.fromisoformat(end)
    if e < s:
        return 0
    delta = (e - s).days + 1
    return delta  # simple calendar days; weekends not excluded at model level


async def apply_leave(
    db: AsyncSession,
    *,
    institution_id: int,
    teacher_id: int,
    user_id: int,
    leave_type: str,
    start_date: str,
    end_date: str,
    reason: str,
) -> dict:
    if end_date < start_date:
        raise ValueError("end_date must be >= start_date")

    # Check for overlapping pending/approved leave
    overlap = await db.execute(
        select(TeacherLeaveRequest).where(
            TeacherLeaveRequest.teacher_id == teacher_id,
            TeacherLeaveRequest.institution_id == institution_id,
            TeacherLeaveRequest.status.in_(["PENDING", "APPROVED"]),
            TeacherLeaveRequest.start_date <= end_date,
            TeacherLeaveRequest.end_date >= start_date,
        )
    )
    if overlap.scalars().first():
        raise ValueError("You already have a pending or approved leave overlapping these dates")

    days = _count_working_days(start_date, end_date)
    leave = TeacherLeaveRequest(
        teacher_id=teacher_id,
        institution_id=institution_id,
        leave_type=leave_type,
        start_date=start_date,
        end_date=end_date,
        days_count=days,
        reason=reason,
        status="PENDING",
    )
    db.add(leave)
    await db.flush()

    await _write_audit(
        db,
        institution_id=institution_id,
        teacher_id=teacher_id,
        changed_by_id=user_id,
        action="CREATE_LEAVE",
        entity_type="LEAVE",
        entity_id=leave.id,
        new_value={"leave_type": leave_type, "start_date": start_date, "end_date": end_date, "days": days},
    )
    await db.commit()
    await db.refresh(leave)

    teacher = await _get_teacher(db, institution_id, teacher_id)
    return _enrich_leave(leave, teacher.name)


async def cancel_leave(
    db: AsyncSession,
    *,
    institution_id: int,
    teacher_id: int,
    user_id: int,
    leave_id: int,
) -> dict:
    result = await db.execute(
        select(TeacherLeaveRequest).where(
            TeacherLeaveRequest.id == leave_id,
            TeacherLeaveRequest.teacher_id == teacher_id,
            TeacherLeaveRequest.institution_id == institution_id,
        )
    )
    leave = result.scalars().first()
    if not leave:
        raise ValueError("Leave request not found")
    if leave.status not in ("PENDING",):
        raise ValueError(f"Cannot cancel a leave with status '{leave.status}'")

    old_status = leave.status
    leave.status = "CANCELLED"

    await _write_audit(
        db,
        institution_id=institution_id,
        teacher_id=teacher_id,
        changed_by_id=user_id,
        action="CANCEL",
        entity_type="LEAVE",
        entity_id=leave.id,
        old_value={"status": old_status},
        new_value={"status": "CANCELLED"},
    )
    await db.commit()
    await db.refresh(leave)

    teacher = await _get_teacher(db, institution_id, teacher_id)
    return _enrich_leave(leave, teacher.name)


async def get_my_leaves(
    db: AsyncSession,
    *,
    institution_id: int,
    teacher_id: int,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> Tuple[int, List[dict]]:
    conditions = [
        TeacherLeaveRequest.teacher_id == teacher_id,
        TeacherLeaveRequest.institution_id == institution_id,
    ]
    if status:
        conditions.append(TeacherLeaveRequest.status == status.upper())

    count_result = await db.execute(
        select(func.count()).select_from(TeacherLeaveRequest).where(and_(*conditions))
    )
    total = count_result.scalar() or 0

    rows_result = await db.execute(
        select(TeacherLeaveRequest)
        .where(and_(*conditions))
        .order_by(TeacherLeaveRequest.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = rows_result.scalars().all()
    teacher = await _get_teacher(db, institution_id, teacher_id)
    return total, [_enrich_leave(r, teacher.name) for r in rows]


# ── Admin operations ─────────────────────────────────────────────────────────

async def admin_list_attendance(
    db: AsyncSession,
    *,
    institution_id: int,
    teacher_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
) -> Tuple[int, List[dict]]:
    conditions = [TeacherAttendance.institution_id == institution_id]
    if teacher_id:
        conditions.append(TeacherAttendance.teacher_id == teacher_id)
    if date_from:
        conditions.append(TeacherAttendance.date >= date_from)
    if date_to:
        conditions.append(TeacherAttendance.date <= date_to)
    if status:
        conditions.append(TeacherAttendance.status == status.upper())

    count_result = await db.execute(
        select(func.count()).select_from(TeacherAttendance).where(and_(*conditions))
    )
    total = count_result.scalar() or 0

    rows_result = await db.execute(
        select(TeacherAttendance)
        .where(and_(*conditions))
        .order_by(TeacherAttendance.date.desc(), TeacherAttendance.teacher_id)
        .offset(skip)
        .limit(limit)
    )
    rows = rows_result.scalars().all()

    # Batch-load teacher names
    teacher_ids = list({r.teacher_id for r in rows})
    name_map: dict[int, str] = {}
    if teacher_ids:
        t_result = await db.execute(
            select(Teacher.id, Teacher.name).where(Teacher.id.in_(teacher_ids))
        )
        for tid, tname in t_result.all():
            name_map[tid] = tname

    return total, [_enrich_attendance(r, name_map.get(r.teacher_id, "")) for r in rows]


async def admin_edit_attendance(
    db: AsyncSession,
    *,
    institution_id: int,
    teacher_id: int,
    date: str,
    admin_user_id: int,
    status: str,
    check_in_time: Optional[str] = None,
    check_out_time: Optional[str] = None,
    remarks: Optional[str] = None,
) -> dict:
    existing = await db.execute(
        select(TeacherAttendance).where(
            TeacherAttendance.teacher_id == teacher_id,
            TeacherAttendance.date == date,
            TeacherAttendance.institution_id == institution_id,
        )
    )
    rec = existing.scalars().first()
    old_snapshot: dict = {}
    if rec:
        old_snapshot = {
            "status": rec.status,
            "check_in_time": rec.check_in_time,
            "check_out_time": rec.check_out_time,
            "remarks": rec.remarks,
        }
        rec.status = status
        rec.check_in_time = check_in_time
        rec.check_out_time = check_out_time
        rec.remarks = remarks
        rec.is_edited = 1
        rec.edited_by_id = admin_user_id
    else:
        rec = TeacherAttendance(
            teacher_id=teacher_id,
            institution_id=institution_id,
            date=date,
            status=status,
            check_in_time=check_in_time,
            check_out_time=check_out_time,
            remarks=remarks,
            is_edited=1,
            edited_by_id=admin_user_id,
        )
        db.add(rec)

    await db.flush()
    new_snapshot = {
        "status": status,
        "check_in_time": check_in_time,
        "check_out_time": check_out_time,
        "remarks": remarks,
    }
    await _write_audit(
        db,
        institution_id=institution_id,
        teacher_id=teacher_id,
        changed_by_id=admin_user_id,
        action="EDIT",
        entity_type="ATTENDANCE",
        entity_id=rec.id,
        attendance_id=rec.id,
        old_value=old_snapshot if old_snapshot else None,
        new_value=new_snapshot,
    )
    await db.commit()
    await db.refresh(rec)

    teacher = await _get_teacher(db, institution_id, teacher_id)
    return _enrich_attendance(rec, teacher.name)


async def admin_list_leaves(
    db: AsyncSession,
    *,
    institution_id: int,
    teacher_id: Optional[int] = None,
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
) -> Tuple[int, List[dict]]:
    conditions = [TeacherLeaveRequest.institution_id == institution_id]
    if teacher_id:
        conditions.append(TeacherLeaveRequest.teacher_id == teacher_id)
    if status:
        conditions.append(TeacherLeaveRequest.status == status.upper())
    if date_from:
        conditions.append(TeacherLeaveRequest.start_date >= date_from)
    if date_to:
        conditions.append(TeacherLeaveRequest.end_date <= date_to)

    count_result = await db.execute(
        select(func.count()).select_from(TeacherLeaveRequest).where(and_(*conditions))
    )
    total = count_result.scalar() or 0

    rows_result = await db.execute(
        select(TeacherLeaveRequest)
        .where(and_(*conditions))
        .order_by(TeacherLeaveRequest.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = rows_result.scalars().all()

    # Batch-load names
    teacher_ids = list({r.teacher_id for r in rows})
    approver_ids = list({r.approved_by_id for r in rows if r.approved_by_id})
    name_map: dict[int, str] = {}
    user_name_map: dict[int, str] = {}

    if teacher_ids:
        t_result = await db.execute(
            select(Teacher.id, Teacher.name).where(Teacher.id.in_(teacher_ids))
        )
        for tid, tname in t_result.all():
            name_map[tid] = tname

    if approver_ids:
        u_result = await db.execute(
            select(User.id, User.name).where(User.id.in_(approver_ids))
        )
        for uid, uname in u_result.all():
            user_name_map[uid] = uname

    return total, [
        _enrich_leave(
            r,
            name_map.get(r.teacher_id, ""),
            user_name_map.get(r.approved_by_id, "") if r.approved_by_id else "",
        )
        for r in rows
    ]


async def admin_action_leave(
    db: AsyncSession,
    *,
    institution_id: int,
    leave_id: int,
    admin_user_id: int,
    action: str,  # "APPROVE" or "REJECT"
    rejection_reason: Optional[str] = None,
) -> dict:
    result = await db.execute(
        select(TeacherLeaveRequest).where(
            TeacherLeaveRequest.id == leave_id,
            TeacherLeaveRequest.institution_id == institution_id,
        )
    )
    leave = result.scalars().first()
    if not leave:
        raise ValueError("Leave request not found")
    if leave.status != "PENDING":
        raise ValueError(f"Cannot act on a leave with status '{leave.status}'")

    old_status = leave.status
    if action == "APPROVE":
        leave.status = "APPROVED"
        leave.approved_by_id = admin_user_id
        leave.approved_at = datetime.now(timezone.utc)
    elif action == "REJECT":
        leave.status = "REJECTED"
        leave.approved_by_id = admin_user_id
        leave.approved_at = datetime.now(timezone.utc)
        leave.rejection_reason = rejection_reason
    else:
        raise ValueError("action must be APPROVE or REJECT")

    await _write_audit(
        db,
        institution_id=institution_id,
        teacher_id=leave.teacher_id,
        changed_by_id=admin_user_id,
        action=action,
        entity_type="LEAVE",
        entity_id=leave.id,
        old_value={"status": old_status},
        new_value={"status": leave.status, "rejection_reason": rejection_reason},
    )
    await db.commit()
    await db.refresh(leave)

    teacher = await _get_teacher(db, institution_id, leave.teacher_id)
    admin_name = await _get_user_name(db, admin_user_id)
    return _enrich_leave(leave, teacher.name, admin_name)


async def get_audit_logs(
    db: AsyncSession,
    *,
    institution_id: int,
    teacher_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
) -> Tuple[int, List[dict]]:
    conditions = [TeacherAttendanceAuditLog.institution_id == institution_id]
    if teacher_id:
        conditions.append(TeacherAttendanceAuditLog.teacher_id == teacher_id)

    count_result = await db.execute(
        select(func.count()).select_from(TeacherAttendanceAuditLog).where(and_(*conditions))
    )
    total = count_result.scalar() or 0

    rows_result = await db.execute(
        select(TeacherAttendanceAuditLog)
        .where(and_(*conditions))
        .order_by(TeacherAttendanceAuditLog.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = rows_result.scalars().all()

    # Batch-load changed_by names
    changer_ids = list({r.changed_by_id for r in rows})
    user_name_map: dict[int, str] = {}
    if changer_ids:
        u_result = await db.execute(
            select(User.id, User.name).where(User.id.in_(changer_ids))
        )
        for uid, uname in u_result.all():
            user_name_map[uid] = uname

    return total, [
        {
            "id": r.id,
            "teacher_id": r.teacher_id,
            "entity_type": r.entity_type,
            "entity_id": r.entity_id,
            "changed_by_id": r.changed_by_id,
            "changed_by_name": user_name_map.get(r.changed_by_id, ""),
            "action": r.action,
            "old_value": r.old_value,
            "new_value": r.new_value,
            "created_at": r.created_at,
        }
        for r in rows
    ]


async def get_attendance_summary(
    db: AsyncSession,
    *,
    institution_id: int,
    teacher_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> List[dict]:
    conditions = [TeacherAttendance.institution_id == institution_id]
    if teacher_id:
        conditions.append(TeacherAttendance.teacher_id == teacher_id)
    if date_from:
        conditions.append(TeacherAttendance.date >= date_from)
    if date_to:
        conditions.append(TeacherAttendance.date <= date_to)

    rows_result = await db.execute(
        select(
            TeacherAttendance.teacher_id,
            TeacherAttendance.status,
            func.count().label("cnt"),
        )
        .where(and_(*conditions))
        .group_by(TeacherAttendance.teacher_id, TeacherAttendance.status)
    )
    raw = rows_result.all()

    from collections import defaultdict
    summary: dict[int, dict] = defaultdict(lambda: {"present": 0, "absent": 0, "half_day": 0, "on_leave": 0})
    for tid, status, cnt in raw:
        key = status.lower() if status in ("PRESENT", "ABSENT", "HALF_DAY", "ON_LEAVE") else "present"
        summary[tid][key] += cnt

    # Load teacher names
    teacher_ids = list(summary.keys())
    name_map: dict[int, str] = {}
    if teacher_ids:
        t_result = await db.execute(
            select(Teacher.id, Teacher.name).where(Teacher.id.in_(teacher_ids))
        )
        for tid, tname in t_result.all():
            name_map[tid] = tname

    result = []
    for tid, counts in summary.items():
        total_days = sum(counts.values())
        result.append({
            "teacher_id": tid,
            "teacher_name": name_map.get(tid, ""),
            "present": counts["present"],
            "absent": counts["absent"],
            "half_day": counts["half_day"],
            "on_leave": counts["on_leave"],
            "total_days": total_days,
        })
    result.sort(key=lambda x: x["teacher_name"])
    return result
