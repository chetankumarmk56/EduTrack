from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List
from datetime import datetime, date
from fastapi import HTTPException
from app.models import Attendance, Student
from app.schemas import attendance as schemas
from app.models.directory import Teacher, TeacherAssignment

class AttendanceService:
    @staticmethod
    async def mark_attendance(db: AsyncSession, institution_id: int, att: schemas.AttendanceCreate, teacher_user_id: int = None) -> Attendance:
        # ✓ Validate date is not in future
        try:
            att_date = datetime.strptime(att.date, "%Y-%m-%d").date()
            if att_date > date.today():
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot mark attendance for future date: {att.date}. Attendance can only be marked for today or past dates."
                )
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid date format: {att.date}. Expected YYYY-MM-DD."
            )
        
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

        from sqlalchemy import or_
        ex_result = await db.execute(select(Attendance).where(
            Attendance.student_id == att.student_id,
            Attendance.date == att.date,
            Attendance.institution_id == institution_id,
            or_(
                Attendance.subject == att.subject,
                Attendance.subject == None if not att.subject else False,
                Attendance.subject == "" if not att.subject else False
            )
        ).order_by(Attendance.id.desc()))
        existing_list = ex_result.scalars().all()
        
        if existing_list:
            existing = existing_list[0]
            existing.status = att.status
            existing.subject = att.subject # Standardize on current input
            if att.subject_id:
                existing.subject_id = att.subject_id
            
            # Clean up other duplicates if they exist
            if len(existing_list) > 1:
                for dupe in existing_list[1:]:
                    await db.delete(dupe)
                    
            await db.commit()
            await db.refresh(existing)
            return existing
        else:
            db_att = Attendance(**att.model_dump(), institution_id=institution_id)
            db.add(db_att)
            await db.commit()
            
            # Fetch with relationships after commit
            from app.models.academic import SchoolClass
            res = await db.execute(
                select(Attendance)
                .options(
                    selectinload(Attendance.student),
                    selectinload(Attendance.school_class).selectinload(SchoolClass.grade),
                    selectinload(Attendance.school_class).selectinload(SchoolClass.section),
                    selectinload(Attendance.subject_ref)
                )
                .where(Attendance.id == db_att.id)
            )
            return res.scalars().first()

    @staticmethod
    async def mark_attendance_batch(db: AsyncSession, institution_id: int, batch: schemas.AttendanceBatch, teacher_user_id: int = None):
        # ✓ Validate batch date is not in future
        try:
            att_date = datetime.strptime(batch.date, "%Y-%m-%d").date()
            if att_date > date.today():
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot mark attendance for future date: {batch.date}. Attendance can only be marked for today or past dates."
                )
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid date format: {batch.date}. Expected YYYY-MM-DD."
            )
        
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

        # OPTIMIZATION: Bulk-load all students in batch instead of looping (eliminates N+1)
        student_ids = [item.student_id for item in batch.records]
        students_result = await db.execute(select(Student).where(
            Student.id.in_(student_ids),
            Student.institution_id == institution_id,
            Student.school_class_id == batch.school_class_id
        ))
        students = {s.id: s for s in students_result.scalars().all()}
        
        # OPTIMIZATION: Bulk-load existing attendance records
        from sqlalchemy import or_
        existing_result = await db.execute(select(Attendance).where(
            Attendance.student_id.in_(student_ids),
            Attendance.date == batch.date,
            Attendance.institution_id == institution_id,
            or_(
                Attendance.subject == batch.subject,
                Attendance.subject == None if not batch.subject else False,
                Attendance.subject == "" if not batch.subject else False
            )
        ).order_by(Attendance.id.desc()))
        
        existing_att_map = {}
        for a in existing_result.scalars().all():
            if a.student_id not in existing_att_map:
                existing_att_map[a.student_id] = [a]
            else:
                existing_att_map[a.student_id].append(a)

        results = []
        for item in batch.records:
            student = students.get(item.student_id)
            if not student:
                continue
                
            existing_list = existing_att_map.get(item.student_id, [])
            
            if existing_list:
                existing = existing_list[0]
                existing.status = item.status
                existing.school_class_id = batch.school_class_id
                existing.subject = batch.subject # Standardize
                if batch.subject_id:
                    existing.subject_id = batch.subject_id
                
                # Deduplicate on the fly
                if len(existing_list) > 1:
                    for dupe in existing_list[1:]:
                        await db.delete(dupe)
                results.append(existing)
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
        
        # Optimized: Final fetch with all relationships for the batch
        final_ids = [r.id for r in results if r.id]
        if final_ids:
            from app.models.academic import SchoolClass
            res = await db.execute(
                select(Attendance)
                .options(
                    selectinload(Attendance.student),
                    selectinload(Attendance.school_class).selectinload(SchoolClass.grade),
                    selectinload(Attendance.school_class).selectinload(SchoolClass.section),
                    selectinload(Attendance.subject_ref)
                )
                .where(Attendance.id.in_(final_ids))
            )
            return res.scalars().all()
        return []
            
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
