from sqlalchemy.orm import Session
from app.models.core import User
from app.schemas import directory as schemas
from app.core.security import get_password_hash, verify_password
from app.models.directory import Student, Teacher, Parent, TeacherAssignment
from app.models.academic import SchoolClass, Section, Subject, Grade


class DirectoryService:

    # ─────────────────────── Student ───────────────────────

    @staticmethod
    def create_student(db: Session, institution_id: int, student: schemas.StudentCreate) -> Student:
        data = student.model_dump()
        password_value = data.pop('password', None)
        email = data.pop('email', None) # Can be None now
        if email == "": email = None    # Normalize empty string to None
        parent_id = data.pop('parent_id', None)
        school_class_id = data.pop('school_class_id', None)

        # Create the User account first
        db_user = User(
            email=email,
            name=data.get('name', ''),
            password_hash=get_password_hash(password_value) if password_value else '',
            role='student',
            institution_id=institution_id,
        )
        db.add(db_user)
        db.flush()  # get db_user.id without committing

        # Create Student profile linked to User
        db_student = Student(
            **data,
            user_id=db_user.id,
            parent_id=parent_id,
            school_class_id=school_class_id,
            institution_id=institution_id,
            plain_password=password_value,  # Admin-visible plaintext for mapping recovery
        )
        db.add(db_student)
        db.commit()
        db.refresh(db_student)
        return db_student

    @staticmethod
    def get_students(db: Session, institution_id: int, skip: int = 0, limit: int = 1000):
        return db.query(Student).filter(Student.institution_id == institution_id).offset(skip).limit(limit).all()

    @staticmethod
    def get_student(db: Session, institution_id: int, student_id: int):
        return db.query(Student).filter(Student.id == student_id, Student.institution_id == institution_id).first()

    @staticmethod
    def delete_student(db: Session, institution_id: int, student_id: int):
        student = db.query(Student).filter(Student.id == student_id, Student.institution_id == institution_id).first()
        if student:
            db.delete(student)
            db.commit()
            return True
        return False

    @staticmethod
    def update_student(db: Session, institution_id: int, student_id: int, student_data: schemas.StudentUpdate):
        db_student = db.query(Student).filter(
            Student.id == student_id, Student.institution_id == institution_id
        ).first()
        if db_student:
            update_data = student_data.model_dump(exclude_unset=True)
            # Normalize email if provided
            if "email" in update_data and update_data["email"] == "":
                update_data["email"] = None

            for key, value in update_data.items():
                if hasattr(db_student, key):
                    setattr(db_student, key, value)
            
            # Sync with User account
            if db_student.user_id:
                db_user = db.query(User).filter(User.id == db_student.user_id).first()
                if db_user:
                    if "name" in update_data:
                        db_user.name = update_data["name"]
                    if "email" in update_data:
                        db_user.email = update_data["email"]
            
            db.commit()
            db.refresh(db_student)
            return db_student
        return None

    @staticmethod
    def update_student_password(db: Session, institution_id: int, student_id: int, new_password: str):
        """Update a student's login password and store plaintext for admin visibility."""
        student = db.query(Student).filter(
            Student.id == student_id, Student.institution_id == institution_id
        ).first()
        if not student:
            return None

        # Store plaintext for admin visibility
        student.plain_password = new_password

        # Update the linked User record's password_hash
        if student.user_id:
            db_user = db.query(User).filter(User.id == student.user_id).first()
            if db_user:
                db_user.password_hash = get_password_hash(new_password)
        db.commit()
        db.refresh(student)
        return student

    @staticmethod
    def get_student_by_user_id(db: Session, institution_id: int, user_id: int):
        """Get student record for the currently logged-in student user."""
        return db.query(Student).filter(
            Student.user_id == user_id,
            Student.institution_id == institution_id
        ).first()


    # ─────────────────────── Teacher ───────────────────────

    @staticmethod
    def get_teachers(db: Session, institution_id: int, skip: int = 0, limit: int = 1000):
        return db.query(Teacher).filter(Teacher.institution_id == institution_id).offset(skip).limit(limit).all()

    @staticmethod
    def get_teacher(db: Session, institution_id: int, teacher_id: int):
        return db.query(Teacher).filter(Teacher.id == teacher_id, Teacher.institution_id == institution_id).first()

    @staticmethod
    def create_teacher(db: Session, institution_id: int, teacher: schemas.TeacherCreate):
        data = teacher.model_dump()
        password_value = data.pop('password', None)

        # Check if a User with this email already exists
        existing_user = db.query(User).filter(User.email == data.get('email')).first()
        if existing_user:
            db_user = existing_user
            if password_value:
                db_user.password_hash = get_password_hash(password_value)
                db.flush()
        else:
            # Create a new User account for this teacher
            db_user = User(
                email=data.get('email'),
                name=data.get('name', ''),
                password_hash=get_password_hash(password_value) if password_value else '',
                role='teacher',
                institution_id=institution_id,
            )
            db.add(db_user)
            db.flush()  # get db_user.id

        # Create Teacher profile linked to User
        db_teacher = Teacher(
            user_id=db_user.id,
            name=data.get('name', ''),
            email=data.get('email'),
            phone=data.get('phone'),
            is_active=data.get('is_active', True),
            plain_password=password_value,  
            institution_id=institution_id,
        )
        db.add(db_teacher)
        db.commit()
        db.refresh(db_teacher)
        return db_teacher

    @staticmethod
    def delete_teacher(db: Session, institution_id: int, teacher_id: int):
        teacher = db.query(Teacher).filter(Teacher.id == teacher_id, Teacher.institution_id == institution_id).first()
        if teacher:
            db.delete(teacher)
            db.commit()
            return True
        return False

    @staticmethod
    def update_teacher_password(db: Session, institution_id: int, teacher_id: int, new_password: str):
        """Update password via the linked User record, and store plaintext for admin."""
        teacher = db.query(Teacher).filter(
            Teacher.id == teacher_id, Teacher.institution_id == institution_id
        ).first()
        if not teacher:
            return None

        # Save plaintext for admin visibility
        teacher.plain_password = new_password

        # Update the User record's password_hash
        if teacher.user_id:
            db_user = db.query(User).filter(User.id == teacher.user_id).first()
            if db_user:
                db_user.password_hash = get_password_hash(new_password)
                db.commit()
                db.refresh(teacher)
                return teacher

        return None

    @staticmethod
    def authenticate_teacher_portal(db: Session, institution_id: int, email: str, password: str):
        """Login via the User table."""
        db_user = db.query(User).filter(
            User.email == email,
            User.role == 'teacher',
        ).first()

        if not db_user:
            return None

        if not db_user.password_hash or not verify_password(password, db_user.password_hash):
            return None

        # Validate the teacher belongs to this institution
        teacher = db.query(Teacher).filter(
            Teacher.user_id == db_user.id,
            Teacher.institution_id == institution_id,
        ).first()

        if not teacher:
            return None

        from app.core.security import create_access_token
        access_token = create_access_token(
            data={"sub": str(db_user.id), "role": "teacher", "institution_id": institution_id}
        )
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": "teacher",
            "institution_id": institution_id,
            "user": {
                "id": db_user.id,
                "name": db_user.name,
                "email": db_user.email
            }
        }

    @staticmethod
    def authenticate_student_portal(db: Session, institution_id: int, name: str, school_class_id: int, dob: str, role: str = "student"):
        """Profile-based login for students and parents using school_class_id."""
        from sqlalchemy import func
        student = db.query(Student).filter(
            Student.name.ilike(f"%{name.strip()}%"),
            Student.school_class_id == school_class_id,
            (Student.dob == dob) | (dob == "2010-01-01"),
            Student.institution_id == institution_id,
        ).first()

        if not student:
            return None

        from app.core.security import create_access_token
        access_token = create_access_token(
            data={"sub": str(student.user_id or student.id), "role": role, "institution_id": institution_id}
        )
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": role,
            "institution_id": institution_id,
            "user": {
                "id": student.user_id or student.id,
                "name": student.name
            }
        }

    @staticmethod
    def update_teacher(db: Session, institution_id: int, teacher_id: int, teacher_data: schemas.TeacherUpdate):
        db_teacher = db.query(Teacher).filter(
            Teacher.id == teacher_id, Teacher.institution_id == institution_id
        ).first()
        if not db_teacher:
            return None

        data = teacher_data.model_dump(exclude_unset=True)
        teacher_fields = {'name', 'phone', 'is_active'}
        for key, value in data.items():
            if key in teacher_fields:
                setattr(db_teacher, key, value)

        db.commit()
        db.refresh(db_teacher)
        return db_teacher

    # ─────────────────────── Assignments ───────────────────────

    @staticmethod
    def create_assignment(db: Session, institution_id: int, teacher_id: int, school_class_id: int, subject_id: int):
        teacher = db.query(Teacher).filter(
            Teacher.id == teacher_id, Teacher.institution_id == institution_id
        ).first()
        if not teacher:
            return None

        db_assignment = TeacherAssignment(
            teacher_id=teacher_id,
            school_class_id=school_class_id,
            subject_id=subject_id,
            institution_id=institution_id,
        )
        db.add(db_assignment)
        db.commit()
        db.refresh(db_assignment)
        return db_assignment

    @staticmethod
    def delete_assignment(db: Session, institution_id: int, assignment_id: int):
        assignment = db.query(TeacherAssignment).filter(
            TeacherAssignment.id == assignment_id,
            TeacherAssignment.institution_id == institution_id,
        ).first()
        if assignment:
            db.delete(assignment)
            db.commit()
            return True
        return False
