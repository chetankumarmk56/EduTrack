"""
Year-end promotion: preview (dry-run) and execute (transactional, idempotent).

Promotion advances every active student one grade, graduates the top grade,
honours a per-student retain list, auto-creates missing next-grade classes, and
preserves all history via per-year Enrollment snapshots. Old academic rows are
left untouched (they belong to the closing year); the new year starts empty.

Idempotency: a PromotionRun row keyed (institution_id, from_year_id) guards
against double-promotion — re-running returns the stored summary.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logger import logger
from app.models.academic import (
    Grade, Section, SchoolClass,
    AcademicYear, Enrollment, PromotionRun,
    ENROLLMENT_ACTIVE, ENROLLMENT_PROMOTED, ENROLLMENT_GRADUATED, ENROLLMENT_RETAINED,
)
from app.models.directory import Student
from app.models.mark import Mark
from app.models.finance import StudentFee, StudentFeeStatus
from app.models.core import AuditLog
from app.services.academic.academic_year_service import academic_year_service, next_year_label
from app.services.academic import enrollment_service

# Decision labels returned by preview / accepted conceptually by execute.
DECISION_PROMOTE = "PROMOTE"
DECISION_RETAIN = "RETAIN"
DECISION_GRADUATE = "GRADUATE"


class PromotionService:
    # ── shared loaders ─────────────────────────────────────────────────────
    @staticmethod
    async def _grades_by_level(db: AsyncSession, institution_id: int) -> dict[int, Grade]:
        res = await db.execute(
            select(Grade).where(Grade.institution_id == institution_id)
        )
        return {g.level: g for g in res.scalars().all() if g.level is not None}

    @staticmethod
    async def _active_students(db: AsyncSession, institution_id: int) -> list[Student]:
        res = await db.execute(
            select(Student)
            .options(
                selectinload(Student.school_class).selectinload(SchoolClass.grade),
                selectinload(Student.school_class).selectinload(SchoolClass.section),
            )
            .where(Student.institution_id == institution_id, Student.is_active.is_(True))
        )
        return list(res.scalars().all())

    @staticmethod
    async def _percentages(db: AsyncSession, institution_id: int, year_id: Optional[int]) -> dict[int, float]:
        """student_id -> overall % (SUM(score)/SUM(max_score)*100) for the year."""
        if not year_id:
            return {}
        res = await db.execute(
            select(
                Mark.student_id,
                func.sum(Mark.score),
                func.sum(Mark.max_score),
            )
            .where(
                Mark.institution_id == institution_id,
                Mark.academic_year_id == year_id,
            )
            .group_by(Mark.student_id)
        )
        out: dict[int, float] = {}
        for sid, total_score, total_max in res.all():
            if total_max and total_max > 0:
                out[sid] = round((total_score or 0) / total_max * 100, 1)
        return out

    @staticmethod
    async def _arrears(db: AsyncSession, institution_id: int) -> dict[int, float]:
        """student_id -> outstanding due across all fee rows (informational)."""
        res = await db.execute(
            select(StudentFee.student_id, func.sum(StudentFee.due_amount))
            .where(
                StudentFee.institution_id == institution_id,
                StudentFee.status != StudentFeeStatus.PAID,
            )
            .group_by(StudentFee.student_id)
        )
        return {sid: round(total or 0.0, 2) for sid, total in res.all()}

    @staticmethod
    async def _find_target_class(
        db: AsyncSession, institution_id: int, next_grade: Grade, section_name: Optional[str]
    ) -> Optional[SchoolClass]:
        """Existing next-grade SchoolClass matching the section *name*, or None."""
        if not section_name:
            return None
        res = await db.execute(
            select(SchoolClass)
            .join(Section, SchoolClass.section_id == Section.id)
            .where(
                SchoolClass.institution_id == institution_id,
                SchoolClass.grade_id == next_grade.id,
                func.lower(func.trim(Section.name)) == section_name.strip().lower(),
            )
            .limit(1)
        )
        return res.scalars().first()

    @staticmethod
    async def _create_target_class(
        db: AsyncSession, institution_id: int, next_grade: Grade, section_name: str
    ) -> SchoolClass:
        """Create the next-grade Section + SchoolClass (mirrors deploy_segment)."""
        normalised = section_name.strip().upper()
        # Reuse an existing same-name section under the next grade if present.
        sec = (await db.execute(
            select(Section).where(
                Section.institution_id == institution_id,
                Section.grade_id == next_grade.id,
                func.lower(func.trim(Section.name)) == normalised.lower(),
            ).limit(1)
        )).scalars().first()
        if not sec:
            sec = Section(name=normalised, grade_id=next_grade.id, institution_id=institution_id)
            db.add(sec)
            await db.flush()
        sc = SchoolClass(
            grade_id=next_grade.id,
            section_id=sec.id,
            institution_id=institution_id,
            display_name=f"{next_grade.level}-{normalised}",
            tuition_fee=next_grade.tuition_fee or 0.0,
            other_fee=0.0,
            total_fee=next_grade.tuition_fee or 0.0,
            fee_due_date=next_grade.fee_due_date,
        )
        db.add(sc)
        await db.flush()
        logger.info(
            f"PROMOTION: auto-created class {sc.display_name} (id {sc.id}) "
            f"for grade {next_grade.name}"
        )
        return sc

    # ── preview ────────────────────────────────────────────────────────────
    @staticmethod
    async def preview_promotion(
        db: AsyncSession, institution_id: int, retained_student_ids: Optional[list[int]] = None
    ) -> dict:
        retained = set(retained_student_ids or [])
        active_year = await academic_year_service.get_active_year(db, institution_id)
        year_id = active_year.id if active_year else None

        grades = await PromotionService._grades_by_level(db, institution_id)
        max_level = max(grades.keys()) if grades else None
        students = await PromotionService._active_students(db, institution_id)
        pct = await PromotionService._percentages(db, institution_id, year_id)
        arrears = await PromotionService._arrears(db, institution_id)

        already = (await db.execute(
            select(PromotionRun.id).where(
                PromotionRun.institution_id == institution_id,
                PromotionRun.from_year_id == year_id,
            )
        )).scalar() if year_id else None

        # Group students by class.
        classes: dict[int, dict] = {}
        unassigned: list[dict] = []
        promote_count = retain_count = graduate_count = 0
        auto_create: set[str] = set()

        for s in students:
            sc = s.school_class
            student_pct = pct.get(s.id)
            row = {
                "student_id": s.id,
                "name": s.name,
                "admission_number": s.admission_number,
                "roll_number": s.roll_number,
                "overall_percentage": student_pct,
                "arrears": arrears.get(s.id, 0.0),
            }
            if not sc:
                row["decision"] = DECISION_PROMOTE
                unassigned.append(row)
                continue

            level = sc.grade.level if sc.grade else None
            is_top = (level is not None and level == max_level)
            if s.id in retained:
                decision = DECISION_RETAIN
                retain_count += 1
            elif is_top:
                decision = DECISION_GRADUATE
                graduate_count += 1
            else:
                decision = DECISION_PROMOTE
                promote_count += 1
            row["decision"] = decision

            grp = classes.get(sc.id)
            if grp is None:
                next_grade = grades.get(level + 1) if level is not None else None
                section_name = sc.section.name if sc.section else None
                target = None
                will_create = False
                target_name = None
                if next_grade is not None:
                    target = await PromotionService._find_target_class(
                        db, institution_id, next_grade, section_name
                    )
                    target_name = target.display_name if target else f"{next_grade.level}-{section_name}"
                    if target is None and section_name:
                        will_create = True
                        auto_create.add(target_name)
                grp = {
                    "school_class_id": sc.id,
                    "class_name": sc.display_name or (
                        f"{sc.grade.name}-{section_name}" if sc.grade else None
                    ),
                    "grade_id": sc.grade_id,
                    "grade_level": level,
                    "section_name": section_name,
                    "is_top_grade": is_top,
                    "target_class_name": None if is_top else target_name,
                    "will_create_target": will_create,
                    "students": [],
                }
                classes[sc.id] = grp
            grp["students"].append(row)

        # Per-class overall % = mean of present student percentages.
        class_list = []
        for grp in classes.values():
            present = [r["overall_percentage"] for r in grp["students"] if r["overall_percentage"] is not None]
            grp["class_overall_percentage"] = round(sum(present) / len(present), 1) if present else None
            grp["student_count"] = len(grp["students"])
            grp["students"].sort(key=lambda r: ((r["roll_number"] or 9999), (r["name"] or "")))
            class_list.append(grp)
        class_list.sort(key=lambda g: (g["grade_level"] if g["grade_level"] is not None else 999))

        return {
            "active_year": ({"id": active_year.id, "label": active_year.label} if active_year else None),
            "next_year_label": next_year_label(active_year.label) if active_year else None,
            "already_promoted": bool(already),
            "totals": {
                "students": len(students),
                "promote": promote_count,
                "retain": retain_count,
                "graduate": graduate_count,
                "unassigned": len(unassigned),
            },
            "auto_create_classes": sorted(auto_create),
            "classes": class_list,
            "unassigned": unassigned,
        }

    # ── execute ────────────────────────────────────────────────────────────
    @staticmethod
    async def execute_promotion(
        db: AsyncSession,
        institution_id: int,
        *,
        retained_student_ids: Optional[list[int]] = None,
        next_year_label: Optional[str] = None,
        performed_by_id: Optional[int] = None,
    ) -> dict:
        from app.services.student.student_service import StudentService

        retained = set(retained_student_ids or [])
        active_year = await academic_year_service.get_active_year(db, institution_id)
        if not active_year:
            raise ValueError("No active academic year to promote from.")

        # Idempotency guard.
        existing_run = (await db.execute(
            select(PromotionRun).where(
                PromotionRun.institution_id == institution_id,
                PromotionRun.from_year_id == active_year.id,
            ).limit(1)
        )).scalars().first()
        if existing_run:
            summary = dict(existing_run.summary or {})
            summary["already_promoted"] = True
            return summary

        target_label = next_year_label or _default_next_label(active_year.label)
        # Guard double-submit / bad input: the target year must differ from the
        # year being promoted, or we'd roll a year into itself and re-advance
        # students. Combined with the PromotionRun unique key, this makes a
        # repeated execute safe.
        if target_label == active_year.label:
            raise ValueError(
                f"Next academic year '{target_label}' must differ from the current "
                f"active year. Promotion already appears to be complete."
            )
        to_year = await academic_year_service.create_and_activate_next_year(
            db, institution_id, target_label
        )

        grades = await PromotionService._grades_by_level(db, institution_id)
        max_level = max(grades.keys()) if grades else None
        students = await PromotionService._active_students(db, institution_id)

        # Caches so auto-created classes are reused across students.
        target_cache: dict[tuple[int, str], SchoolClass] = {}
        affected_classes: set[int] = set()
        promoted = retained_n = graduated = skipped = 0
        created_class_names: set[str] = set()

        for s in students:
            sc = s.school_class
            old_class_id = s.school_class_id

            if not sc:
                skipped += 1
                continue
            level = sc.grade.level if sc.grade else None
            section_name = sc.section.name if sc.section else None

            if s.id in retained:
                # Stay put. Old enrollment -> RETAINED; new-year enrollment ACTIVE.
                await enrollment_service.upsert_enrollment(
                    db, institution_id=institution_id, student_id=s.id,
                    school_class_id=old_class_id, academic_year_id=active_year.id,
                    status=ENROLLMENT_RETAINED, roll_number=s.roll_number,
                )
                await enrollment_service.upsert_enrollment(
                    db, institution_id=institution_id, student_id=s.id,
                    school_class_id=old_class_id, academic_year_id=to_year.id,
                    status=ENROLLMENT_ACTIVE,
                )
                # A retained student repeats the same class, so the existing
                # (student, class) fee row is reused (the unique key prevents a
                # second one). Re-stamp it to the new year so the repeated-year
                # obligation reads as a current due, not last-year arrears.
                await StudentService._sync_student_fee(db, s.id, old_class_id, institution_id)
                retained_fee = (await db.execute(
                    select(StudentFee).where(
                        StudentFee.student_id == s.id,
                        StudentFee.class_id == old_class_id,
                    )
                )).scalars().first()
                if retained_fee:
                    retained_fee.academic_year_id = to_year.id
                affected_classes.add(old_class_id)
                retained_n += 1
                continue

            if level is not None and level == max_level:
                # Graduate. Keep the record; no new enrollment.
                s.is_active = False
                await enrollment_service.upsert_enrollment(
                    db, institution_id=institution_id, student_id=s.id,
                    school_class_id=old_class_id, academic_year_id=active_year.id,
                    status=ENROLLMENT_GRADUATED, roll_number=s.roll_number,
                )
                affected_classes.add(old_class_id)
                graduated += 1
                continue

            # Promote.
            next_grade = grades.get(level + 1) if level is not None else None
            if next_grade is None or not section_name:
                # No next grade defined or no section to map — leave as-is.
                skipped += 1
                continue
            cache_key = (next_grade.id, section_name.strip().lower())
            target = target_cache.get(cache_key)
            if target is None:
                target = await PromotionService._find_target_class(
                    db, institution_id, next_grade, section_name
                )
                if target is None:
                    target = await PromotionService._create_target_class(
                        db, institution_id, next_grade, section_name
                    )
                    created_class_names.add(target.display_name)
                target_cache[cache_key] = target

            s.school_class_id = target.id
            await enrollment_service.upsert_enrollment(
                db, institution_id=institution_id, student_id=s.id,
                school_class_id=old_class_id, academic_year_id=active_year.id,
                status=ENROLLMENT_PROMOTED, roll_number=s.roll_number,
            )
            await enrollment_service.upsert_enrollment(
                db, institution_id=institution_id, student_id=s.id,
                school_class_id=target.id, academic_year_id=to_year.id,
                status=ENROLLMENT_ACTIVE,
            )
            await StudentService._sync_student_fee(db, s.id, target.id, institution_id)
            affected_classes.add(old_class_id)
            affected_classes.add(target.id)
            promoted += 1

        await db.flush()
        # Recompute roll numbers for every class whose membership shifted.
        for cls_id in affected_classes:
            await StudentService._recompute_roll_numbers(db, institution_id, cls_id)

        summary = {
            "from_year": {"id": active_year.id, "label": active_year.label},
            "to_year": {"id": to_year.id, "label": to_year.label},
            "promoted": promoted,
            "retained": retained_n,
            "graduated": graduated,
            "skipped": skipped,
            "created_classes": sorted(created_class_names),
        }

        run = PromotionRun(
            institution_id=institution_id,
            from_year_id=active_year.id,
            to_year_id=to_year.id,
            performed_by_id=performed_by_id,
            summary=summary,
        )
        db.add(run)
        db.add(AuditLog(
            user_id=performed_by_id,
            action="PROMOTE_STUDENTS",
            resource_type="AcademicYear",
            resource_id=to_year.id,
            institution_id=institution_id,
            description=(
                f"Promoted {promoted}, retained {retained_n}, graduated {graduated} "
                f"from {active_year.label} to {to_year.label}."
            ),
            new_values=summary,
        ))
        await db.commit()
        logger.info(f"PROMOTION: institution {institution_id} {summary}")
        summary["already_promoted"] = False
        return summary


def _default_next_label(label: str) -> str:
    return next_year_label(label)


promotion_service = PromotionService()
