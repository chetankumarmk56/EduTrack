from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from typing import List
from app.models import Mark, Student, Exam
from app.schemas import mark as schemas
from app.models.directory import Teacher, TeacherAssignment

class MarksService:
    @staticmethod
    async def record_mark(db: AsyncSession, institution_id: int, mark: schemas.MarkCreate, teacher_user_id: int = None) -> Mark:
        result = await db.execute(select(Student).where(
            Student.id == mark.student_id, 
            Student.institution_id == institution_id
        ))
        student = result.scalars().first()
        if not student:
            return None

        if teacher_user_id:
            t_result = await db.execute(select(Teacher).where(Teacher.user_id == teacher_user_id))
            teacher = t_result.scalars().first()
            if not teacher:
                return None
            
            assign_result = await db.execute(select(TeacherAssignment).where(
                TeacherAssignment.teacher_id == teacher.id,
                TeacherAssignment.school_class_id == student.school_class_id
            ))
            if not assign_result.scalars().first():
                return None

        if mark.score < 0: mark.score = 0
        if mark.max_score and mark.score > mark.max_score:
            mark.score = mark.max_score

        ex_result = await db.execute(select(Mark).where(
            Mark.student_id == mark.student_id,
            Mark.test_name == mark.test_name,
            Mark.subject == mark.subject,
            Mark.institution_id == institution_id
        ))
        existing = ex_result.scalars().first()
        
        if existing:
            existing.score = mark.score
            if mark.max_score:
                existing.max_score = mark.max_score
            if mark.exam_id:
                existing.exam_id = mark.exam_id
            await db.commit()
            await db.refresh(existing)
            return existing
        else:
            db_mark = Mark(**mark.model_dump(), institution_id=institution_id)
            db.add(db_mark)
            await db.commit()
            
            # Fetch with relationships after commit
            res = await db.execute(
                select(Mark)
                .options(selectinload(Mark.student), selectinload(Mark.exam), selectinload(Mark.subject_ref))
                .where(Mark.id == db_mark.id)
            )
            return res.scalars().first()
            
    @staticmethod
    async def record_marks_batch(db: AsyncSession, institution_id: int, marks: List[schemas.MarkCreate], teacher_user_id: int = None):
        """
        Upsert a batch of marks in a constant-ish number of round trips.

        Round-trip count, irrespective of batch size:
          1. (optional) teacher_id resolution
          2. bulk students
          3. (optional) bulk teacher_assignments
          4. bulk exams (only if any input row carries exam_id)
          5. bulk existing marks — exam-based path
          6. bulk existing marks — legacy (test_name, subject) path
          7. final commit
          8. final selectinload-enriched fetch

        Previously step 5+6 were replaced by a per-input-row SELECT inside
        the loop — a true N+1 (the bulk pre-load existed but was unused).
        """
        teacher_id = None
        if teacher_user_id:
            t_result = await db.execute(select(Teacher).where(Teacher.user_id == teacher_user_id))
            t = t_result.scalars().first()
            teacher_id = t.id if t else None

        # ── Bulk-load students ─────────────────────────────────────────────
        student_ids = list({m.student_id for m in marks})
        students_result = await db.execute(select(Student).where(
            Student.id.in_(student_ids),
            Student.institution_id == institution_id
        ))
        students = {s.id: s for s in students_result.scalars().all()}

        # ── Bulk-load teacher assignments (authorization gate) ─────────────
        teacher_assignments = {}
        if teacher_id:
            class_ids = {s.school_class_id for s in students.values() if s and s.school_class_id}
            if class_ids:
                ta_result = await db.execute(select(TeacherAssignment).where(
                    TeacherAssignment.teacher_id == teacher_id,
                    TeacherAssignment.school_class_id.in_(class_ids)
                ))
                teacher_assignments = {ta.school_class_id: ta for ta in ta_result.scalars().all()}

        # ── Bulk-load exams (used to fill in subject from exam.name) ───────
        exam_ids = list({m.exam_id for m in marks if m.exam_id})
        exams = {}
        if exam_ids:
            exams_result = await db.execute(select(Exam).where(Exam.id.in_(exam_ids)))
            exams = {e.id: e for e in exams_result.scalars().all()}

        # ── Bulk-load existing marks, keyed by composite identity ──────────
        # A Mark is uniquely identified by either (student_id, exam_id) or
        # (student_id, test_name, subject) — never by student_id alone.
        # Loading by student_id and using student_id as the dict key (as
        # the previous "optimization" did) silently dropped multiple marks
        # per student and forced a per-row SELECT in the loop.
        exam_keys: set[tuple] = set()
        legacy_keys: set[tuple] = set()
        for m in marks:
            if m.exam_id:
                exam_keys.add((m.student_id, m.exam_id))
            elif m.test_name is not None and m.subject is not None:
                legacy_keys.add((m.student_id, m.test_name, m.subject))

        existing_by_exam: dict[tuple, Mark] = {}
        existing_by_legacy: dict[tuple, Mark] = {}

        if exam_keys:
            # Bound by the union of student_ids × exam_ids — the DB filters
            # are still selective on either column individually. We then
            # tuple-match in Python so we don't pay for a (s1,e1) OR (s2,e2)
            # OR … query that no DB can plan well.
            res = await db.execute(select(Mark).where(
                Mark.student_id.in_({sid for sid, _ in exam_keys}),
                Mark.exam_id.in_({eid for _, eid in exam_keys}),
                Mark.institution_id == institution_id,
            ))
            for row in res.scalars().all():
                key = (row.student_id, row.exam_id)
                if key in exam_keys:
                    existing_by_exam[key] = row

        if legacy_keys:
            res = await db.execute(select(Mark).where(
                Mark.student_id.in_({sid for sid, _, _ in legacy_keys}),
                Mark.test_name.in_({tn for _, tn, _ in legacy_keys}),
                Mark.subject.in_({sj for _, _, sj in legacy_keys}),
                Mark.institution_id == institution_id,
            ))
            for row in res.scalars().all():
                key = (row.student_id, row.test_name, row.subject)
                if key in legacy_keys:
                    existing_by_legacy[key] = row

        # ── Apply updates / inserts in-memory ──────────────────────────────
        results: list[Mark] = []
        for mark in marks:
            student = students.get(mark.student_id)
            if not student:
                continue
            if teacher_id and student.school_class_id not in teacher_assignments:
                continue

            if mark.score < 0:
                mark.score = 0
            if mark.max_score and mark.score > mark.max_score:
                mark.score = mark.max_score

            if mark.exam_id:
                exam = exams.get(mark.exam_id)
                if exam and not mark.subject:
                    mark.subject = exam.name
                existing = existing_by_exam.get((mark.student_id, mark.exam_id))
            else:
                existing = existing_by_legacy.get(
                    (mark.student_id, mark.test_name, mark.subject)
                )

            if existing:
                existing.score = mark.score
                if mark.max_score:
                    existing.max_score = mark.max_score
                if mark.exam_id:
                    existing.exam_id = mark.exam_id
            else:
                existing = Mark(**mark.model_dump(), institution_id=institution_id)
                db.add(existing)
                # Insert into the local index so a duplicate later in the
                # same batch (rare but possible — a teacher submits the
                # same student twice in one CSV) gets updated, not double-inserted.
                if mark.exam_id:
                    existing_by_exam[(mark.student_id, mark.exam_id)] = existing
                else:
                    existing_by_legacy[(mark.student_id, mark.test_name, mark.subject)] = existing
            results.append(existing)

        await db.commit()

        # ── Final fetch with relationships, order preserved ────────────────
        final_ids = [r.id for r in results if r.id]
        if final_ids:
            res = await db.execute(
                select(Mark)
                .options(
                    selectinload(Mark.student),
                    selectinload(Mark.exam),
                    selectinload(Mark.subject_ref)
                )
                .where(Mark.id.in_(final_ids))
            )
            fetched_marks = {m.id: m for m in res.scalars().all()}
            return [fetched_marks[r.id] for r in results if r.id in fetched_marks]
        return []
        
    @staticmethod
    async def get_marks(
        db: AsyncSession,
        institution_id: int,
        student_id: int,
        *,
        date_from: str = None,
        date_to: str = None,
    ):
        """
        Marks for a student, optionally bounded by a date range over
        ``Mark.created_at``.

        Route layer fills in a 365-day default; we accept ``None`` for
        backward compat with callers that haven't migrated. Hard cap at
        1000 rows newest-first as a safety net — a transcript spanning
        4 years × 6 subjects × 4 terms × 2 attempts ≈ 192 marks per
        year, so 1000 covers ~5 years comfortably.
        """
        from datetime import datetime, time as dtime, timezone

        stmt = (
            select(Mark)
            .options(
                selectinload(Mark.student),
                selectinload(Mark.exam),
                selectinload(Mark.subject_ref)
            )
            .where(
                Mark.student_id == student_id,
                Mark.institution_id == institution_id
            )
        )
        # Date filters operate on the timestamptz column; we widen each
        # bound to the inclusive day boundary so YYYY-MM-DD strings work
        # naturally for parent-facing pickers.
        if date_from:
            try:
                d_from = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
                stmt = stmt.where(Mark.created_at >= d_from)
            except ValueError:
                pass
        if date_to:
            try:
                d_to = datetime.combine(
                    datetime.fromisoformat(date_to).date(),
                    dtime.max,
                    tzinfo=timezone.utc,
                )
                stmt = stmt.where(Mark.created_at <= d_to)
            except ValueError:
                pass

        stmt = stmt.order_by(Mark.created_at.desc()).limit(1000)
        result = await db.execute(stmt)
        return result.scalars().all()
        
    @staticmethod
    async def get_class_marks(db: AsyncSession, institution_id: int, subject: str, school_class_id: int = None, exam_id: int = None):
        stmt = select(Mark).join(Student).where(Mark.institution_id == institution_id)
        
        if exam_id:
            stmt = stmt.where(Mark.exam_id == exam_id)
        else:
            stmt = stmt.where(Mark.subject == subject)
            
        if school_class_id:
            stmt = stmt.where(Student.school_class_id == school_class_id)
        
        stmt = stmt.options(
            selectinload(Mark.student), 
            selectinload(Mark.exam),
            selectinload(Mark.subject_ref)
        )
        result = await db.execute(stmt)
        return result.scalars().all()
        
    @staticmethod
    async def get_exams(db: AsyncSession, institution_id: int, school_class_id: int = None, subject_id: int = None):
        stmt = select(Exam).options(selectinload(Exam.subject_ref)).where(Exam.institution_id == institution_id)
        if school_class_id:
            stmt = stmt.where(Exam.school_class_id == school_class_id)
        if subject_id:
            stmt = stmt.where(Exam.subject_id == subject_id)
        result = await db.execute(stmt)
        return result.scalars().all()

    @staticmethod
    async def create_exam(db: AsyncSession, institution_id: int, exam: schemas.ExamCreate, school_class_id: int = None, subject_id: int = None):
        db_exam = Exam(
            **exam.model_dump(), 
            institution_id=institution_id,
            school_class_id=school_class_id,
            subject_id=subject_id
        )
        db.add(db_exam)
        await db.commit()
        await db.refresh(db_exam)
        return db_exam

    @staticmethod
    async def update_exam(db: AsyncSession, institution_id: int, exam_id: int, name: str):
        result = await db.execute(select(Exam).where(Exam.id == exam_id, Exam.institution_id == institution_id))
        db_exam = result.scalars().first()
        if not db_exam: return None
        
        db_exam.name = name
        await db.commit()
        await db.refresh(db_exam)
        return db_exam

    @staticmethod
    async def delete_exam_object(db: AsyncSession, institution_id: int, exam_id: int):
        # 1. Delete associated marks first (due to FK constraints)
        await db.execute(delete(Mark).where(Mark.exam_id == exam_id, Mark.institution_id == institution_id))
        # 2. Delete the exam itself
        await db.execute(delete(Exam).where(Exam.id == exam_id, Exam.institution_id == institution_id))
        await db.commit()
        return True

    @staticmethod
    async def delete_test(
        db: AsyncSession,
        institution_id: int,
        subject: str = None,
        test_name: str = None,
        exam_id: int = None,
        student_ids: List[int] = None
    ):
        """
        Delete marks by either:
        1. exam_id (for exam-based marks)
        2. subject + test_name (for legacy marks)

        Issues ONE DELETE statement and reads ``rowcount`` for the
        deleted-records counter. The previous implementation SELECTed all
        matches into memory then ``db.delete(mark)`` per row — for a
        single exam across 200 students × 6 subjects that's 1200+ SQL
        statements where one DELETE … WHERE … suffices.
        """
        where_clauses = [Mark.institution_id == institution_id]

        if exam_id is not None:
            where_clauses.append(Mark.exam_id == exam_id)
        elif subject is not None and test_name is not None:
            where_clauses.append(Mark.subject == subject)
            where_clauses.append(Mark.test_name == test_name)
        else:
            return {"status": "error", "detail": "Either exam_id OR (subject + test_name) required"}

        if student_ids:
            where_clauses.append(Mark.student_id.in_(student_ids))

        result = await db.execute(delete(Mark).where(*where_clauses))
        await db.commit()
        # SQLAlchemy 2.x exposes rowcount on the result for DML statements.
        # Falls back to -1 on backends that don't report it; the API still
        # returns success so the caller can stop showing the rows in UI.
        count = result.rowcount if result.rowcount is not None else -1
        return {"status": "success", "deleted_records": count}

    @staticmethod
    async def get_subject_summary(db: AsyncSession, institution_id: int, subject: str, school_class_id: int):
        from sqlalchemy import func
        stmt = select(
            func.avg(Mark.score).label("average"),
            func.max(Mark.score).label("max"),
            func.min(Mark.score).label("min"),
            func.count(Mark.id).label("count")
        ).join(Student).where(
            Mark.institution_id == institution_id,
            Mark.subject == subject,
            Student.school_class_id == school_class_id
        )
        result = await db.execute(stmt)
        summary = result.fetchone()
        
        return {
            "subject": subject,
            "school_class_id": school_class_id,
            "average": round(float(summary.average or 0), 2),
            "max": summary.max or 0,
            "min": summary.min or 0,
            "count": summary.count
        }

    @staticmethod
    async def get_student_rankings(db: AsyncSession, institution_id: int, student_id: int):
        from sqlalchemy import func
        from app.models.academic import SchoolClass
        
        # 1. Get student's class and grade info
        res = await db.execute(select(Student).where(Student.id == student_id))
        student = res.scalars().first()
        if not student or not student.school_class_id:
            return None
            
        res = await db.execute(select(SchoolClass).where(SchoolClass.id == student.school_class_id))
        school_class = res.scalars().first()
        if not school_class:
            return None
            
        # 2. Get all students in the same grade and same section (class) with names
        grade_students_res = await db.execute(
            select(Student.id, Student.name)
            .join(SchoolClass)
            .where(SchoolClass.grade_id == school_class.grade_id, Student.institution_id == institution_id)
        )
        grade_students_data = {r[0]: r[1] for r in grade_students_res.all()}
        grade_student_ids = list(grade_students_data.keys())
        
        class_students_res = await db.execute(
            select(Student.id, Student.name)
            .where(Student.school_class_id == school_class.id, Student.institution_id == institution_id)
        )
        class_students_data = {r[0]: r[1] for r in class_students_res.all()}
        class_student_ids = list(class_students_data.keys())
        
        # 3. Helper to calculate overall percentage for a list of students
        async def calculate_percentages(s_ids):
            if not s_ids: return {}
            # Query sum of scores and sum of max_scores per student
            marks_res = await db.execute(
                select(
                    Mark.student_id,
                    func.sum(Mark.score).label("total_score"),
                    func.sum(Mark.max_score).label("total_max")
                )
                .where(Mark.student_id.in_(s_ids), Mark.institution_id == institution_id)
                .group_by(Mark.student_id)
            )
            pcts = {
                r.student_id: (r.total_score / r.total_max * 100) if r.total_max > 0 else 0 
                for r in marks_res.all()
            }
            # Fill in 0 for students with no marks
            for s_id in s_ids:
                if s_id not in pcts:
                    pcts[s_id] = 0
            return pcts
            
        grade_percentages = await calculate_percentages(grade_student_ids)
        class_percentages = await calculate_percentages(class_student_ids)
        
        # 4. Helper to determine rank and leaderboard
        def get_leaderboard(percentages_dict, names_dict):
            # Sort by percentage desc
            sorted_items = sorted(percentages_dict.items(), key=lambda x: x[1], reverse=True)
            leaderboard = []
            prev_pct = None
            curr_rank = 0
            for i, (sid, pct) in enumerate(sorted_items):
                if pct != prev_pct:
                    curr_rank = i + 1
                prev_pct = pct
                leaderboard.append({
                    "student_id": sid,
                    "name": names_dict.get(sid, "Unknown"),
                    "percentage": round(pct, 2),
                    "rank": curr_rank
                })
            return leaderboard

        grade_leaderboard = get_leaderboard(grade_percentages, grade_students_data)
        class_leaderboard = get_leaderboard(class_percentages, class_students_data)
        
        my_grade_rank = next((item["rank"] for item in grade_leaderboard if item["student_id"] == student_id), None)
        my_class_rank = next((item["rank"] for item in class_leaderboard if item["student_id"] == student_id), None)
            
        return {
            "grade_rank": my_grade_rank,
            "grade_total": len(grade_student_ids),
            "grade_leaderboard": grade_leaderboard,
            "class_rank": my_class_rank,
            "class_total": len(class_student_ids),
            "class_leaderboard": class_leaderboard,
            "percentage": round(class_percentages.get(student_id, 0), 2)
        }

marks_service = MarksService()
