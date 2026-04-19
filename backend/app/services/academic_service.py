from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from typing import List, Optional
from app.models.academic import Grade, Section, SchoolClass, Subject
from app.schemas import academic as schemas

class AcademicService:
    # --- Grade Methods ---
    @staticmethod
    async def get_grades(db: AsyncSession, institution_id: int):
        result = await db.execute(
            select(Grade).where(Grade.institution_id == institution_id).order_by(Grade.level)
        )
        return result.scalars().all()

    @staticmethod
    async def create_grade(db: AsyncSession, institution_id: int, grade_in: schemas.GradeCreate):
        db_grade = Grade(**grade_in.model_dump(), institution_id=institution_id)
        db.add(db_grade)
        await db.commit()
        await db.refresh(db_grade)
        return db_grade

    @staticmethod
    async def update_grade(db: AsyncSession, institution_id: int, grade_id: int, grade_in: schemas.GradeUpdate):
        result = await db.execute(select(Grade).where(Grade.id == grade_id))
        db_grade = result.scalars().first()
        if not db_grade:
            return None
        
        update_data = grade_in.model_dump(exclude_unset=True)
        for k, v in update_data.items():
            setattr(db_grade, k, v)
        
        await db.commit()
        await db.refresh(db_grade)
        return db_grade

    @staticmethod
    async def delete_grade(db: AsyncSession, institution_id: int, grade_id: int):
        result = await db.execute(select(Grade).where(Grade.id == grade_id))
        db_grade = result.scalars().first()
        if db_grade:
            await db.delete(db_grade)
            await db.commit()
            return True
        return False

    # --- Section Methods ---
    @staticmethod
    async def get_sections(db: AsyncSession, institution_id: int, grade_id: Optional[int] = None):
        stmt = select(Section).where(Section.institution_id == institution_id)
        if grade_id:
            stmt = stmt.where(Section.grade_id == grade_id)
        result = await db.execute(stmt.order_by(Section.name))
        return result.scalars().all()

    @staticmethod
    async def create_section(db: AsyncSession, institution_id: int, section_in: schemas.SectionCreate):
        grade_result = await db.execute(
            select(Grade).where(Grade.id == section_in.grade_id, Grade.institution_id == institution_id)
        )
        if not grade_result.scalars().first():
            return None

        db_section = Section(**section_in.model_dump(), institution_id=institution_id)
        db.add(db_section)
        await db.commit()
        await db.refresh(db_section)
        return db_section

    @staticmethod
    async def update_section(db: AsyncSession, institution_id: int, section_id: int, section_in: schemas.SectionUpdate):
        result = await db.execute(select(Section).where(Section.id == section_id))
        db_section = result.scalars().first()
        if not db_section:
            return None
        
        update_data = section_in.model_dump(exclude_unset=True)
        for k, v in update_data.items():
            setattr(db_section, k, v)
        
        await db.commit()
        await db.refresh(db_section)
        return db_section

    @staticmethod
    async def delete_section(db: AsyncSession, institution_id: int, section_id: int):
        result = await db.execute(select(Section).where(Section.id == section_id))
        db_section = result.scalars().first()
        if db_section:
            await db.delete(db_section)
            await db.commit()
            return True
        return False

    # --- Subject Methods ---
    @staticmethod
    async def get_subjects(db: AsyncSession, institution_id: int):
        result = await db.execute(
            select(Subject).where(Subject.institution_id == institution_id)
        )
        return result.scalars().all()

    @staticmethod
    async def create_subject(db: AsyncSession, institution_id: int, subject_in: schemas.SubjectCreate):
        db_subject = Subject(**subject_in.model_dump(), institution_id=institution_id)
        db.add(db_subject)
        await db.commit()
        await db.refresh(db_subject)
        return db_subject

    @staticmethod
    async def update_subject(db: AsyncSession, institution_id: int, subject_id: int, subject_in: schemas.SubjectUpdate):
        result = await db.execute(select(Subject).where(Subject.id == subject_id))
        db_subject = result.scalars().first()
        if not db_subject:
            return None
        
        update_data = subject_in.model_dump(exclude_unset=True)
        for k, v in update_data.items():
            setattr(db_subject, k, v)
        
        await db.commit()
        await db.refresh(db_subject)
        return db_subject

    @staticmethod
    async def delete_subject(db: AsyncSession, institution_id: int, subject_id: int):
        result = await db.execute(select(Subject).where(Subject.id == subject_id))
        db_subject = result.scalars().first()
        if db_subject:
            await db.delete(db_subject)
            await db.commit()
            return True
        return False

    # --- SchoolClass Methods ---
    @staticmethod
    async def get_school_classes(db: AsyncSession, institution_id: int):
        result = await db.execute(
            select(SchoolClass)
            .options(selectinload(SchoolClass.grade), selectinload(SchoolClass.section))
            .where(SchoolClass.institution_id == institution_id)
        )
        return result.scalars().all()

    @staticmethod
    async def create_school_class(db: AsyncSession, institution_id: int, class_in: schemas.SchoolClassCreate):
        existing_result = await db.execute(
            select(SchoolClass).where(
                SchoolClass.grade_id == class_in.grade_id,
                SchoolClass.section_id == class_in.section_id,
                SchoolClass.institution_id == institution_id
            )
        )
        if existing_result.scalars().first():
            raise Exception("Class with this Grade and Section already exists")

        db_class = SchoolClass(**class_in.model_dump(), institution_id=institution_id)
        db.add(db_class)
        await db.commit()
        await db.refresh(db_class)
        return db_class

    @staticmethod
    async def delete_school_class(db: AsyncSession, institution_id: int, class_id: int):
        result = await db.execute(select(SchoolClass).where(SchoolClass.id == class_id))
        db_class = result.scalars().first()
        if db_class:
            await db.delete(db_class)
            await db.commit()
            return True
        return False

academic_service = AcademicService()
