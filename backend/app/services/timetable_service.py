from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Optional

from app.models.timetable import SchedulePeriod, TimetableSlot
from app.models.academic import SchoolClass, Subject
from app.models.directory import Teacher, TeacherAssignment
from app.schemas import timetable as schemas


class TimetableService:
    # ---------------- Schedule Periods ----------------

    @staticmethod
    async def get_periods(db: AsyncSession, institution_id: int) -> List[SchedulePeriod]:
        result = await db.execute(
            select(SchedulePeriod)
            .where(SchedulePeriod.institution_id == institution_id)
            .order_by(SchedulePeriod.order, SchedulePeriod.start_time)
        )
        return result.scalars().all()

    @staticmethod
    async def create_period(
        db: AsyncSession, institution_id: int, period_in: schemas.SchedulePeriodCreate
    ) -> SchedulePeriod:
        db_period = SchedulePeriod(**period_in.model_dump(), institution_id=institution_id)
        db.add(db_period)
        await db.commit()
        await db.refresh(db_period)
        return db_period

    @staticmethod
    async def update_period(
        db: AsyncSession,
        institution_id: int,
        period_id: int,
        period_in: schemas.SchedulePeriodUpdate,
    ) -> Optional[SchedulePeriod]:
        result = await db.execute(
            select(SchedulePeriod).where(
                SchedulePeriod.id == period_id,
                SchedulePeriod.institution_id == institution_id,
            )
        )
        db_period = result.scalars().first()
        if not db_period:
            return None

        for k, v in period_in.model_dump(exclude_unset=True).items():
            setattr(db_period, k, v)

        await db.commit()
        await db.refresh(db_period)
        return db_period

    @staticmethod
    async def delete_period(db: AsyncSession, institution_id: int, period_id: int) -> bool:
        result = await db.execute(
            select(SchedulePeriod).where(
                SchedulePeriod.id == period_id,
                SchedulePeriod.institution_id == institution_id,
            )
        )
        db_period = result.scalars().first()
        if not db_period:
            return False
        await db.delete(db_period)
        await db.commit()
        return True

    # ---------------- Timetable Slots ----------------

    @staticmethod
    def _slot_query_base(institution_id: int):
        return (
            select(TimetableSlot)
            .options(
                selectinload(TimetableSlot.subject),
                selectinload(TimetableSlot.teacher),
                selectinload(TimetableSlot.school_class),
            )
            .where(TimetableSlot.institution_id == institution_id)
        )

    @staticmethod
    async def get_slots_for_class(
        db: AsyncSession, institution_id: int, school_class_id: int
    ) -> List[TimetableSlot]:
        stmt = TimetableService._slot_query_base(institution_id).where(
            TimetableSlot.school_class_id == school_class_id
        )
        result = await db.execute(stmt)
        return result.scalars().all()

    @staticmethod
    async def get_slots_for_teacher(
        db: AsyncSession, institution_id: int, teacher_id: int
    ) -> List[TimetableSlot]:
        stmt = TimetableService._slot_query_base(institution_id).where(
            TimetableSlot.teacher_id == teacher_id
        )
        result = await db.execute(stmt)
        return result.scalars().all()

    @staticmethod
    async def upsert_slot(
        db: AsyncSession, institution_id: int, slot_in: schemas.TimetableSlotCreate
    ) -> TimetableSlot:
        # Validate the SchoolClass and SchedulePeriod belong to this institution.
        sc_res = await db.execute(
            select(SchoolClass).where(
                SchoolClass.id == slot_in.school_class_id,
                SchoolClass.institution_id == institution_id,
            )
        )
        if not sc_res.scalars().first():
            raise ValueError("SchoolClass not found")

        sp_res = await db.execute(
            select(SchedulePeriod).where(
                SchedulePeriod.id == slot_in.schedule_period_id,
                SchedulePeriod.institution_id == institution_id,
            )
        )
        period = sp_res.scalars().first()
        if not period:
            raise ValueError("SchedulePeriod not found")
        if period.period_type != "class_period":
            raise ValueError("Cannot assign a class to a non-class period (break/lunch/etc.)")

        # If teacher+subject both supplied, verify TeacherAssignment exists.
        if slot_in.teacher_id and slot_in.subject_id:
            ta_res = await db.execute(
                select(TeacherAssignment).where(
                    TeacherAssignment.teacher_id == slot_in.teacher_id,
                    TeacherAssignment.school_class_id == slot_in.school_class_id,
                    TeacherAssignment.subject_id == slot_in.subject_id,
                    TeacherAssignment.institution_id == institution_id,
                )
            )
            if not ta_res.scalars().first():
                raise ValueError(
                    "Teacher is not assigned to this subject for this class"
                )

        # Find existing slot for (class, period, day) — upsert behavior.
        existing_res = await db.execute(
            select(TimetableSlot).where(
                TimetableSlot.school_class_id == slot_in.school_class_id,
                TimetableSlot.schedule_period_id == slot_in.schedule_period_id,
                TimetableSlot.day_of_week == slot_in.day_of_week,
                TimetableSlot.institution_id == institution_id,
            )
        )
        existing = existing_res.scalars().first()

        if existing:
            existing.subject_id = slot_in.subject_id
            existing.teacher_id = slot_in.teacher_id
            existing.room = slot_in.room
            db_slot = existing
        else:
            db_slot = TimetableSlot(
                **slot_in.model_dump(), institution_id=institution_id
            )
            db.add(db_slot)

        await db.commit()

        # Reload with relationships eager-loaded.
        reload_res = await db.execute(
            TimetableService._slot_query_base(institution_id).where(
                TimetableSlot.id == db_slot.id
            )
        )
        return reload_res.scalars().first()

    @staticmethod
    async def update_slot(
        db: AsyncSession,
        institution_id: int,
        slot_id: int,
        slot_in: schemas.TimetableSlotUpdate,
    ) -> Optional[TimetableSlot]:
        res = await db.execute(
            select(TimetableSlot).where(
                TimetableSlot.id == slot_id,
                TimetableSlot.institution_id == institution_id,
            )
        )
        slot = res.scalars().first()
        if not slot:
            return None

        update_data = slot_in.model_dump(exclude_unset=True)
        # Optional re-validation when teacher+subject changes
        new_teacher = update_data.get("teacher_id", slot.teacher_id)
        new_subject = update_data.get("subject_id", slot.subject_id)
        if new_teacher and new_subject:
            ta_res = await db.execute(
                select(TeacherAssignment).where(
                    TeacherAssignment.teacher_id == new_teacher,
                    TeacherAssignment.school_class_id == slot.school_class_id,
                    TeacherAssignment.subject_id == new_subject,
                    TeacherAssignment.institution_id == institution_id,
                )
            )
            if not ta_res.scalars().first():
                raise ValueError("Teacher is not assigned to this subject for this class")

        for k, v in update_data.items():
            setattr(slot, k, v)

        await db.commit()

        reload_res = await db.execute(
            TimetableService._slot_query_base(institution_id).where(
                TimetableSlot.id == slot.id
            )
        )
        return reload_res.scalars().first()

    @staticmethod
    async def delete_slot(db: AsyncSession, institution_id: int, slot_id: int) -> bool:
        res = await db.execute(
            select(TimetableSlot).where(
                TimetableSlot.id == slot_id,
                TimetableSlot.institution_id == institution_id,
            )
        )
        slot = res.scalars().first()
        if not slot:
            return False
        await db.delete(slot)
        await db.commit()
        return True

    @staticmethod
    async def get_teacher_by_user_id(db: AsyncSession, user_id: int) -> Optional[Teacher]:
        res = await db.execute(select(Teacher).where(Teacher.user_id == user_id))
        return res.scalars().first()


timetable_service = TimetableService()
