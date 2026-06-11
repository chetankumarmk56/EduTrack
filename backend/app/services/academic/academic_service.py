from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
from fastapi import HTTPException, status
from app.models.academic import Grade, Section, SchoolClass, Subject
from app.models.directory import Student, Teacher, TeacherAssignment
from app.models.finance import StudentFee
from app.models.timetable import TimetableSlot
from app.schemas import academic as schemas
from app.core.logger import logger
from app.core.tenant import get_scoped


import re

# Section codes are short alphanumeric identifiers (A, B, AB, A1, …).
# Keeping the rule narrow means timetable/marks UI can rely on a tidy
# label that fits in chips and badges. Adjust here if a school later
# needs longer codes.
SECTION_NAME_PATTERN = re.compile(r"^[A-Z0-9]{1,4}$")
SECTION_NAME_RULE = "1–4 characters, letters/digits only (e.g. A, B, AB, 12)."


def _norm(name: Optional[str]) -> str:
    """Trim + casefold for duplicate comparison."""
    return (name or "").strip().casefold()


def _validate_section_name(name: str) -> Optional[str]:
    """Return None if valid, else a short reason string."""
    if not name or not name.strip():
        return "blank"
    candidate = name.strip().upper()
    if not SECTION_NAME_PATTERN.match(candidate):
        return "invalid_format"
    return None


class DuplicateAcademicEntity(HTTPException):
    """409 with a friendly message — the UI surfaces `detail` verbatim."""
    def __init__(self, message: str):
        super().__init__(status_code=status.HTTP_409_CONFLICT, detail=message)


class InvalidAcademicInput(HTTPException):
    """400 with a friendly message for shape / format errors."""
    def __init__(self, message: str):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=message)


