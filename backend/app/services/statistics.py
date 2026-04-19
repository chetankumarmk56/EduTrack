from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import date
from typing import Dict, Any

from app.models.directory import Teacher, TeacherAssignment, Student
from app.models.academic import SchoolClass
from app.models.mark import Mark, Exam
from app.models.attendance import Attendance

class StatisticsService:
    @staticmethod
    async def get_teacher_stats(db: AsyncSession, institution_id: int, user_id: int) -> Dict[str, Any]:
        """
        Calculates real-time metrics for a specific teacher's dashboard (Async).
        """
        # Resolve Teacher
        result = await db.execute(select(Teacher).where(
            Teacher.user_id == user_id,
            Teacher.institution_id == institution_id
        ))
        teacher = result.scalars().first()
        
        if not teacher:
            return {
                "total_students": 0,
                "active_classes": 0,
                "attendance_rate": 0,
                "pending_marks": 0
            }

        # Get Assignments
        assign_result = await db.execute(select(TeacherAssignment).where(
            TeacherAssignment.teacher_id == teacher.id
        ))
        assignments = assign_result.scalars().all()
        
        class_ids = list(set([a.school_class_id for a in assignments]))

        # 1. Total Unique Students
        if class_ids:
            student_count_stmt = select(func.count(Student.id)).where(
                Student.school_class_id.in_(class_ids),
                Student.institution_id == institution_id
            )
            count_res = await db.execute(student_count_stmt)
            total_students = count_res.scalar_one()
        else:
            total_students = 0

        # 2. Active Classes
        active_classes = len(class_ids)

        # 3. Today's Attendance Rate
        today_str = date.today().isoformat()
        if class_ids:
            att_stmt = select(Attendance).where(
                Attendance.school_class_id.in_(class_ids),
                Attendance.date == today_str
            )
            att_res = await db.execute(att_stmt)
            attendance_records = att_res.scalars().all()
            
            present_count = sum(1 for r in attendance_records if r.status == 'Present')
            attendance_rate = (present_count / len(attendance_records) * 100) if attendance_records else 0
        else:
            attendance_rate = 0

        # 4. Pending Evaluations
        # For simplicity, we keep original logic but async.
        pending_marks = 0
        for assignment in assignments:
            latest_exam_stmt = select(Exam).where(
                Exam.school_class_id == assignment.school_class_id,
                Exam.subject_id == assignment.subject_id
            ).order_by(Exam.id.desc()).limit(1)
            e_res = await db.execute(latest_exam_stmt)
            latest_exam = e_res.scalars().first()
            
            if latest_exam:
                s_stmt = select(Student.id).where(
                    Student.school_class_id == assignment.school_class_id
                )
                s_res = await db.execute(s_stmt)
                student_ids = s_res.scalars().all()
                
                if student_ids:
                    m_stmt = select(func.count(Mark.id)).where(
                        Mark.exam_id == latest_exam.id,
                        Mark.student_id.in_(student_ids)
                    )
                    m_res = await db.execute(m_stmt)
                    marked_students_count = m_res.scalar_one()
                    pending_marks += max(0, len(student_ids) - marked_students_count)

        return {
            "total_students": total_students,
            "active_classes": active_classes,
            "attendance_rate": round(attendance_rate, 1),
            "pending_marks": pending_marks
        }
