from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.models.core import User
from app.schemas import directory as schemas
from app.core.security import get_password_hash, verify_password, create_access_token
from app.models.directory import Teacher, TeacherAssignment
from typing import List, Optional

class TeacherService:
    @staticmethod
    async def get_teachers(db: AsyncSession, institution_id: int, skip: int = 0, limit: int = 1000):
        from app.models.academic import SchoolClass
        result = await db.execute(
            select(Teacher)
            .options(
                selectinload(Teacher.assignments).selectinload(TeacherAssignment.school_class).selectinload(SchoolClass.grade),
                selectinload(Teacher.assignments).selectinload(TeacherAssignment.school_class).selectinload(SchoolClass.section),
                selectinload(Teacher.assignments).selectinload(TeacherAssignment.subject_ref)
            )
            .where(Teacher.institution_id == institution_id)
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

    @staticmethod
    async def get_teacher(db: AsyncSession, institution_id: int, teacher_id: int):
        from app.models.academic import SchoolClass
        result = await db.execute(
            select(Teacher)
            .options(
                selectinload(Teacher.assignments).selectinload(TeacherAssignment.school_class).selectinload(SchoolClass.grade),
                selectinload(Teacher.assignments).selectinload(TeacherAssignment.school_class).selectinload(SchoolClass.section),
                selectinload(Teacher.assignments).selectinload(TeacherAssignment.subject_ref)
            )
            .where(Teacher.id == teacher_id, Teacher.institution_id == institution_id)
        )
        return result.scalars().first()

    @staticmethod
    async def get_teacher_by_user_id(db: AsyncSession, institution_id: int, user_id: int):
        from app.models.academic import SchoolClass
        result = await db.execute(
            select(Teacher)
            .options(
                selectinload(Teacher.assignments).selectinload(TeacherAssignment.school_class).selectinload(SchoolClass.grade),
                selectinload(Teacher.assignments).selectinload(TeacherAssignment.school_class).selectinload(SchoolClass.section),
                selectinload(Teacher.assignments).selectinload(TeacherAssignment.subject_ref)
            )
            .where(Teacher.user_id == user_id, Teacher.institution_id == institution_id)
        )
        return result.scalars().first()

    @staticmethod
    async def create_teacher(db: AsyncSession, institution_id: int, teacher: schemas.TeacherCreate):
        data = teacher.model_dump()
        password_value = data.pop('password', None)

        email = data.get('email')
        existing_user = None
        if email:
            user_result = await db.execute(select(User).where(User.email == email))
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
                role='teacher',
                institution_id=institution_id,
            )
            db.add(db_user)
            await db.flush()

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
        await db.commit()
        return await TeacherService.get_teacher(db, institution_id, db_teacher.id)

    @staticmethod
    async def update_teacher(db: AsyncSession, institution_id: int, teacher_id: int, teacher_data: schemas.TeacherUpdate):
        result = await db.execute(
            select(Teacher).where(Teacher.id == teacher_id, Teacher.institution_id == institution_id)
        )
        db_teacher = result.scalars().first()
        if not db_teacher:
            return None

        data = teacher_data.model_dump(exclude_unset=True)
        teacher_fields = {'name', 'phone', 'is_active'}
        for key, value in data.items():
            if key in teacher_fields:
                setattr(db_teacher, key, value)

        await db.commit()
        return await TeacherService.get_teacher(db, institution_id, db_teacher.id)

    @staticmethod
    async def update_teacher_password(db: AsyncSession, institution_id: int, teacher_id: int, new_password: str):
        result = await db.execute(
            select(Teacher).where(Teacher.id == teacher_id, Teacher.institution_id == institution_id)
        )
        teacher = result.scalars().first()
        if not teacher:
            return None

        teacher.plain_password = new_password
        if teacher.user_id:
            user_result = await db.execute(select(User).where(User.id == teacher.user_id))
            db_user = user_result.scalars().first()
            if db_user:
                db_user.password_hash = get_password_hash(new_password)
                await db.commit()
                return await TeacherService.get_teacher(db, institution_id, teacher.id)
        return None

    @staticmethod
    async def delete_teacher(db: AsyncSession, institution_id: int, teacher_id: int):
        from sqlalchemy import delete
        result = await db.execute(
            select(Teacher).where(Teacher.id == teacher_id, Teacher.institution_id == institution_id)
        )
        teacher = result.scalars().first()
        if teacher:
            user_id = teacher.user_id
            
            # 1. Clean up assignments
            await db.execute(delete(TeacherAssignment).where(TeacherAssignment.teacher_id == teacher_id))
            
            # 2. Clean up comms attached to this teacher
            from app.models.communication import Announcement
            await db.execute(delete(Announcement).where(Announcement.teacher_id == teacher_id))

            # 3. Delete teacher profile
            await db.delete(teacher)
            await db.flush()

            # 4. Clean up user credentials and audit trail
            if user_id:
                from app.models.core import AuditLog
                await db.execute(delete(AuditLog).where(AuditLog.user_id == user_id))
                await db.execute(delete(User).where(User.id == user_id))
                
            await db.commit()
            return True
        return False

    @staticmethod
    async def authenticate_portal(db: AsyncSession, institution_id: int, email: str, password: str):
        result = await db.execute(
            select(User).where(
                User.email == email,
                User.role == 'teacher',
            )
        )
        db_user = result.scalars().first()

        if not db_user or not db_user.password_hash or not verify_password(password, db_user.password_hash):
            return None

        t_result = await db.execute(
            select(Teacher).where(
                Teacher.user_id == db_user.id,
                Teacher.institution_id == institution_id,
            )
        )
        teacher = t_result.scalars().first()

        if not teacher:
            return None

        token_payload = {
            "sub": str(db_user.id), 
            "role": "teacher", 
            "institution_id": institution_id,
            "name": db_user.name
        }
        
        from app.core.security import create_refresh_token
        access_token = create_access_token(data=token_payload)
        refresh_token = create_refresh_token(data=token_payload)

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "role": "teacher",
            "institution_id": institution_id,
            "user": {
                "id": db_user.id,
                "name": db_user.name,
                "email": db_user.email
            }
        }

    # ─────────────────────── Assignments ───────────────────────

    @staticmethod
    async def create_assignment(db: AsyncSession, institution_id: int, teacher_id: int, school_class_id: int, subject_id: int):
        t_result = await db.execute(
            select(Teacher).where(Teacher.id == teacher_id, Teacher.institution_id == institution_id)
        )
        teacher = t_result.scalars().first()
        if not teacher:
            return None

        db_assignment = TeacherAssignment(
            teacher_id=teacher_id,
            school_class_id=school_class_id,
            subject_id=subject_id,
            institution_id=institution_id,
        )
        db.add(db_assignment)
        await db.commit()
        # Fetch with eager loading
        from app.models.academic import SchoolClass
        result = await db.execute(
            select(TeacherAssignment)
            .options(
                selectinload(TeacherAssignment.school_class).selectinload(SchoolClass.grade),
                selectinload(TeacherAssignment.school_class).selectinload(SchoolClass.section),
                selectinload(TeacherAssignment.subject_ref)
            )
            .where(TeacherAssignment.id == db_assignment.id)
        )
        return result.scalars().first()

    @staticmethod
    async def delete_assignment(db: AsyncSession, institution_id: int, assignment_id: int):
        result = await db.execute(
            select(TeacherAssignment).where(
                TeacherAssignment.id == assignment_id,
                TeacherAssignment.institution_id == institution_id,
            )
        )
        assignment = result.scalars().first()
        if assignment:
            await db.delete(assignment)
            await db.commit()
            return True
        return False

    @staticmethod
    async def get_student_teachers(db: AsyncSession, institution_id: int, user_id: int):
        from app.models.directory import Student, TeacherAssignment
        from app.models.academic import SchoolClass
        
        # 1. Find student
        student_res = await db.execute(select(Student).where(
            Student.user_id == user_id,
            Student.institution_id == institution_id
        ))
        student = student_res.scalars().first()
        if not student or not student.school_class_id:
            return []
            
        # 2. Get assignments
        assign_res = await db.execute(select(TeacherAssignment).where(
            TeacherAssignment.school_class_id == student.school_class_id,
            TeacherAssignment.institution_id == institution_id,
        ))
        assignments = assign_res.scalars().all()
        if not assignments:
            return []
            
        # 3. Get teachers with eager loading
        teacher_ids = [a.teacher_id for a in assignments]
        teacher_res = await db.execute(
            select(Teacher)
            .options(
                selectinload(Teacher.assignments).selectinload(TeacherAssignment.school_class).selectinload(SchoolClass.grade),
                selectinload(Teacher.assignments).selectinload(TeacherAssignment.school_class).selectinload(SchoolClass.section),
                selectinload(Teacher.assignments).selectinload(TeacherAssignment.subject_ref)
            )
            .where(
                Teacher.id.in_(teacher_ids),
                Teacher.institution_id == institution_id
            )
        )
        return teacher_res.scalars().all()

teacher_service = TeacherService()
