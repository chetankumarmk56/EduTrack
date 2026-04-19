from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List
from app.models import Attendance, Student
from app.schemas import attendance as schemas
from app.models.directory import Teacher, TeacherAssignment

class AttendanceService:
    @staticmethod
    async def mark_attendance(db: AsyncSession, institution_id: int, att: schemas.AttendanceCreate, teacher_user_id: int = None) -> Attendance:
        result = await db.execute(select(Student).where(
            Student.id == att.student_id, 
            Student.institution_id == institution_id
        ))
        student = result.scalars().first()
        if not student:
            return None

        if teacher_user_id:
            t_result = await db.execute(select(Teacher).where(Teacher.user_id == teacher_user_id))
            teacher = t_result.scalars().first()
            if not teacher: return None
            
            assign_result = await db.execute(select(TeacherAssignment).where(
                TeacherAssignment.teacher_id == teacher.id,
                TeacherAssignment.school_class_id == student.school_class_id
            ))
            if not assign_result.scalars().first():
                return None

        ex_result = await db.execute(select(Attendance).where(
            Attendance.student_id == att.student_id,
            Attendance.subject == att.subject,
            Attendance.date == att.date,
            Attendance.institution_id == institution_id
        ))
        existing = ex_result.scalars().first()
        
        if existing:
            existing.status = att.status
            await db.commit()
            await db.refresh(existing)
            return existing
        else:
            db_att = Attendance(**att.model_dump(), institution_id=institution_id)
            db.add(db_att)
            await db.commit()
            await db.refresh(db_att)
            return db_att

    @staticmethod
    async def mark_attendance_batch(db: AsyncSession, institution_id: int, batch: schemas.AttendanceBatch, teacher_user_id: int = None):
        if teacher_user_id:
            t_result = await db.execute(select(Teacher).where(Teacher.user_id == teacher_user_id))
            teacher = t_result.scalars().first()
            if not teacher:
                return []
            
            assign_result = await db.execute(select(TeacherAssignment).where(
                TeacherAssignment.teacher_id == teacher.id,
                TeacherAssignment.school_class_id == batch.school_class_id
            ))
            if not assign_result.scalars().first():
                 return []

        results = []
        for item in batch.records:
            s_result = await db.execute(select(Student).where(
                Student.id == item.student_id, 
                Student.institution_id == institution_id,
                Student.school_class_id == batch.school_class_id
            ))
            student = s_result.scalars().first()
            if not student:
                continue
                
            ex_result = await db.execute(select(Attendance).where(
                Attendance.student_id == item.student_id,
                Attendance.subject == batch.subject,
                Attendance.date == batch.date,
                Attendance.institution_id == institution_id
            ))
            existing = ex_result.scalars().first()
            
            if existing:
                existing.status = item.status
                existing.school_class_id = batch.school_class_id
                if batch.subject_id:
                    existing.subject_id = batch.subject_id
            else:
                db_att = Attendance(
                    student_id=item.student_id,
                    status=item.status,
                    date=batch.date,
                    subject=batch.subject,
                    subject_id=batch.subject_id,
                    school_class_id=batch.school_class_id,
                    institution_id=institution_id
                )
                db.add(db_att)
                existing = db_att
            results.append(existing)
        
        await db.commit()
        for r in results:
            await db.refresh(r)
        return results
            
    @staticmethod
    async def get_attendance(db: AsyncSession, institution_id: int, student_id: int, subject: str = None):
        from app.models.academic import SchoolClass
        stmt = select(Attendance).options(
            selectinload(Attendance.student),
            selectinload(Attendance.school_class).selectinload(SchoolClass.grade),
            selectinload(Attendance.school_class).selectinload(SchoolClass.section),
            selectinload(Attendance.subject_ref)
        ).where(
            Attendance.student_id == student_id,
            Attendance.institution_id == institution_id
        )
        if subject:
             stmt = stmt.where(Attendance.subject == subject)
        result = await db.execute(stmt)
        return result.scalars().all()

    @staticmethod
    async def get_class_attendance(db: AsyncSession, institution_id: int, school_class_id: int, date: str, subject: str = None):
        from app.models.academic import SchoolClass
        stmt = select(Attendance).options(
            selectinload(Attendance.student),
            selectinload(Attendance.school_class).selectinload(SchoolClass.grade),
            selectinload(Attendance.school_class).selectinload(SchoolClass.section),
            selectinload(Attendance.subject_ref)
        ).where(
            Attendance.school_class_id == school_class_id,
            Attendance.date == date,
            Attendance.institution_id == institution_id
        )
        if subject:
            stmt = stmt.where(Attendance.subject == subject)
        result = await db.execute(stmt)
        return result.scalars().all()

attendance_service = AttendanceService()
