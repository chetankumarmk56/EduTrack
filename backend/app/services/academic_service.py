from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from typing import List, Optional
from app.models.academic import Grade, Section, SchoolClass, Subject
from app.models.finance import StudentFee
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
        result = await db.execute(
            select(Grade).where(Grade.id == grade_id, Grade.institution_id == institution_id)
        )
        db_grade = result.scalars().first()
        if not db_grade:
            return None
        
        update_data = grade_in.model_dump(exclude_unset=True)
        fee_changed = False
        if 'tuition_fee' in update_data and update_data['tuition_fee'] != db_grade.tuition_fee:
            fee_changed = True
        if 'fee_due_date' in update_data and update_data['fee_due_date'] != db_grade.fee_due_date:
            fee_changed = True

        for k, v in update_data.items():
            setattr(db_grade, k, v)

        if fee_changed:
            # Cascade to all SchoolClass mapping for this grade
            classes_result = await db.execute(select(SchoolClass).where(SchoolClass.grade_id == grade_id))
            school_classes = classes_result.scalars().all()
            for sc in school_classes:
                if 'tuition_fee' in update_data:
                    sc.tuition_fee = update_data['tuition_fee']
                    sc.total_fee = sc.tuition_fee + sc.transport_fee + sc.other_fee
                if 'fee_due_date' in update_data:
                    sc.fee_due_date = update_data['fee_due_date']
                
                from datetime import date
                student_fees_res = await db.execute(select(StudentFee).where(StudentFee.class_id == sc.id))
                student_fees = student_fees_res.scalars().all()
                for sf in student_fees:
                    if 'tuition_fee' in update_data:
                        # Re-calculate due amount based on new total
                        # Prevent negative due amounts if new total is less than what they already paid
                        sf.total_amount = sc.total_fee
                        sf.due_amount = max(0.0, sf.total_amount - sf.amount_paid)
                    if 'fee_due_date' in update_data:
                        sf.due_date = update_data['fee_due_date'] if update_data['fee_due_date'] else date.today()
        
        await db.commit()
        await db.refresh(db_grade)
        return db_grade

    @staticmethod
    async def delete_grade(db: AsyncSession, institution_id: int, grade_id: int):
        result = await db.execute(
            select(Grade).where(Grade.id == grade_id, Grade.institution_id == institution_id)
        )
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
        result = await db.execute(stmt)
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
    async def deploy_segment(db: AsyncSession, institution_id: int, section_in: schemas.SectionCreate):
        """
        Atomic deployment: Creates a Section AND its corresponding SchoolClass mapping.
        This is preferred over multiple frontend calls to ensure relational integrity.
        """
        grade_result = await db.execute(
            select(Grade).where(Grade.id == section_in.grade_id, Grade.institution_id == institution_id)
        )
        db_grade = grade_result.scalars().first()
        if not db_grade:
            return None

        # 1. Create Section
        db_section = Section(
            name=section_in.name, 
            grade_id=section_in.grade_id, 
            institution_id=institution_id
        )
        db.add(db_section)
        await db.flush() # Get ID without committing

        # 2. Create SchoolClass Mapping
        db_school_class = SchoolClass(
            grade_id=db_grade.id,
            section_id=db_section.id,
            institution_id=institution_id,
            display_name=f"{db_grade.level}-{db_section.name}",
            tuition_fee=db_grade.tuition_fee,
            transport_fee=0.0,
            other_fee=0.0,
            total_fee=db_grade.tuition_fee,
            fee_due_date=db_grade.fee_due_date
        )
        db.add(db_school_class)
        
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

        # Auto-calculate total_fee
        total_fee = (class_in.tuition_fee or 0.0) + (class_in.transport_fee or 0.0) + (class_in.other_fee or 0.0)
        
        db_class = SchoolClass(
            **class_in.model_dump(exclude={"total_fee"}), 
            total_fee=total_fee,
            institution_id=institution_id
        )
        db.add(db_class)
        await db.commit()
        await db.refresh(db_class)
        return db_class

    @staticmethod
    async def update_school_class(db: AsyncSession, institution_id: int, class_id: int, class_in: schemas.SchoolClassUpdate):
        result = await db.execute(
            select(SchoolClass).where(SchoolClass.id == class_id, SchoolClass.institution_id == institution_id)
        )
        db_class = result.scalars().first()
        if not db_class:
            return None

        update_data = class_in.model_dump(exclude_unset=True)
        for k, v in update_data.items():
            setattr(db_class, k, v)

        # Recalculate total_fee
        db_class.total_fee = (db_class.tuition_fee or 0.0) + (db_class.transport_fee or 0.0) + (db_class.other_fee or 0.0)

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
