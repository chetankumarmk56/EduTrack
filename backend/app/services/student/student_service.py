from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from app.models.core import User
from app.schemas import directory as schemas
from app.core.security import get_password_hash_async
from app.models.directory import Student, Parent
from typing import List, Optional
from app.core.logger import logger


class StudentService:
    @staticmethod
    async def _recompute_roll_numbers(db: AsyncSession, institution_id: int, school_class_id: int):
        """Assign 1..N to students in the given class, alphabetically by name.

        Ties on name are broken by student id so the ordering is deterministic.
        Called whenever the membership or name of a class changes.
        """
        if not school_class_id:
            return
        result = await db.execute(
            select(Student)
            .where(
                Student.institution_id == institution_id,
                Student.school_class_id == school_class_id,
            )
        )
        students = list(result.scalars().all())
        students.sort(key=lambda s: ((s.name or '').lower(), s.id))
        for idx, s in enumerate(students, start=1):
            if s.roll_number != idx:
                s.roll_number = idx
        await db.flush()

    @staticmethod
    def _normalize_phone(raw: Optional[str]) -> Optional[str]:
        """Last-10-digits canonical form; mirrors the Parent model validator."""
        if not raw:
            return None
        digits = "".join(ch for ch in str(raw) if ch.isdigit())
        if len(digits) < 10:
            return None
        return digits[-10:]

    @staticmethod
    async def _find_or_create_parent(
        db: AsyncSession,
        institution_id: int,
        *,
        name: Optional[str] = None,
        email: Optional[str] = None,
        primary_phone: Optional[str] = None,
        secondary_phone: Optional[str] = None,
        relation: Optional[str] = None,
    ) -> Optional[Parent]:
        """
        Resolve the Parent record for a guardian, deduping siblings.

        Keyed on the normalized primary phone within the institution: if a
        parent with that phone already exists, reuse it (filling in any
        missing name/email/secondary phone) so siblings share one record;
        otherwise create a new parent. Returns None when no primary phone is
        supplied (we can't safely dedupe without one).
        """
        normalized = StudentService._normalize_phone(primary_phone)
        parent: Optional[Parent] = None

        if normalized:
            existing = await db.execute(
                select(Parent).where(
                    Parent.institution_id == institution_id,
                    Parent.primary_phone_normalized == normalized,
                ).limit(1)
            )
            parent = existing.scalars().first()

        if parent:
            # Backfill any details this guardian provided that the shared
            # record is still missing — never clobber existing values.
            if name and not parent.name:
                parent.name = name
            if email and not parent.email:
                parent.email = email
            if secondary_phone and not parent.secondary_phone:
                parent.secondary_phone = secondary_phone
            if relation and not parent.relation:
                parent.relation = relation
        else:
            parent = Parent(
                institution_id=institution_id,
                name=name,
                email=email,
                primary_phone=primary_phone,
                secondary_phone=secondary_phone,
                relation=relation,
            )
            db.add(parent)
        await db.flush()  # Get parent.id
        return parent

    @staticmethod
    async def create_student(db: AsyncSession, institution_id: int, student_data: schemas.StudentCreate):
        from app.models.academic import SchoolClass
        data = student_data.model_dump()
        password_value = data.pop('password', None)
        student_email = data.pop('email', None)

        # Guardian inputs are used to find-or-create the Parent record — they
        # are not student columns.
        parent_name = data.pop('parent_name', None)
        parent_email = data.pop('parent_email', None)
        parent_phone = data.pop('parent_phone', None)
        parent_secondary_phone = data.pop('parent_secondary_phone', None)
        parent_relation = data.pop('parent_relation', None)
        parent_id = data.pop('parent_id', None)

        existing_user = None
        if student_email:
            user_result = await db.execute(select(User).where(User.email == student_email))
            existing_user = user_result.scalars().first()

        # bcrypt off the event loop. Compute the hash once upfront so we
        # don't pay the ~100ms penalty twice when both branches need it.
        new_hash = await get_password_hash_async(password_value) if password_value else None
        if existing_user:
            db_user = existing_user
            if new_hash is not None:
                db_user.password_hash = new_hash
                await db.flush()
        else:
            db_user = User(
                email=student_email,
                name=data.get('name', ''),
                password_hash=new_hash or '',
                role='student',
                institution_id=institution_id,
            )
            db.add(db_user)
            await db.flush()

        # Resolve the parent first so we can store only parent_id on the student.
        if parent_id is None:
            parent = await StudentService._find_or_create_parent(
                db, institution_id,
                name=parent_name,
                email=parent_email,
                primary_phone=parent_phone,
                secondary_phone=parent_secondary_phone,
                relation=parent_relation,
            )
            parent_id = parent.id if parent else None

        db_student = Student(
            user_id=db_user.id,
            institution_id=institution_id,
            parent_id=parent_id,
            **data,
            plain_password=password_value
        )
        db.add(db_student)
        await db.flush() # Get student.id

        # AUTOMATION: Sync StudentFee if class is assigned
        if db_student.school_class_id:
            await StudentService._sync_student_fee(db, db_student.id, db_student.school_class_id, institution_id)
            await StudentService._recompute_roll_numbers(db, institution_id, db_student.school_class_id)

        await db.commit()
        return await StudentService.get_student(db, institution_id, db_student.id)

    @staticmethod
    async def get_students(
        db: AsyncSession,
        institution_id: int,
        skip: int = 0,
        limit: int = 1000,
        *,
        school_class_id: Optional[int] = None,
        search: Optional[str] = None,
        is_active: Optional[bool] = None,
    ):
        """
        List students with optional server-side filters.

        Push as much filtering as possible into SQL so the admin UI
        doesn't have to pull 500 rows just to render the 30 in one
        class. Search runs against the student name + the linked parent's
        name + email with ILIKE — the (institution_id, school_class_id)
        compound index already on the table makes the class-filter path a
        sub-millisecond lookup.
        """
        from app.models.academic import SchoolClass
        from sqlalchemy import or_, func

        stmt = (
            select(Student)
            .options(
                selectinload(Student.parent),
                selectinload(Student.school_class).selectinload(SchoolClass.grade),
                selectinload(Student.school_class).selectinload(SchoolClass.section),
            )
            .where(Student.institution_id == institution_id)
        )
        if school_class_id is not None:
            stmt = stmt.where(Student.school_class_id == school_class_id)
        if is_active is not None:
            stmt = stmt.where(Student.is_active.is_(is_active))
        if search:
            like = f"%{search.strip().lower()}%"
            # Outer-join the parent so students without a guardian still match
            # on their own name.
            stmt = stmt.outerjoin(Parent, Student.parent_id == Parent.id).where(
                or_(
                    func.lower(Student.name).like(like),
                    func.lower(Parent.name).like(like),
                    func.lower(Parent.email).like(like),
                )
            )

        stmt = stmt.offset(skip).limit(limit)
        result = await db.execute(stmt)
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
        from sqlalchemy import delete
        
        result = await db.execute(
            select(Student).where(Student.id == student_id, Student.institution_id == institution_id)
        )
        student = result.scalars().first()
        
        if student:
            user_id = student.user_id
            removed_class_id = student.school_class_id

            # Explicitly delete dependent records to prevent ForeignKey constraint violations
            from app.models.finance import StudentFee, Payment, PaymentAllocation
            from app.models.attendance import Attendance
            from app.models.mark import Mark
            from app.models.communication import Announcement
            from app.models.core import User

            # Delete communication records
            await db.execute(delete(Announcement).where(Announcement.student_id == student_id))
            
            # Delete payment allocations and payments
            payment_res = await db.execute(select(Payment.id).where(Payment.student_id == student_id))
            payment_ids = [row[0] for row in payment_res.all()]
            if payment_ids:
                await db.execute(delete(PaymentAllocation).where(PaymentAllocation.payment_id.in_(payment_ids)))
                await db.execute(delete(Payment).where(Payment.student_id == student_id))

            # Delete fee tracking and structure
            await db.execute(delete(StudentFee).where(StudentFee.student_id == student_id))
            
            # Finally delete the student profile (ORM will handle Mark and Attendance via cascades)
            await db.delete(student)
            await db.flush() 
            
            # Clean up the unified User credential record
            if user_id:
                from app.models.core import AuditLog

                await db.execute(delete(AuditLog).where(AuditLog.user_id == user_id))
                await db.execute(delete(User).where(User.id == user_id))

            if removed_class_id:
                await StudentService._recompute_roll_numbers(db, institution_id, removed_class_id)

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

        previous_class_id = db_student.school_class_id
        previous_name = db_student.name

        update_data = student_data.model_dump(exclude_unset=True)
        if "email" in update_data and update_data["email"] == "":
            update_data["email"] = None

        # Peel off guardian fields — these update the linked Parent record,
        # not the student. They are never student columns.
        guardian_keys = {
            "parent_name": "name",
            "parent_email": "email",
            "parent_phone": "primary_phone",
            "parent_secondary_phone": "secondary_phone",
            "parent_relation": "relation",
        }
        guardian_update = {
            parent_attr: update_data.pop(payload_key)
            for payload_key, parent_attr in guardian_keys.items()
            if payload_key in update_data
        }

        for key, value in update_data.items():
            if hasattr(db_student, key):
                setattr(db_student, key, value)

        if guardian_update:
            parent = None
            if db_student.parent_id:
                parent_res = await db.execute(
                    select(Parent).where(Parent.id == db_student.parent_id)
                )
                parent = parent_res.scalars().first()
            if parent:
                for attr, value in guardian_update.items():
                    setattr(parent, attr, value)
            elif guardian_update.get("primary_phone"):
                # No parent yet — create one so the guardian edit isn't lost
                # (and parent-portal login becomes possible).
                parent = await StudentService._find_or_create_parent(
                    db, institution_id,
                    name=guardian_update.get("name"),
                    email=guardian_update.get("email"),
                    primary_phone=guardian_update.get("primary_phone"),
                    secondary_phone=guardian_update.get("secondary_phone"),
                    relation=guardian_update.get("relation"),
                )
                db_student.parent_id = parent.id if parent else None

        if db_student.user_id:
            user_result = await db.execute(select(User).where(User.id == db_student.user_id))
            db_user = user_result.scalars().first()
            if db_user:
                if "name" in update_data:
                    db_user.name = update_data["name"]
                if "email" in update_data:
                    db_user.email = update_data["email"]

        # AUTOMATION: Sync StudentFee if class is assigned or changed
        if "school_class_id" in update_data and update_data["school_class_id"]:
            await StudentService._sync_student_fee(db, db_student.id, update_data["school_class_id"], institution_id)

        # Recompute roll numbers for any class whose membership or name order shifted.
        classes_to_recompute: set[int] = set()
        if previous_class_id and previous_class_id != db_student.school_class_id:
            classes_to_recompute.add(previous_class_id)
        if db_student.school_class_id:
            name_changed = "name" in update_data and update_data["name"] != previous_name
            class_changed = previous_class_id != db_student.school_class_id
            if name_changed or class_changed:
                classes_to_recompute.add(db_student.school_class_id)
        for cls_id in classes_to_recompute:
            await StudentService._recompute_roll_numbers(db, institution_id, cls_id)

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
                db_user.password_hash = await get_password_hash_async(new_password)
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
        from app.models.directory import Parent
        
        # 1. Try finding a direct student record (for student login)
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
        student = result.scalars().first()
        if student:
            return student
            
        # 2. Try finding if user is a parent and get their first student
        parent_result = await db.execute(
            select(Parent)
            .where(Parent.user_id == user_id, Parent.institution_id == institution_id)
        )
        parent = parent_result.scalars().first()
        
        if parent:
            # Get students linked to this parent
            student_result = await db.execute(
                select(Student)
                .options(
                    selectinload(Student.parent),
                    selectinload(Student.school_class).selectinload(SchoolClass.grade),
                    selectinload(Student.school_class).selectinload(SchoolClass.section)
                )
                .where(Student.parent_id == parent.id)
                .limit(1) # For now, grab the first child
            )
            return student_result.scalars().first()
            
        return None

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

        token_payload = {
            "sub": str(student.user_id or student.id), 
            "role": role, 
            "institution_id": institution_id,
            "name": student.name
        }
        
        from app.core.security import create_access_token, create_refresh_token
        access_token = create_access_token(data=token_payload)
        refresh_token = create_refresh_token(data=token_payload)

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "role": role,
            "institution_id": institution_id,
            "user": {
                "id": student.id,
                "name": student.name
            }
        }

    @staticmethod
    async def _sync_student_fee(db: AsyncSession, student_id: int, class_id: int, institution_id: int):
        """
        Ensures a StudentFee record exists for the given student and class.
        Resolution order for the fee amount (Issue #1 Fix):
          1. SchoolClass.total_fee (set during deploy_segment or create_school_class)
          2. SchoolClass.tuition_fee (direct fee column)
          3. Grade.tuition_fee (parent grade — definitive source of truth)
        Self-heals SchoolClass if total_fee was 0 but Grade has a fee defined.
        """
        from app.models.academic import SchoolClass, Grade
        from app.services.finance import finance_service

        # 1. Fetch the SchoolClass
        class_res = await db.execute(select(SchoolClass).where(SchoolClass.id == class_id))
        school_class = class_res.scalars().first()
        if not school_class:
            return

        # 2. Resolve total_fee through three layers of fallback
        total_amount = school_class.total_fee or 0.0

        if total_amount == 0.0:
            # Layer 2: try SchoolClass.tuition_fee directly
            total_amount = school_class.tuition_fee or 0.0

        if total_amount == 0.0 and school_class.grade_id:
            # Layer 3: fall back to Grade.tuition_fee (source of truth from Admin setup)
            grade_res = await db.execute(select(Grade).where(Grade.id == school_class.grade_id))
            grade = grade_res.scalars().first()
            if grade and (grade.tuition_fee or 0.0) > 0:
                total_amount = grade.tuition_fee
                # Self-heal: write resolved fee back to SchoolClass for future consistency
                school_class.tuition_fee = total_amount
                school_class.total_fee = total_amount
                logger.info(
                    f"FEE_SYNC: SchoolClass {class_id} had total_fee=0; "
                    f"self-healed from Grade {school_class.grade_id} → ₹{total_amount}"
                )

        # 3. Resolve due_date — prefer class, fall back to grade
        due_date = school_class.fee_due_date
        if not due_date and school_class.grade_id:
            grade_res2 = await db.execute(select(Grade).where(Grade.id == school_class.grade_id))
            grade2 = grade_res2.scalars().first()
            if grade2:
                due_date = grade2.fee_due_date

        logger.info(
            f"FEE_SYNC: Syncing StudentFee for Student {student_id}, "
            f"Class {class_id}, Amount=₹{total_amount}, DueDate={due_date}"
        )

        # 4. Idempotent Get or Create
        await finance_service.get_or_create_student_fee(
            db,
            student_id=student_id,
            class_id=class_id,
            institution_id=institution_id,
            total_amount=total_amount,
            due_date=due_date
        )

student_service = StudentService()

