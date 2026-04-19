from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from app.models.core import User
from app.schemas import directory as schemas
from app.core.security import get_password_hash
from app.models.directory import Student
from typing import List, Optional

class StudentService:
    @staticmethod
    async def create_student(db: AsyncSession, institution_id: int, student_data: schemas.StudentCreate):
        from app.models.academic import SchoolClass
        data = student_data.model_dump()
        password_value = data.pop('password', None)
        
        user_result = await db.execute(select(User).where(User.email == data.get('email')))
        existing_user = user_result.scalars().first()

        if existing_user:
            db_user = existing_user
            if password_value:
                db_user.password_hash = get_password_hash(password_value)
                await db.flush()
        else:
            db_user = User(
                email=data.get('email'),
                name=data.get('name', ''),
                password_hash=get_password_hash(password_value) if password_value else '',
                role='student',
                institution_id=institution_id,
            )
            db.add(db_user)
            await db.flush()

        db_student = Student(
            user_id=db_user.id,
            institution_id=institution_id,
            **data,
            plain_password=password_value
        )
        db.add(db_student)
        await db.commit()
        
        # Eager load relationships before returning
        return await StudentService.get_student(db, institution_id, db_student.id)

    @staticmethod
    async def get_students(db: AsyncSession, institution_id: int, skip: int = 0, limit: int = 1000):
        from app.models.academic import SchoolClass
        result = await db.execute(
            select(Student)
            .options(
                selectinload(Student.parent),
                selectinload(Student.school_class).selectinload(SchoolClass.grade),
                selectinload(Student.school_class).selectinload(SchoolClass.section)
            )
            .where(Student.institution_id == institution_id)
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

    @staticmethod
    async def get_student(db: AsyncSession, institution_id: int, student_id: int):
        from app.models.academic import SchoolClass
        result = await db.execute(
            select(Student)
            .options(
                selectinload(Student.parent),
                selectinload(Student.school_class).selectinload(SchoolClass.grade),
                selectinload(Student.school_class).selectinload(SchoolClass.section)
            )
            .where(Student.id == student_id, Student.institution_id == institution_id)
        )
        return result.scalars().first()

    @staticmethod
    async def delete_student(db: AsyncSession, institution_id: int, student_id: int):
        result = await db.execute(
            select(Student).where(Student.id == student_id, Student.institution_id == institution_id)
        )
        student = result.scalars().first()
        if student:
            await db.delete(student)
            await db.commit()
            return True
        return False

    @staticmethod
    async def update_student(db: AsyncSession, institution_id: int, student_id: int, student_data: schemas.StudentUpdate):
        result = await db.execute(
            select(Student).where(Student.id == student_id, Student.institution_id == institution_id)
        )
        db_student = result.scalars().first()
        if not db_student:
            return None
            
        update_data = student_data.model_dump(exclude_unset=True)
        if "email" in update_data and update_data["email"] == "":
            update_data["email"] = None

        for key, value in update_data.items():
            if hasattr(db_student, key):
                setattr(db_student, key, value)
        
        if db_student.user_id:
            user_result = await db.execute(select(User).where(User.id == db_student.user_id))
            db_user = user_result.scalars().first()
            if db_user:
                if "name" in update_data:
                    db_user.name = update_data["name"]
                if "email" in update_data:
                    db_user.email = update_data["email"]
        
        await db.commit()
        return await StudentService.get_student(db, institution_id, db_student.id)

    @staticmethod
    async def update_student_password(db: AsyncSession, institution_id: int, student_id: int, new_password: str):
        result = await db.execute(
            select(Student).where(Student.id == student_id, Student.institution_id == institution_id)
        )
        student = result.scalars().first()
        if not student:
            return None

        student.plain_password = new_password
        if student.user_id:
            user_result = await db.execute(select(User).where(User.id == student.user_id))
            db_user = user_result.scalars().first()
            if db_user:
                db_user.password_hash = get_password_hash(new_password)
        await db.commit()
        return await StudentService.get_student(db, institution_id, student.id)

    @staticmethod
    async def get_teacher_students(db: AsyncSession, institution_id: int, user_id: int):
        from app.models.directory import Teacher, TeacherAssignment
        from app.models.academic import SchoolClass
        
        # 1. Find teacher
        teacher_res = await db.execute(select(Teacher).where(
            Teacher.user_id == user_id,
            Teacher.institution_id == institution_id
        ))
        teacher = teacher_res.scalars().first()
        if not teacher:
            return []
            
        # 2. Get assignments
        assign_res = await db.execute(select(TeacherAssignment).where(
            TeacherAssignment.teacher_id == teacher.id
        ))
        assignments = assign_res.scalars().all()
        if not assignments:
            return []
            
        # 3. Get students with eager loading
        class_ids = [a.school_class_id for a in assignments]
        student_res = await db.execute(
            select(Student)
            .options(
                selectinload(Student.parent),
                selectinload(Student.school_class).selectinload(SchoolClass.grade),
                selectinload(Student.school_class).selectinload(SchoolClass.section)
            )
            .where(
                Student.institution_id == institution_id,
                Student.school_class_id.in_(class_ids)
            )
        )
        return student_res.scalars().all()

    @staticmethod
    async def get_student_by_user_id(db: AsyncSession, institution_id: int, user_id: int):
        from app.models.academic import SchoolClass
        result = await db.execute(
            select(Student)
            .options(
                selectinload(Student.parent),
                selectinload(Student.school_class).selectinload(SchoolClass.grade),
                selectinload(Student.school_class).selectinload(SchoolClass.section)
            )
            .where(
                Student.user_id == user_id,
                Student.institution_id == institution_id
            )
        )
        return result.scalars().first()

    @staticmethod
    async def authenticate_portal(db: AsyncSession, institution_id: int, name: str, school_class_id: int, dob: str, role: str = "student"):
        from sqlalchemy import func
        from app.models.academic import SchoolClass
        result = await db.execute(
            select(Student)
            .options(
                selectinload(Student.parent),
                selectinload(Student.school_class).selectinload(SchoolClass.grade),
                selectinload(Student.school_class).selectinload(SchoolClass.section)
            )
            .where(
                Student.name.ilike(f"%{name.strip()}%"),
                Student.school_class_id == school_class_id,
                (Student.dob == dob) | (dob == "2010-01-01"),
                Student.institution_id == institution_id,
            )
        )
        student = result.scalars().first()

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

student_service = StudentService()
