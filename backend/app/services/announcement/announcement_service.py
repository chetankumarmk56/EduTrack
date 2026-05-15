from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, exists, literal as sa_literal
from sqlalchemy.orm import selectinload
from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException, status
from app.models.communication import Announcement, AnnouncementRead
from app.models.directory import Teacher, TeacherAssignment, Student, Parent
from app.schemas.communication import AnnouncementCreate, AnnouncementUpdate, AnnouncementType

class AnnouncementService:
    @staticmethod
    async def get_announcements_for_parent(
        db: AsyncSession, 
        institution_id: int, 
        parent_id: Optional[int],
        student_id: Optional[int] = None,
        limit: int = 20,
        offset: int = 0
    ) -> List[dict]:
        """
        Fetch announcements relevant to a parent's children or a specific student.
        Handles both parent portal and student portal views.
        """
        from app.models.directory import Teacher, Student, Parent
        from app.models.core import User as AuthUser
        from app.models.communication import AnnouncementType
        
        student_ids = []
        class_ids = []

        if parent_id:
            # 1. Get all children of the parent
            result = await db.execute(
                select(Parent)
                .options(selectinload(Parent.students))
                .where(Parent.id == parent_id, Parent.institution_id == institution_id)
            )
            parent = result.scalars().first()
            if parent:
                student_ids = [s.id for s in parent.students]
                class_ids = [s.school_class_id for s in parent.students if s.school_class_id]
        
        if student_id and student_id not in student_ids:
            # Fetch specific student if requested (e.g. for student portal)
            res = await db.execute(select(Student).where(Student.id == student_id))
            s = res.scalars().first()
            if s:
                student_ids.append(s.id)
                if s.school_class_id:
                    class_ids.append(s.school_class_id)

        if not student_ids and not class_ids:
            return []
        
        from sqlalchemy import func


        
        # 3. Fetch announcements with teacher and read status
        # We use an outer join for teacher to ensure announcements are never hidden if teacher profile is missing
        stmt = select(
            Announcement,
            func.coalesce(AuthUser.name, "School Faculty").label("teacher_name")
        )
        
        # Add is_read only if we have a parent_id
        if parent_id:
            stmt = stmt.add_columns(
                exists(
                    select(1).select_from(AnnouncementRead).where(
                        and_(
                            AnnouncementRead.announcement_id == Announcement.id,
                            AnnouncementRead.parent_id == parent_id
                        )
                    )
                ).label("is_read")
            )
        else:
            stmt = stmt.add_columns(sa_literal(False).label("is_read"))


        stmt = stmt.outerjoin(Teacher, Teacher.id == Announcement.teacher_id)\
             .outerjoin(AuthUser, AuthUser.id == Teacher.user_id)\
             .where(
                Announcement.institution_id == institution_id,
                or_(
                    and_(Announcement.type == AnnouncementType.CLASS, Announcement.class_id.in_(class_ids)),
                    and_(Announcement.type == AnnouncementType.STUDENT, Announcement.student_id.in_(student_ids))
                )
            ).order_by(Announcement.created_at.desc())\
             .limit(limit).offset(offset)

        
        result = await db.execute(stmt)
        rows = result.all()
        
        enriched = []


        for row in rows:
            a, t_name, read_status = row
            a_dict = {
                "id": a.id,
                "title": a.title,
                "message": a.message,
                "type": a.type,
                "priority": a.priority,
                "class_id": a.class_id,
                "student_id": a.student_id,
                "attachment_url": a.attachment_url,
                "teacher_id": a.teacher_id,
                "institution_id": a.institution_id,
                "created_at": a.created_at,
                "is_read": read_status,
                "teacher_name": t_name
            }
            enriched.append(a_dict)
            
        return enriched

    @staticmethod
    async def get_announcements_for_teacher(
        db: AsyncSession, 
        institution_id: int, 
        teacher_id: int,
        limit: int = 20,
        offset: int = 0
    ) -> List[dict]:
        """
        Fetch announcements created by a teacher with optimized engagement metrics.
        Eliminates N+1 queries using subqueries and aggregation.
        """
        from sqlalchemy import func, outerjoin
        
        # 1. Subquery for Read Counts
        reads_subq = select(
            AnnouncementRead.announcement_id,
            func.count(AnnouncementRead.id).label("read_count")
        ).group_by(AnnouncementRead.announcement_id).subquery()

        # 2. Base Query with Read Counts
        stmt = select(
            Announcement,
            func.coalesce(reads_subq.c.read_count, 0).label("read_count")
        ).outerjoin(
            reads_subq, Announcement.id == reads_subq.c.announcement_id
        ).where(
            Announcement.teacher_id == teacher_id,
            Announcement.institution_id == institution_id
        ).order_by(Announcement.created_at.desc())\
         .limit(limit).offset(offset)
        
        result = await db.execute(stmt)
        rows = result.all()
        
        # 3. For Target Counts, we still need logic but we can do it more efficiently
        # Since target counts (class size) are relatively static, we could cache them,
        # but for now, let's at least avoid the N+1 inside the loop if possible.
        # We'll fetch all unique class_ids involved in this batch.
        
        class_ids = [r[0].class_id for r in rows if r[0].type == AnnouncementType.CLASS and r[0].class_id]
        class_targets = {}
        if class_ids:
            # Get parent counts for these classes in one go
            target_stmt = select(
                Student.school_class_id,
                func.count(Parent.id.distinct()).label("count")
            ).join(Parent, Student.parent_id == Parent.id)\
             .where(Student.school_class_id.in_(class_ids))\
             .group_by(Student.school_class_id)
            
            target_res = await db.execute(target_stmt)
            class_targets = {r.school_class_id: r.count for r in target_res.all()}

        enriched = []
        for row in rows:
            a, read_count = row
            target_count = 1 if a.type == AnnouncementType.STUDENT else class_targets.get(a.class_id, 0)
            
            enriched.append({
                "id": a.id,
                "title": a.title,
                "message": a.message,
                "type": a.type,
                "priority": a.priority,
                "class_id": a.class_id,
                "student_id": a.student_id,
                "attachment_url": a.attachment_url,
                "teacher_id": a.teacher_id,
                "institution_id": a.institution_id,
                "created_at": a.created_at,
                "read_count": read_count,
                "target_count": target_count
            })
            
        return enriched

    @staticmethod
    async def trigger_announcement_notifications(
        db: AsyncSession, 
        announcement_id: UUID
    ):
        """
        Identify target parents and create in-app notifications.
        Designed to be run as a background task.
        """
        # 1. Fetch announcement details
        result = await db.execute(select(Announcement).where(Announcement.id == announcement_id))
        announcement = result.scalars().first()
        if not announcement:
            return

        # 2. Identify target parent user_ids
        target_user_ids = []
        if announcement.type == AnnouncementType.CLASS:
            # Find all unique parents in that class
            stmt = select(Parent.user_id).join(Student).where(
                Student.school_class_id == announcement.class_id,
                Student.institution_id == announcement.institution_id
            ).distinct()
            res = await db.execute(stmt)
            target_user_ids = [row for row in res.scalars().all()]
            
        elif announcement.type == AnnouncementType.STUDENT:
            # Find the parent of that specific student
            stmt = select(Parent.user_id).join(Student).where(
                Student.id == announcement.student_id
            )
            res = await db.execute(stmt)
            target_user_ids = [row for row in res.scalars().all()]

        # 3. Create Notification records
        from app.services.notification import notification_service
        for u_id in target_user_ids:
            # We bypass commit for batching if we were using a different session, 
            # but here we'll use the same session.
            # To be robust, we'll create them.
            await notification_service.create_notification(
                db, 
                announcement.institution_id, 
                u_id,
                title=f"New Announcement: {announcement.title}",
                message=announcement.message[:100] + "..." if len(announcement.message) > 100 else announcement.message,
                n_type="INFO"
            )
        
        # Commit all notifications
        await db.commit()

    @staticmethod
    async def create_announcement(
        db: AsyncSession, 
        institution_id: int, 
        user_id: int, 
        announcement: AnnouncementCreate
    ) -> Announcement:
        """
        Create announcement with strict ownership validation for teachers.
        """
        # 1. Fetch teacher profile
        teacher_result = await db.execute(select(Teacher).where(Teacher.user_id == user_id))
        teacher = teacher_result.scalars().first()
        if not teacher:
            raise HTTPException(status_code=403, detail="Faculty profile not found.")

        # 2. Validate Ownership/Assignment
        if announcement.type == AnnouncementType.CLASS:
            if not announcement.class_id:
                raise HTTPException(status_code=400, detail="class_id is required for class announcements.")
            
            assign_result = await db.execute(
                select(TeacherAssignment).where(
                    TeacherAssignment.teacher_id == teacher.id,
                    TeacherAssignment.school_class_id == announcement.class_id
                )
            )
            if not assign_result.scalars().first():
                raise HTTPException(status_code=403, detail="You are not assigned to this class.")

        elif announcement.type == AnnouncementType.STUDENT:
            if not announcement.student_id:
                raise HTTPException(status_code=400, detail="student_id is required for student announcements.")
            
            student_result = await db.execute(select(Student).where(Student.id == announcement.student_id))
            student = student_result.scalars().first()
            if not student:
                raise HTTPException(status_code=404, detail="Student not found.")
                
            assign_result = await db.execute(
                select(TeacherAssignment).where(
                    TeacherAssignment.teacher_id == teacher.id,
                    TeacherAssignment.school_class_id == student.school_class_id
                )
            )
            if not assign_result.scalars().first():
                raise HTTPException(status_code=403, detail="This student is not in your assigned classes.")

        # 3. Attachment URL is trusted — already validated during upload
        # (Cloudinary/Azure guarantee URL validity post-upload)

        # 4. Create
        db_announcement = Announcement(
            **announcement.model_dump(),
            teacher_id=teacher.id,
            institution_id=institution_id
        )
        db.add(db_announcement)
        await db.commit()
        await db.refresh(db_announcement)
        return db_announcement

    @staticmethod
    async def mark_as_read(db: AsyncSession, announcement_id: UUID, parent_id: int) -> bool:
        """
        Idempotent mark-as-read operation for parents.
        """
        # Check if already read
        existing = await db.execute(
            select(AnnouncementRead).where(
                AnnouncementRead.announcement_id == announcement_id,
                AnnouncementRead.parent_id == parent_id
            )
        )
        if existing.scalars().first():
            return True
            
        read_entry = AnnouncementRead(announcement_id=announcement_id, parent_id=parent_id)
        db.add(read_entry)
        try:
            await db.commit()
            return True
        except Exception:
            await db.rollback()
            return False

    @staticmethod
    async def delete_announcement(db: AsyncSession, announcement_id: UUID, user_id: int) -> bool:
        # Teachers can only delete their own announcements
        teacher_result = await db.execute(select(Teacher).where(Teacher.user_id == user_id))
        teacher = teacher_result.scalars().first()
        
        result = await db.execute(select(Announcement).where(Announcement.id == announcement_id))
        db_announcement = result.scalars().first()
        
        if not db_announcement or not teacher or db_announcement.teacher_id != teacher.id:
            return False
        
        await db.delete(db_announcement)
        await db.commit()
        return True

announcement_service = AnnouncementService()
