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
        teacher_id = None
        if teacher_user_id:
            t_result = await db.execute(select(Teacher).where(Teacher.user_id == teacher_user_id))
            t = t_result.scalars().first()
            teacher_id = t.id if t else None

        # OPTIMIZATION: Bulk-load all students instead of looping (eliminates N+1)
        student_ids = [m.student_id for m in marks]
        students_result = await db.execute(select(Student).where(
            Student.id.in_(student_ids),
            Student.institution_id == institution_id
        ))
        students = {s.id: s for s in students_result.scalars().all()}
        
        # OPTIMIZATION: Bulk-load teacher assignments if needed
        teacher_assignments = {}
        if teacher_id:
            class_ids = set(s.school_class_id for s in students.values() if s)
            if class_ids:
                ta_result = await db.execute(select(TeacherAssignment).where(
                    TeacherAssignment.teacher_id == teacher_id,
                    TeacherAssignment.school_class_id.in_(class_ids)
                ))
                teacher_assignments = {ta.school_class_id: ta for ta in ta_result.scalars().all()}
        
        # OPTIMIZATION: Bulk-load existing marks
        existing_marks_result = await db.execute(select(Mark).where(
            Mark.student_id.in_(student_ids),
            Mark.institution_id == institution_id
        ))
        existing_marks = {m.student_id: m for m in existing_marks_result.scalars().all()}

        results = []
        exam_ids = [m.exam_id for m in marks if m.exam_id]
        exams = {}
        if exam_ids:
            exams_result = await db.execute(select(Exam).where(Exam.id.in_(exam_ids)))
            exams = {e.id: e for e in exams_result.scalars().all()}

        for mark in marks:
            student = students.get(mark.student_id)
            if not student:
                continue

            if teacher_id and student.school_class_id not in teacher_assignments:
                continue
            
            if mark.score < 0: mark.score = 0
            if mark.max_score and mark.score > mark.max_score:
                mark.score = mark.max_score
                
            filter_conditions = [
                Mark.student_id == mark.student_id,
                Mark.institution_id == institution_id
            ]

            if mark.exam_id:
                exam = exams.get(mark.exam_id)
                if exam and not mark.subject:
                    mark.subject = exam.name
                filter_conditions.append(Mark.exam_id == mark.exam_id)
            else:
                filter_conditions.append(Mark.test_name == mark.test_name)
                filter_conditions.append(Mark.subject == mark.subject)

            ex_result = await db.execute(select(Mark).where(*filter_conditions))
            existing = ex_result.scalars().first()

            if existing:
                existing.score = mark.score
                if mark.max_score:
                    existing.max_score = mark.max_score
                if mark.exam_id: existing.exam_id = mark.exam_id
            else:
                existing = Mark(**mark.model_dump(), institution_id=institution_id)
                db.add(existing)
            results.append(existing)
        
        await db.commit()
        
        # Optimized: Final fetch with all relationships for the batch
        # We use a map to ensure we return them in the EXACT same order as the input
        final_ids = [r.id for r in results if r.id]
        if final_ids:
            from app.models.academic import SchoolClass
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
            # Reconstruct list in original order
            return [fetched_marks[r.id] for r in results if r.id in fetched_marks]
        return []
        
    @staticmethod
    async def get_marks(db: AsyncSession, institution_id: int, student_id: int):
        result = await db.execute(
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
        """
        # Build flexible query for both legacy and exam-based marks
        stmt = select(Mark).where(Mark.institution_id == institution_id)
        
        if exam_id is not None:
            stmt = stmt.where(Mark.exam_id == exam_id)
        elif subject is not None and test_name is not None:
            stmt = stmt.where(
                Mark.subject == subject,
                Mark.test_name == test_name
            )
        else:
            return {"status": "error", "detail": "Either exam_id OR (subject + test_name) required"}
        
        if student_ids:
            stmt = stmt.where(Mark.student_id.in_(student_ids))
        
        result = await db.execute(stmt)
        marks = result.scalars().all()
        count = len(marks)
        for mark in marks:
            await db.delete(mark)
        await db.commit()
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

marks_service = MarksService()
