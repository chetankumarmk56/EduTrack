from sqlalchemy.orm import Session
from typing import List
from app.models import Mark, Student, Exam
from app.schemas import mark as schemas

class MarksService:
    @staticmethod
    def record_mark(db: Session, institution_id: int, mark: schemas.MarkCreate, teacher_user_id: int = None) -> Mark:
        # Validate student belongs to institution
        student = db.query(Student).filter(
            Student.id == mark.student_id, 
            Student.institution_id == institution_id
        ).first()
        if not student:
            return None

        # STRICT ACCESS CONTROL: Verify teacher assignment
        if teacher_user_id:
            from app.models.directory import Teacher, TeacherAssignment
            teacher = db.query(Teacher).filter(Teacher.user_id == teacher_user_id).first()
            if not teacher:
                return None
            
            assignment = db.query(TeacherAssignment).filter(
                TeacherAssignment.teacher_id == teacher.id,
                TeacherAssignment.school_class_id == student.school_class_id
            ).first()
            if not assignment:
                return None

        # Data Validation
        if mark.score < 0: mark.score = 0
        if mark.max_score and mark.score > mark.max_score:
            mark.score = mark.max_score

        existing = db.query(Mark).filter(
            Mark.student_id == mark.student_id,
            Mark.test_name == mark.test_name,
            Mark.subject == mark.subject,
            Mark.institution_id == institution_id
        ).first()
        
        if existing:
            existing.score = mark.score
            if mark.max_score:
                existing.max_score = mark.max_score
            if mark.exam_id:
                existing.exam_id = mark.exam_id
            db.commit()
            db.refresh(existing)
            return existing
        else:
            db_mark = Mark(**mark.model_dump(), institution_id=institution_id)
            db.add(db_mark)
            db.commit()
            db.refresh(db_mark)
            return db_mark
            
    @staticmethod
    def record_marks_batch(db: Session, institution_id: int, marks: List[schemas.MarkCreate], teacher_user_id: int = None):
        results = []
        # Optimization: cache teacher_id if we have teacher_user_id
        teacher_id = None
        if teacher_user_id:
            from app.models.directory import Teacher
            t = db.query(Teacher).filter(Teacher.user_id == teacher_user_id).first()
            teacher_id = t.id if t else None

        for mark in marks:
            # Validate student belongs to institution
            student = db.query(Student).filter(
                Student.id == mark.student_id, 
                Student.institution_id == institution_id
            ).first()
            if not student:
                continue

            # STRICT ACCESS CONTROL: Verify teacher assignment
            if teacher_id:
                from app.models.directory import TeacherAssignment
                assignment = db.query(TeacherAssignment).filter(
                    TeacherAssignment.teacher_id == teacher_id,
                    TeacherAssignment.school_class_id == student.school_class_id
                ).first()
                if not assignment:
                    continue
            
            # Data Validation
            if mark.score < 0: mark.score = 0
            if mark.max_score and mark.score > mark.max_score:
                mark.score = mark.max_score
                
            # Improved Relational Filter: Prioritize exam_id if available
            filter_args = [
                Mark.student_id == mark.student_id,
                Mark.institution_id == institution_id
            ]

            # resolve subject/test_name from Exam if available for consistency
            if mark.exam_id:
                exam = db.query(Exam).filter(Exam.id == mark.exam_id).first()
                if exam:
                    if not mark.subject and exam.subject_ref:
                        mark.subject = exam.subject_ref.name
                    if not mark.test_name:
                        mark.test_name = exam.name
                filter_args.append(Mark.exam_id == mark.exam_id)
            else:
                filter_args.append(Mark.test_name == mark.test_name)
                filter_args.append(Mark.subject == mark.subject)

            existing = db.query(Mark).filter(*filter_args).first()

            if existing:
                existing.score = mark.score
                if mark.max_score:
                    existing.max_score = mark.max_score
                # Ensure fields are synced
                if mark.exam_id: existing.exam_id = mark.exam_id
                if mark.subject: existing.subject = mark.subject
                if mark.test_name: existing.test_name = mark.test_name
            else:
                existing = Mark(**mark.model_dump(), institution_id=institution_id)
                db.add(existing)
            results.append(existing)
        
        db.commit()
        for r in results:
            db.refresh(r)
        return results
        
    @staticmethod
    def get_marks(db: Session, institution_id: int, student_id: int):
        return db.query(Mark).filter(
            Mark.student_id == student_id, 
            Mark.institution_id == institution_id
        ).all()
        
    @staticmethod
    def get_class_marks(db: Session, institution_id: int, subject: str, school_class_id: int = None, exam_id: int = None):
        query = db.query(Mark).join(Student)
        query = query.filter(Mark.institution_id == institution_id)
        
        if exam_id:
            query = query.filter(Mark.exam_id == exam_id)
        else:
            query = query.filter(Mark.subject == subject)
            
        if school_class_id:
            query = query.filter(Student.school_class_id == school_class_id)
        return query.all()
        
    @staticmethod
    def rename_test(db: Session, institution_id: int, subject: str, old_name: str, new_name: str, student_ids: List[int] = None):
        query = db.query(Mark).filter(
            Mark.subject == subject,
            Mark.test_name == old_name,
            Mark.institution_id == institution_id
        )
        if student_ids:
            query = query.filter(Mark.student_id.in_(student_ids))
        marks = query.all()
        for mark in marks:
            mark.test_name = new_name
        db.commit()
        return {"status": "success", "modified_records": len(marks)}
        
    @staticmethod
    def get_exams(db: Session, institution_id: int, school_class_id: int = None, subject_id: int = None):
        """Fetches formal assessment records for a specific class and subject."""
        query = db.query(Exam).filter(Exam.institution_id == institution_id)
        if school_class_id:
            query = query.filter(Exam.school_class_id == school_class_id)
        if subject_id:
            query = query.filter(Exam.subject_id == subject_id)
        return query.all()

    @staticmethod
    def create_exam(db: Session, institution_id: int, exam: schemas.ExamCreate, school_class_id: int = None, subject_id: int = None):
        """Creates a formal assessment record linked to a class and subject."""
        db_exam = Exam(
            **exam.model_dump(), 
            institution_id=institution_id,
            school_class_id=school_class_id,
            subject_id=subject_id
        )
        db.add(db_exam)
        db.commit()
        db.refresh(db_exam)
        return db_exam
        
    @staticmethod
    def delete_test(db: Session, institution_id: int, subject: str, test_name: str, student_ids: List[int] = None):
        query = db.query(Mark).filter(
            Mark.subject == subject,
            Mark.test_name == test_name,
            Mark.institution_id == institution_id
        )
        if student_ids:
            query = query.filter(Mark.student_id.in_(student_ids))
        marks = query.all()
        count = len(marks)
        for mark in marks:
            db.delete(mark)
        db.commit()
        return {"status": "success", "deleted_records": count}
