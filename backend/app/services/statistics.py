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

        # 4. Pending Evaluations (Optimized Batch Calculation)
        pending_marks = 0
        if assignments:
            # Get latest exams for all assignments
            # Note: This finds the max ID per (class, subject) pair
            latest_exams_stmt = select(
                Exam.school_class_id, 
                Exam.subject_id, 
                func.max(Exam.id).label('latest_exam_id')
            ).where(
                Exam.school_class_id.in_(class_ids)
            ).group_by(Exam.school_class_id, Exam.subject_id)
            
            e_res = await db.execute(latest_exams_stmt)
            latest_exam_map = {(row[0], row[1]): row[2] for row in e_res.all()}
            
            if latest_exam_map:
                # Count students per class
                student_counts_stmt = select(
                    Student.school_class_id, 
                    func.count(Student.id)
                ).where(
                    Student.school_class_id.in_(class_ids)
                ).group_by(Student.school_class_id)
                
                s_res = await db.execute(student_counts_stmt)
                class_student_counts = {row[0]: row[1] for row in s_res.all()}
                
                # Count marks per exam
                exam_ids = list(latest_exam_map.values())
                marks_counts_stmt = select(
                    Mark.exam_id, 
                    func.count(Mark.id)
                ).where(
                    Mark.exam_id.in_(exam_ids)
                ).group_by(Mark.exam_id)
                
                m_res = await db.execute(marks_counts_stmt)
                exam_marks_counts = {row[0]: row[1] for row in m_res.all()}
                
                # Aggregate pending counts
                for assignment in assignments:
                    exam_id = latest_exam_map.get((assignment.school_class_id, assignment.subject_id))
                    if exam_id:
                        total_s = class_student_counts.get(assignment.school_class_id, 0)
                        marked_s = exam_marks_counts.get(exam_id, 0)
                        pending_marks += max(0, total_s - marked_s)

        return {
            "total_students": total_students,
            "active_classes": active_classes,
            "attendance_rate": round(attendance_rate, 1),
            "pending_marks": pending_marks
        }
