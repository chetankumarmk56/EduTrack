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
            await db.refresh(db_mark)
            return db_mark
            
    @staticmethod
    async def record_marks_batch(db: AsyncSession, institution_id: int, marks: List[schemas.MarkCreate], teacher_user_id: int = None):
        teacher_id = None
        if teacher_user_id:
            t_result = await db.execute(select(Teacher).where(Teacher.user_id == teacher_user_id))
            t = t_result.scalars().first()
            teacher_id = t.id if t else None

        results = []
        for mark in marks:
            s_result = await db.execute(select(Student).where(
                Student.id == mark.student_id, 
                Student.institution_id == institution_id
            ))
            student = s_result.scalars().first()
            if not student:
                continue

            if teacher_id:
                assign_result = await db.execute(select(TeacherAssignment).where(
                    TeacherAssignment.teacher_id == teacher_id,
                    TeacherAssignment.school_class_id == student.school_class_id
                ))
                if not assign_result.scalars().first():
                    continue
            
            if mark.score < 0: mark.score = 0
            if mark.max_score and mark.score > mark.max_score:
                mark.score = mark.max_score
                
            filter_conditions = [
                Mark.student_id == mark.student_id,
                Mark.institution_id == institution_id
            ]

            if mark.exam_id:
                e_result = await db.execute(select(Exam).where(Exam.id == mark.exam_id))
                exam = e_result.scalars().first()
                if exam:
                    if not mark.subject and exam.subject_id: # join logic is cleaner
                         # mark.subject is currently a string in schema, but we should match
                         pass
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
        for r in results:
            await db.refresh(r)
        return results
        
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
    async def delete_test(db: AsyncSession, institution_id: int, subject: str, test_name: str, student_ids: List[int] = None):
        stmt = select(Mark).where(
            Mark.subject == subject,
            Mark.test_name == test_name,
            Mark.institution_id == institution_id
        )
        if student_ids:
            stmt = stmt.where(Mark.student_id.in_(student_ids))
        
        result = await db.execute(stmt)
        marks = result.scalars().all()
        count = len(marks)
        for mark in marks:
            await db.delete(mark)
        await db.commit()
        return {"status": "success", "deleted_records": count}

marks_service = MarksService()