class AcademicService:
    # --- Grade Methods ---
    @staticmethod
    async def get_grades(db: AsyncSession, institution_id: int):
        result = await db.execute(
            select(Grade).where(Grade.institution_id == institution_id).order_by(Grade.level)
        )
        return result.scalars().all()

    @staticmethod
    async def _ensure_unique_grade(
        db: AsyncSession,
        institution_id: int,
        *,
        name: Optional[str],
        level: Optional[int],
        exclude_id: Optional[int] = None,
    ) -> None:
        """Reject duplicate class name OR class level within the institution.

        Names are compared case-insensitively after trimming so "Class 10"
        and "class 10 " are treated as the same class. Level is compared
        as-is — two classes can't share the same numeric grade level.
        """
        if name:
            stmt = select(Grade.id).where(
                Grade.institution_id == institution_id,
                func.lower(func.trim(Grade.name)) == _norm(name),
            )
            if exclude_id is not None:
                stmt = stmt.where(Grade.id != exclude_id)
            existing = (await db.execute(stmt)).scalar()
            if existing:
                raise DuplicateAcademicEntity(
                    f"A class named '{name.strip()}' already exists."
                )
        if level is not None:
            stmt = select(Grade.id).where(
                Grade.institution_id == institution_id,
                Grade.level == level,
            )
            if exclude_id is not None:
                stmt = stmt.where(Grade.id != exclude_id)
            existing = (await db.execute(stmt)).scalar()
            if existing:
                raise DuplicateAcademicEntity(
                    f"Class level {level} is already in use."
                )

    @staticmethod
    async def create_grade(db: AsyncSession, institution_id: int, grade_in: schemas.GradeCreate):
        await AcademicService._ensure_unique_grade(
            db, institution_id, name=grade_in.name, level=grade_in.level,
        )
        db_grade = Grade(**grade_in.model_dump(), institution_id=institution_id)
        db.add(db_grade)
        await db.commit()
        await db.refresh(db_grade)
        return db_grade

    @staticmethod
    async def update_grade(db: AsyncSession, institution_id: int, grade_id: int, grade_in: schemas.GradeUpdate):
        result = await db.execute(
            select(Grade).where(Grade.id == grade_id, Grade.institution_id == institution_id)
        )
        db_grade = result.scalars().first()
        if not db_grade:
            return None

        update_data = grade_in.model_dump(exclude_unset=True)
        # Duplicate check only when name or level actually changes.
        new_name = update_data.get('name')
        new_level = update_data.get('level')
        if new_name is not None or new_level is not None:
            await AcademicService._ensure_unique_grade(
                db, institution_id,
                name=new_name if new_name != db_grade.name else None,
                level=new_level if new_level != db_grade.level else None,
                exclude_id=grade_id,
            )
        fee_changed = False
        if 'tuition_fee' in update_data and update_data['tuition_fee'] != db_grade.tuition_fee:
            fee_changed = True
        if 'fee_due_date' in update_data and update_data['fee_due_date'] != db_grade.fee_due_date:
            fee_changed = True

        for k, v in update_data.items():
            setattr(db_grade, k, v)

        if fee_changed:
            # Cascade to all SchoolClass mappings for this grade
            classes_result = await db.execute(select(SchoolClass).where(SchoolClass.grade_id == grade_id))
            school_classes = classes_result.scalars().all()

            from datetime import date
            from app.models.finance import StudentFeeStatus
            from app.models.directory import Student
            from app.services.academic.academic_year_service import academic_year_service
            year_id = await academic_year_service.resolve_active_year_id(db, institution_id)

            for sc in school_classes:
                if 'tuition_fee' in update_data:
                    sc.tuition_fee = update_data['tuition_fee']
                    sc.total_fee = sc.tuition_fee + (sc.other_fee or 0.0)
                if 'fee_due_date' in update_data:
                    sc.fee_due_date = update_data['fee_due_date']

                new_fee = sc.total_fee
                new_due_date = sc.fee_due_date

                # Step 1: Update all EXISTING StudentFee records for this class
                student_fees_res = await db.execute(
                    select(StudentFee).where(StudentFee.class_id == sc.id)
                )
                student_fees = student_fees_res.scalars().all()
                existing_student_ids = set()

                for sf in student_fees:
                    existing_student_ids.add(sf.student_id)
                    if 'tuition_fee' in update_data:
                        sf.total_amount = new_fee
                        sf.due_amount = max(0.0, sf.total_amount - sf.amount_paid)
                    if 'fee_due_date' in update_data and new_due_date:
                        sf.due_date = new_due_date

                    # Recalculate status
                    if sf.due_amount <= 0 and sf.total_amount > 0:
                        sf.status = StudentFeeStatus.PAID
                    elif sf.amount_paid > 0:
                        sf.status = StudentFeeStatus.PARTIAL
                    else:
                        sf.status = StudentFeeStatus.UNPAID

                # Step 2: Create missing StudentFee records for students WITHOUT one
                # This covers students enrolled when fee=0 and students enrolled before sync was added
                if 'tuition_fee' in update_data and new_fee > 0:
                    all_students_res = await db.execute(
                        select(Student).where(
                            Student.school_class_id == sc.id,
                            Student.is_active == True
                        )
                    )
                    all_students = all_students_res.scalars().all()

                    for student in all_students:
                        if student.id not in existing_student_ids:
                            # No StudentFee record exists — create one with the new fee
                            new_student_fee = StudentFee(
                                student_id=student.id,
                                class_id=sc.id,
                                institution_id=institution_id,
                                total_amount=new_fee,
                                due_amount=new_fee,
                                amount_paid=0.0,
                                due_date=new_due_date if new_due_date else date.today(),
                                status=StudentFeeStatus.UNPAID,
                                academic_year_id=year_id,
                            )
                            db.add(new_student_fee)
                            logger.info(
                                f"FEE_CASCADE: Created missing StudentFee for Student {student.id} "
                                f"in Class {sc.id} with amount ₹{new_fee}"
                            )


        await db.commit()
        await db.refresh(db_grade)
        return db_grade

    @staticmethod
    async def delete_grade(db: AsyncSession, institution_id: int, grade_id: int):
        result = await db.execute(
            select(Grade).where(Grade.id == grade_id, Grade.institution_id == institution_id)
        )
        db_grade = result.scalars().first()
        if db_grade:
            await db.delete(db_grade)
            await db.commit()
            return True
        return False

    @staticmethod
    async def get_grade_dependents(db: AsyncSession, institution_id: int, grade_id: int):
        """Return counts of items that will cascade-delete with this class.

        The UI uses this to power the confirmation dialog so admins know
        upfront how many students / sections / teacher assignments they're
        about to wipe out.
        """
        # Confirm the grade belongs to this institution before counting
        grade = (await db.execute(
            select(Grade.id).where(Grade.id == grade_id, Grade.institution_id == institution_id)
        )).scalar()
        if not grade:
            return None

        # Sections under this grade
        sections_count = (await db.execute(
            select(func.count(Section.id)).where(Section.grade_id == grade_id)
        )).scalar() or 0

        # SchoolClass mappings (grade × section) — students enroll into these
        sc_ids_result = await db.execute(
            select(SchoolClass.id).where(SchoolClass.grade_id == grade_id)
        )
        sc_ids = [row[0] for row in sc_ids_result.all()]

        students_count = 0
        assignments_count = 0
        timetable_count = 0
        teachers_distinct = 0
        if sc_ids:
            students_count = (await db.execute(
                select(func.count(Student.id)).where(
                    Student.school_class_id.in_(sc_ids),
                    Student.is_active == True,  # noqa: E712 — SQL boolean comparison
                )
            )).scalar() or 0
            assignments_count = (await db.execute(
                select(func.count(TeacherAssignment.id)).where(
                    TeacherAssignment.school_class_id.in_(sc_ids)
                )
            )).scalar() or 0
            # Distinct teachers across all assignments — the more useful
            # number for the "X teachers will lose this class" warning.
            teachers_distinct = (await db.execute(
                select(func.count(func.distinct(TeacherAssignment.teacher_id))).where(
                    TeacherAssignment.school_class_id.in_(sc_ids)
                )
            )).scalar() or 0
            timetable_count = (await db.execute(
                select(func.count(TimetableSlot.id)).where(
                    TimetableSlot.school_class_id.in_(sc_ids)
                )
            )).scalar() or 0

        return {
            "sections": int(sections_count),
            "classrooms": len(sc_ids),
            "students": int(students_count),
            "teacher_assignments": int(assignments_count),
            "teachers": int(teachers_distinct),
            "timetable_slots": int(timetable_count),
        }

    # --- Section Methods ---
    @staticmethod
    async def get_sections(db: AsyncSession, institution_id: int, grade_id: Optional[int] = None):
        stmt = select(Section).where(Section.institution_id == institution_id)
        if grade_id:
            stmt = stmt.where(Section.grade_id == grade_id)
        result = await db.execute(stmt)
        return result.scalars().all()

    @staticmethod
    async def _section_name_taken(
        db: AsyncSession, institution_id: int, grade_id: int, name: str,
        exclude_id: Optional[int] = None,
    ) -> bool:
        """Sections must be unique *within a class*, not across the whole school."""
        stmt = select(Section.id).where(
            Section.institution_id == institution_id,
            Section.grade_id == grade_id,
            func.lower(func.trim(Section.name)) == _norm(name),
        )
        if exclude_id is not None:
            stmt = stmt.where(Section.id != exclude_id)
        return (await db.execute(stmt)).scalar() is not None

    @staticmethod
    async def create_section(db: AsyncSession, institution_id: int, section_in: schemas.SectionCreate):
        grade_result = await db.execute(
            select(Grade).where(Grade.id == section_in.grade_id, Grade.institution_id == institution_id)
        )
        if not grade_result.scalars().first():
            return None

        # Normalise + format-check before any DB write.
        reason = _validate_section_name(section_in.name)
        if reason == "blank":
            raise InvalidAcademicInput("Section name is required.")
        if reason == "invalid_format":
            raise InvalidAcademicInput(f"Section name is not allowed. {SECTION_NAME_RULE}")
        normalised = section_in.name.strip().upper()

        if await AcademicService._section_name_taken(
            db, institution_id, section_in.grade_id, normalised,
        ):
            raise DuplicateAcademicEntity(
                f"Section '{normalised}' already exists in this class."
            )

        payload = section_in.model_dump()
        payload['name'] = normalised
        db_section = Section(**payload, institution_id=institution_id)
        db.add(db_section)
        await db.commit()
        await db.refresh(db_section)
        return db_section

    @staticmethod
    async def deploy_segment(db: AsyncSession, institution_id: int, section_in: schemas.SectionCreate):
        """
        Atomic deployment: Creates a Section AND its corresponding SchoolClass mapping.
        This is preferred over multiple frontend calls to ensure relational integrity.
        """
        grade_result = await db.execute(
            select(Grade).where(Grade.id == section_in.grade_id, Grade.institution_id == institution_id)
        )
        db_grade = grade_result.scalars().first()
        if not db_grade:
            return None

        reason = _validate_section_name(section_in.name)
        if reason == "blank":
            raise InvalidAcademicInput("Section name is required.")
        if reason == "invalid_format":
            raise InvalidAcademicInput(f"Section name is not allowed. {SECTION_NAME_RULE}")
        normalised = section_in.name.strip().upper()

        if await AcademicService._section_name_taken(
            db, institution_id, section_in.grade_id, normalised,
        ):
            raise DuplicateAcademicEntity(
                f"Section '{normalised}' already exists in {db_grade.name}."
            )

        # 1. Create Section
        db_section = Section(
            name=normalised,
            grade_id=section_in.grade_id,
            institution_id=institution_id
        )
        db.add(db_section)
        await db.flush() # Get ID without committing

        # 2. Create SchoolClass Mapping
        db_school_class = SchoolClass(
            grade_id=db_grade.id,
            section_id=db_section.id,
            institution_id=institution_id,
            display_name=f"{db_grade.level}-{db_section.name}",
            tuition_fee=db_grade.tuition_fee,
            other_fee=0.0,
            total_fee=db_grade.tuition_fee,
            fee_due_date=db_grade.fee_due_date
        )
        db.add(db_school_class)

        await db.commit()
        await db.refresh(db_section)
        return db_section

    @staticmethod
    async def deploy_segments_bulk(
        db: AsyncSession,
        institution_id: int,
        grade_id: int,
        names: List[str],
    ) -> dict:
        """Create many sections + SchoolClass mappings in one shot.

        The result distinguishes three buckets so the UI can show a
        precise summary:

        - ``created``: newly inserted Section rows.
        - ``skipped``: names that already existed in this class (no
          insert performed). Each entry includes a reason so the toast
          can say "B already exists".
        - ``invalid``: names that failed the format check (e.g. "10-A",
          empty after trim). Each entry includes a reason. Invalid names
          do not abort the batch — the admin still gets every valid
          section processed.

        - Trims whitespace and uppercases names ("a, b, C" → A, B, C).
        - Dedupes within the request so "A, A, B" becomes A, B (the
          duplicate is reported once under ``skipped`` with reason
          ``duplicate_in_request``).
        - Empty payload (no valid candidates) raises 400.
        """
        grade_result = await db.execute(
            select(Grade).where(Grade.id == grade_id, Grade.institution_id == institution_id)
        )
        db_grade = grade_result.scalars().first()
        if not db_grade:
            return None

        invalid: list[dict] = []
        seen: set[str] = set()
        cleaned: list[str] = []
        skipped: list[dict] = []

        for raw in names:
            label = (raw or "").strip()
            reason = _validate_section_name(label)
            if reason == "blank":
                # Skip silently — a stray comma shouldn't fill the
                # invalid list with empty entries.
                continue
            if reason == "invalid_format":
                invalid.append({"name": label, "reason": "invalid_format"})
                continue
            normalised = label.upper()
            if normalised in seen:
                skipped.append({"name": normalised, "reason": "duplicate_in_request"})
                continue
            seen.add(normalised)
            cleaned.append(normalised)

        if not cleaned and not invalid:
            raise InvalidAcademicInput("At least one section name is required.")

        # Pre-fetch existing names so we can skip duplicates without
        # rolling back the whole batch.
        existing_rows = await db.execute(
            select(Section.name).where(
                Section.institution_id == institution_id,
                Section.grade_id == grade_id,
            )
        )
        existing_norm = {_norm(r[0]) for r in existing_rows.all()}

        created: list[Section] = []
        for name in cleaned:
            if _norm(name) in existing_norm:
                skipped.append({"name": name, "reason": "already_exists"})
                continue
            db_section = Section(
                name=name,
                grade_id=grade_id,
                institution_id=institution_id,
            )
            db.add(db_section)
            await db.flush()
            db.add(SchoolClass(
                grade_id=db_grade.id,
                section_id=db_section.id,
                institution_id=institution_id,
                display_name=f"{db_grade.level}-{name}",
                tuition_fee=db_grade.tuition_fee,
                other_fee=0.0,
                total_fee=db_grade.tuition_fee,
                fee_due_date=db_grade.fee_due_date,
            ))
            existing_norm.add(_norm(name))
            created.append(db_section)

        await db.commit()
        for sec in created:
            await db.refresh(sec)

        return {
            "created": created,
            "skipped": skipped,
            "invalid": invalid,
            "rule": SECTION_NAME_RULE,
        }

    @staticmethod
    async def update_section(db: AsyncSession, institution_id: int, section_id: int, section_in: schemas.SectionUpdate):
        # Tenant scope: never resolve a section outside the caller's institution.
        db_section = await get_scoped(db, Section, section_id, institution_id)
        if not db_section:
            return None

        update_data = section_in.model_dump(exclude_unset=True)
        new_name = update_data.get('name')
        new_grade_id = update_data.get('grade_id', db_section.grade_id)
        if new_name is not None and (
            _norm(new_name) != _norm(db_section.name) or new_grade_id != db_section.grade_id
        ):
            if await AcademicService._section_name_taken(
                db, institution_id, new_grade_id, new_name, exclude_id=section_id,
            ):
                raise DuplicateAcademicEntity(
                    f"Section '{new_name.strip()}' already exists in this class."
                )

        for k, v in update_data.items():
            setattr(db_section, k, v)
        
        await db.commit()
        await db.refresh(db_section)
        return db_section

    @staticmethod
    async def delete_section(db: AsyncSession, institution_id: int, section_id: int):
        # Tenant scope: never resolve a section outside the caller's institution.
        db_section = await get_scoped(db, Section, section_id, institution_id)
        if db_section:
            await db.delete(db_section)
            await db.commit()
            return True
        return False

    # --- Subject Methods ---
    @staticmethod
    async def get_subjects(db: AsyncSession, institution_id: int):
        result = await db.execute(
            select(Subject).where(Subject.institution_id == institution_id)
        )
        return result.scalars().all()

    @staticmethod
    async def _subject_name_taken(
        db: AsyncSession, institution_id: int, name: str,
        exclude_id: Optional[int] = None,
    ) -> bool:
        stmt = select(Subject.id).where(
            Subject.institution_id == institution_id,
            func.lower(func.trim(Subject.name)) == _norm(name),
        )
        if exclude_id is not None:
            stmt = stmt.where(Subject.id != exclude_id)
        return (await db.execute(stmt)).scalar() is not None

    @staticmethod
    async def create_subject(db: AsyncSession, institution_id: int, subject_in: schemas.SubjectCreate):
        if await AcademicService._subject_name_taken(
            db, institution_id, subject_in.name,
        ):
            raise DuplicateAcademicEntity(
                f"Subject '{subject_in.name.strip()}' already exists."
            )
        db_subject = Subject(**subject_in.model_dump(), institution_id=institution_id)
        db.add(db_subject)
        await db.commit()
        await db.refresh(db_subject)
        return db_subject

    @staticmethod
    async def update_subject(db: AsyncSession, institution_id: int, subject_id: int, subject_in: schemas.SubjectUpdate):
        # Tenant scope: never resolve a subject outside the caller's institution.
        db_subject = await get_scoped(db, Subject, subject_id, institution_id)
        if not db_subject:
            return None

        update_data = subject_in.model_dump(exclude_unset=True)
        new_name = update_data.get('name')
        if new_name is not None and _norm(new_name) != _norm(db_subject.name):
            if await AcademicService._subject_name_taken(
                db, institution_id, new_name, exclude_id=subject_id,
            ):
                raise DuplicateAcademicEntity(
                    f"Subject '{new_name.strip()}' already exists."
                )

        for k, v in update_data.items():
            setattr(db_subject, k, v)
        
        await db.commit()
        await db.refresh(db_subject)
        return db_subject

    @staticmethod
    async def delete_subject(db: AsyncSession, institution_id: int, subject_id: int):
        # Tenant scope: never resolve a subject outside the caller's institution.
        db_subject = await get_scoped(db, Subject, subject_id, institution_id)
        if db_subject:
            await db.delete(db_subject)
            await db.commit()
            return True
        return False

    # --- SchoolClass Methods ---
    @staticmethod
    async def get_school_classes(db: AsyncSession, institution_id: int):
        result = await db.execute(
            select(SchoolClass)
            .options(selectinload(SchoolClass.grade), selectinload(SchoolClass.section))
            .where(SchoolClass.institution_id == institution_id)
        )
        return result.scalars().all()

    @staticmethod
    async def create_school_class(db: AsyncSession, institution_id: int, class_in: schemas.SchoolClassCreate):
        existing_result = await db.execute(
            select(SchoolClass).where(
                SchoolClass.grade_id == class_in.grade_id,
                SchoolClass.section_id == class_in.section_id,
                SchoolClass.institution_id == institution_id
            )
        )
        if existing_result.scalars().first():
            raise Exception("Class with this Grade and Section already exists")

        # Auto-calculate total_fee
        total_fee = (class_in.tuition_fee or 0.0) + (class_in.other_fee or 0.0)
        
        db_class = SchoolClass(
            **class_in.model_dump(exclude={"total_fee"}), 
            total_fee=total_fee,
            institution_id=institution_id
        )
        db.add(db_class)
        await db.commit()
        await db.refresh(db_class)
        return db_class

    @staticmethod
    async def update_school_class(db: AsyncSession, institution_id: int, class_id: int, class_in: schemas.SchoolClassUpdate):
        # Eager-load grade & section so the response serializer can read them
        # without triggering a lazy load (which fails in async context).
        result = await db.execute(
            select(SchoolClass)
            .options(selectinload(SchoolClass.grade), selectinload(SchoolClass.section))
            .where(SchoolClass.id == class_id, SchoolClass.institution_id == institution_id)
        )
        db_class = result.scalars().first()
        if not db_class:
            return None

        update_data = class_in.model_dump(exclude_unset=True)
        fee_fields_changed = any(
            k in update_data for k in ("tuition_fee", "other_fee", "fee_due_date")
        )
        for k, v in update_data.items():
            setattr(db_class, k, v)

        # Recalculate total_fee
        db_class.total_fee = (db_class.tuition_fee or 0.0) + (db_class.other_fee or 0.0)

        if fee_fields_changed:
            from datetime import date as date_type
            from app.models.finance import StudentFee, StudentFeeStatus
            from app.models.directory import Student as _Student
            from app.services.academic.academic_year_service import academic_year_service
            year_id = await academic_year_service.resolve_active_year_id(db, institution_id)

            new_fee = db_class.total_fee
            new_due_date = db_class.fee_due_date

            sf_res = await db.execute(
                select(StudentFee).where(StudentFee.class_id == db_class.id)
            )
            existing_fees = sf_res.scalars().all()
            existing_student_ids = set()

            for sf in existing_fees:
                existing_student_ids.add(sf.student_id)
                if "tuition_fee" in update_data or "other_fee" in update_data:
                    sf.total_amount = new_fee
                    sf.due_amount = max(0.0, sf.total_amount - sf.amount_paid)
                if "fee_due_date" in update_data and new_due_date:
                    sf.due_date = new_due_date
                if sf.due_amount <= 0 and sf.total_amount > 0:
                    sf.status = StudentFeeStatus.PAID
                elif sf.amount_paid > 0:
                    sf.status = StudentFeeStatus.PARTIAL
                else:
                    sf.status = StudentFeeStatus.UNPAID

            if new_fee > 0 and ("tuition_fee" in update_data or "other_fee" in update_data):
                all_res = await db.execute(
                    select(_Student).where(
                        _Student.school_class_id == db_class.id,
                        _Student.is_active == True,
                    )
                )
                for student in all_res.scalars().all():
                    if student.id not in existing_student_ids:
                        db.add(StudentFee(
                            student_id=student.id,
                            class_id=db_class.id,
                            institution_id=institution_id,
                            total_amount=new_fee,
                            due_amount=new_fee,
                            amount_paid=0.0,
                            due_date=new_due_date if new_due_date else date_type.today(),
                            status=StudentFeeStatus.UNPAID,
                            academic_year_id=year_id,
                        ))

        await db.commit()
        await db.refresh(db_class)
        return db_class

    @staticmethod
    async def delete_school_class(db: AsyncSession, institution_id: int, class_id: int):
        # Tenant scope: never resolve a class outside the caller's institution.
        db_class = await get_scoped(db, SchoolClass, class_id, institution_id)
        if db_class:
            await db.delete(db_class)
            await db.commit()
            return True
        return False

academic_service = AcademicService()
