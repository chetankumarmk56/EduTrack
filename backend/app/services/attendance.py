from sqlalchemy.orm import Session
from typing import List
from app.models import Attendance, Student
from app.schemas import attendance as schemas

class AttendanceService:
    @staticmethod
    def mark_attendance(db: Session, institution_id: int, att: schemas.AttendanceCreate, teacher_user_id: int = None) -> Attendance:
        # Validate student belongs to institution
        student = db.query(Student).filter(
            Student.id == att.student_id, 
            Student.institution_id == institution_id
        ).first()
        if not student:
            return None

        # STRICT ACCESS CONTROL
        if teacher_user_id:
            from app.models.directory import Teacher, TeacherAssignment
            teacher = db.query(Teacher).filter(Teacher.user_id == teacher_user_id).first()
            if not teacher: return None
            
            assignment = db.query(TeacherAssignment).filter(
                TeacherAssignment.teacher_id == teacher.id,
                TeacherAssignment.school_class_id == student.school_class_id
            ).first()
            if not assignment:
                return None

        existing = db.query(Attendance).filter(
            Attendance.student_id == att.student_id,
            Attendance.subject == att.subject,
            Attendance.date == att.date,
            Attendance.institution_id == institution_id
        ).first()
        
        if existing:
            existing.status = att.status
            db.commit()
            db.refresh(existing)
            return existing
        else:
            db_att = Attendance(**att.model_dump(), institution_id=institution_id)
            db.add(db_att)
            db.commit()
            db.refresh(db_att)
            return db_att

    @staticmethod
    def mark_attendance_batch(db: Session, institution_id: int, batch: schemas.AttendanceBatch, teacher_user_id: int = None):
        results = []
        
        # STRICT ACCESS CONTROL: Verify assignment for the class in batch
        if teacher_user_id:
            from app.models.directory import Teacher, TeacherAssignment
            teacher = db.query(Teacher).filter(Teacher.user_id == teacher_user_id).first()
            if not teacher:
                return []
            
            assignment = db.query(TeacherAssignment).filter(
                TeacherAssignment.teacher_id == teacher.id,
                TeacherAssignment.school_class_id == batch.school_class_id
            ).first()
            if not assignment:
                 return []

        for item in batch.records:
            # Validate student belongs to institution and the specified class
            student = db.query(Student).filter(
                Student.id == item.student_id, 
                Student.institution_id == institution_id,
                Student.school_class_id == batch.school_class_id
            ).first()
            if not student:
                continue
                
            existing = db.query(Attendance).filter(
                Attendance.student_id == item.student_id,
                Attendance.subject == batch.subject,
                Attendance.date == batch.date,
                Attendance.institution_id == institution_id
            ).first()
            
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
        
        db.commit()
        for r in results:
            db.refresh(r)
        return results
            
    @staticmethod
    def get_attendance(db: Session, institution_id: int, student_id: int, subject: str = None):
        query = db.query(Attendance).filter(
            Attendance.student_id == student_id,
            Attendance.institution_id == institution_id
        )
        if subject:
             query = query.filter(Attendance.subject == subject)
        return query.all()

    @staticmethod
    def get_class_attendance(db: Session, institution_id: int, school_class_id: int, date: str, subject: str = None):
        query = db.query(Attendance).filter(
            Attendance.school_class_id == school_class_id,
            Attendance.date == date,
            Attendance.institution_id == institution_id
        )
        if subject:
            query = query.filter(Attendance.subject == subject)
        return query.all()
