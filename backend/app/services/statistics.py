from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from typing import Dict, Any

from app.models.directory import Teacher, TeacherAssignment, Student
from app.models.academic import SchoolClass
from app.models.mark import Mark, Exam
from app.models.attendance import Attendance

class StatisticsService:
    @staticmethod
    def get_teacher_stats(db: Session, institution_id: int, user_id: int) -> Dict[str, Any]:
        """
        Calculates real-time metrics for a specific teacher's dashboard.
        """
        # Resolve Teacher
        teacher = db.query(Teacher).filter(
            Teacher.user_id == user_id,
            Teacher.institution_id == institution_id
        ).first()
        
        if not teacher:
            return {
                "total_students": 0,
                "active_classes": 0,
                "attendance_rate": 0,
                "pending_marks": 0
            }

        # Get Assignments
        assignments = db.query(TeacherAssignment).filter(
            TeacherAssignment.teacher_id == teacher.id
        ).all()
        
        class_ids = list(set([a.school_class_id for a in assignments]))
        subject_names = list(set([a.subject_ref.name for a in assignments]))

        # 1. Total Unique Students
        total_students = db.query(Student).filter(
            Student.school_class_id.in_(class_ids) if class_ids else False,
            Student.institution_id == institution_id
        ).count()

        # 2. Active Classes
        active_classes = len(class_ids)

        # 3. Today's Attendance Rate
        today_str = date.today().isoformat()
        attendance_records = db.query(Attendance).filter(
            Attendance.school_class_id.in_(class_ids) if class_ids else False,
            Attendance.date == today_str
        ).all()
        
        present_count = sum(1 for r in attendance_records if r.status == 'Present')
        attendance_rate = (present_count / len(attendance_records) * 100) if attendance_records else 0

        # 4. Pending Evaluations
        # We define "pending" as student-subject pairs that have an active Exam record but no Mark record yet.
        # For simplicity, we'll look at the latest exam for each assignment.
        pending_marks = 0
        for assignment in assignments:
            # Find the most recent exam for this class/subject
            latest_exam = db.query(Exam).filter(
                Exam.school_class_id == assignment.school_class_id,
                Exam.subject_id == assignment.subject_id
            ).order_by(Exam.id.desc()).first()
            
            if latest_exam:
                # Count students in this class who DON'T have a mark for this exam
                class_students_ids = db.query(Student.id).filter(
                    Student.school_class_id == assignment.school_class_id
                ).all()
                student_ids = [s[0] for s in class_students_ids]
                
                marked_students_count = db.query(Mark).filter(
                    Mark.exam_id == latest_exam.id,
                    Mark.student_id.in_(student_ids) if student_ids else False
                ).count()
                
                pending_marks += max(0, len(student_ids) - marked_students_count)

        return {
            "total_students": total_students,
            "active_classes": active_classes,
            "attendance_rate": round(attendance_rate, 1),
            "pending_marks": pending_marks
        }
