from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
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
        Optimized async calculation of teacher metrics.
        Reduces query count from N+1 to O(1) using aggregations.
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

        # Get unique class_ids for the teacher
        assign_stmt = select(TeacherAssignment.school_class_id, TeacherAssignment.subject_id).where(
            TeacherAssignment.teacher_id == teacher.id
        )
        assign_res = await db.execute(assign_stmt)
        assignments = assign_res.all()
        class_ids = list(set([a.school_class_id for a in assignments]))

        if not class_ids:
            return {
                "total_students": 0,
                "active_classes": 0,
                "attendance_rate": 0,
                "pending_marks": 0
            }

        # 1. Total Unique Students
        student_count_stmt = select(func.count(Student.id)).where(
            Student.school_class_id.in_(class_ids),
            Student.institution_id == institution_id
        )
        count_res = await db.execute(student_count_stmt)
        total_students = count_res.scalar_one()

        # 2. Active Classes
        active_classes = len(class_ids)

        # 3. Today's Attendance Rate (Optimized Aggregation)
        today_str = date.today().isoformat()
        from sqlalchemy import case
        att_stmt = select(
            func.count(Attendance.id).label("total"),
            func.sum(case((Attendance.status == 'Present', 1), else_=0)).label("present")
        ).where(
            Attendance.school_class_id.in_(class_ids),
            Attendance.date == today_str
        )
        att_res = await db.execute(att_stmt)
        att_totals = att_res.first()
        
        attendance_rate = 0.0
        if att_totals and att_totals.total and att_totals.total > 0:
            attendance_rate = (att_totals.present / att_totals.total) * 100

        # 4. Pending Evaluations (Optimized to avoid N+1)
        pending_marks = 0
        # Identify the latest exam for each assignment
        exams_stmt = select(Exam).where(
            and_(
                Exam.school_class_id.in_(class_ids),
                Exam.institution_id == institution_id
            )
        ).order_by(Exam.school_class_id, Exam.subject_id, Exam.id.desc())
        
        exams_res = await db.execute(exams_stmt)
        all_exams = exams_res.scalars().all()
        
        # Map (class_id, subject_id) -> latest_exam
        latest_exams = {}
        for exam in all_exams:
            key = (exam.school_class_id, exam.subject_id)
            if key not in latest_exams:
                latest_exams[key] = exam
        
        if latest_exams:
            latest_exam_ids = [e.id for e in latest_exams.values()]
            
            # Fetch student counts per class in one go
            student_per_class_stmt = select(
                Student.school_class_id, 
                func.count(Student.id)
            ).where(Student.school_class_id.in_(class_ids)).group_by(Student.school_class_id)
            student_counts_res = await db.execute(student_per_class_stmt)
            class_student_counts = {row[0]: row[1] for row in student_counts_res.all()}
            
            # Fetch marked counts per exam in one go
            marks_stmt = select(
                Mark.exam_id, 
                func.count(Mark.id)
            ).where(Mark.exam_id.in_(latest_exam_ids)).group_by(Mark.exam_id)
            marks_res = await db.execute(marks_stmt)
            exam_mark_counts = {row[0]: row[1] for row in marks_res.all()}
            
            for (cid, sid), exam in latest_exams.items():
                total_expected = class_student_counts.get(cid, 0)
                total_marked = exam_mark_counts.get(exam.id, 0)
                pending_marks += max(0, total_expected - total_marked)

        return {
            "total_students": total_students,
            "active_classes": active_classes,
            "attendance_rate": round(attendance_rate, 1),
            "pending_marks": pending_marks
        }
