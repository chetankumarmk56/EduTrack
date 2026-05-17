from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from datetime import datetime, timedelta, timezone
from app.models.core import Institution, User
from app.core.security import get_password_hash
from app.core.logger import logger
from app.schemas import admin as schemas

# Soft-deleted institutions are permanently purged after this many days.
TRASH_RETENTION_DAYS = 90


# Ordered list of DELETE statements that purge every row tied to an institution.
# Order matters: rows that reference other entity rows (e.g. teacher_assignments → teachers)
# must be deleted BEFORE the parent entity row. Each runs in its own savepoint so
# missing tables (older schemas / not-yet-migrated environments) don't abort.
_INSTITUTION_CASCADE = [
    # Children of users
    "DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE institution_id = :id)",
    "DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE institution_id = :id)",
    # Marks / attendance / fees / payments
    "DELETE FROM marks WHERE institution_id = :id",
    "DELETE FROM attendance WHERE institution_id = :id",
    "DELETE FROM teacher_attendance WHERE institution_id = :id",
    "DELETE FROM teacher_assignments WHERE institution_id = :id",
    "DELETE FROM student_fees WHERE institution_id = :id",
    "DELETE FROM payment_allocations WHERE payment_id IN (SELECT id FROM payments WHERE institution_id = :id)",
    "DELETE FROM payments WHERE institution_id = :id",
    "DELETE FROM finance_ledger WHERE institution_id = :id",
    # Communications
    "DELETE FROM announcement_reads WHERE announcement_id IN (SELECT id FROM announcements WHERE institution_id = :id)",
    "DELETE FROM announcements WHERE institution_id = :id",
    "DELETE FROM events WHERE institution_id = :id",
    # Transport
    "DELETE FROM transport_locations WHERE institution_id = :id",
    "DELETE FROM transport_assignments WHERE institution_id = :id",
    "DELETE FROM transport_stops WHERE institution_id = :id",
    "DELETE FROM transport_routes WHERE institution_id = :id",
    # Uploaded files
    "DELETE FROM uploaded_files WHERE institution_id = :id",
    # Core directory (students before parents because students.parent_id → parents.id)
    "DELETE FROM students WHERE institution_id = :id",
    "DELETE FROM parents WHERE institution_id = :id",
    "DELETE FROM teachers WHERE institution_id = :id",
    # Academic structure (school_classes references both grades and sections)
    "DELETE FROM school_classes WHERE institution_id = :id",
    "DELETE FROM sections WHERE institution_id = :id",
    "DELETE FROM grades WHERE institution_id = :id",
    "DELETE FROM subjects WHERE institution_id = :id",
    # Finally users (clears admin / staff credentials so they can't log in)
    "DELETE FROM users WHERE institution_id = :id",
]

class AdminService:
    # --- Institution Management ---

    @staticmethod
    async def create_institution(db: AsyncSession, inst_data: schemas.InstitutionCreate) -> Institution:
        from fastapi import HTTPException
        # Block reuse of a slug that's currently in the trash.
        existing = await db.execute(
            select(Institution).where(Institution.slug == inst_data.slug)
        )
        clash = existing.scalars().first()
        if clash:
            if clash.deleted_at is not None:
                raise HTTPException(
                    status_code=409,
                    detail=f"Institution ID '{inst_data.slug}' belongs to a school in the trash. Restore it or pick a different ID.",
                )
            raise HTTPException(status_code=409, detail=f"Institution ID '{inst_data.slug}' is already in use.")

        db_inst = Institution(**inst_data.model_dump())
        db.add(db_inst)
        await db.commit()
        await db.refresh(db_inst)
        return db_inst

    @staticmethod
    async def get_institutions(db: AsyncSession, skip: int = 0, limit: int = 100):
        # Hide soft-deleted (trashed) schools by default.
        result = await db.execute(
            select(Institution).where(Institution.deleted_at.is_(None)).offset(skip).limit(limit)
        )
        return result.scalars().all()

    @staticmethod
    async def get_trashed_institutions(db: AsyncSession):
        # Opportunistic purge of anything older than the retention window.
        await AdminService.purge_expired_trash(db)
        result = await db.execute(
            select(Institution).where(Institution.deleted_at.is_not(None)).order_by(Institution.deleted_at.desc())
        )
        return result.scalars().all()

    @staticmethod
    async def get_institution(db: AsyncSession, inst_id: int):
        result = await db.execute(select(Institution).where(Institution.id == inst_id))
        return result.scalars().first()

    @staticmethod
    async def update_institution(db: AsyncSession, inst_id: int, update_data: schemas.InstitutionUpdate):
        db_inst = await AdminService.get_institution(db, inst_id)
        if not db_inst:
            return None
        
        for key, value in update_data.model_dump(exclude_unset=True).items():
            setattr(db_inst, key, value)
            
        await db.commit()
        await db.refresh(db_inst)
        return db_inst

    @staticmethod
    async def toggle_institution_status(db: AsyncSession, inst_id: int, is_active: bool):
        db_inst = await AdminService.get_institution(db, inst_id)
        if not db_inst:
            return None
            
        db_inst.is_active = is_active
        await db.commit()
        await db.refresh(db_inst)
        return db_inst

    @staticmethod
    async def delete_institution(db: AsyncSession, inst_id: int):
        """
        Soft-delete: marks the institution and blocks login. Data stays intact
        for TRASH_RETENTION_DAYS so a Super-Admin can restore it. After the
        window expires, purge_expired_trash hard-deletes everything.
        """
        db_inst = await AdminService.get_institution(db, inst_id)
        if not db_inst or db_inst.deleted_at is not None:
            return False

        db_inst.deleted_at = datetime.now(timezone.utc)
        db_inst.is_active = False  # blocks logins immediately
        await db.commit()
        await db.refresh(db_inst)
        return True

    @staticmethod
    async def restore_institution(db: AsyncSession, inst_id: int):
        """Bring a trashed school back to life."""
        db_inst = await AdminService.get_institution(db, inst_id)
        if not db_inst or db_inst.deleted_at is None:
            return None
        db_inst.deleted_at = None
        db_inst.is_active = True
        await db.commit()
        await db.refresh(db_inst)
        return db_inst

    @staticmethod
    async def _hard_delete_cascade(db: AsyncSession, inst_id: int) -> None:
        """Permanent cascade-delete of every row tied to an institution."""
        for stmt in _INSTITUTION_CASCADE:
            try:
                async with db.begin_nested():
                    await db.execute(text(stmt), {"id": inst_id})
            except Exception as e:
                logger.debug(f"hard_delete_cascade skipped ({e.__class__.__name__}): {stmt[:80]}")
        await db.execute(text("DELETE FROM institutions WHERE id = :id"), {"id": inst_id})

    @staticmethod
    async def purge_expired_trash(db: AsyncSession) -> int:
        """
        Hard-delete any institution that's been in the trash longer than
        TRASH_RETENTION_DAYS. Called opportunistically when Super-Admin lists
        trash, so no cron job is needed. Returns count of institutions purged.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=TRASH_RETENTION_DAYS)
        result = await db.execute(
            select(Institution.id).where(
                Institution.deleted_at.is_not(None),
                Institution.deleted_at < cutoff,
            )
        )
        ids = [row[0] for row in result.all()]
        if not ids:
            return 0
        for inst_id in ids:
            await AdminService._hard_delete_cascade(db, inst_id)
            logger.info(f"PURGE: institution_id={inst_id} permanently deleted (>{TRASH_RETENTION_DAYS}d in trash)")
        await db.commit()
        return len(ids)

    # --- User Management ---

    @staticmethod
    async def create_user(db: AsyncSession, user_data: schemas.UserCreate) -> User:
        db_user = User(
            name=user_data.name,
            email=user_data.email,
            password_hash=get_password_hash(user_data.password),
            role=user_data.role,
            institution_id=user_data.institution_id
        )
        db.add(db_user)
        await db.commit()
        await db.refresh(db_user)
        return db_user

    @staticmethod
    async def get_all_admins(db: AsyncSession):
        result = await db.execute(select(User).where(User.role == "admin"))
        return result.scalars().all()

    @staticmethod
    async def get_user(db: AsyncSession, user_id: int):
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalars().first()

    @staticmethod
    async def update_user(db: AsyncSession, user_id: int, update_data: schemas.UserUpdate):
        db_user = await AdminService.get_user(db, user_id)
        if not db_user:
            return None
        
        update_dict = update_data.model_dump(exclude_unset=True)
        if "password" in update_dict:
            update_dict["password_hash"] = get_password_hash(update_dict.pop("password"))
            
        for key, value in update_dict.items():
            setattr(db_user, key, value)
            
        await db.commit()
        await db.refresh(db_user)
        return db_user

    @staticmethod
    async def delete_user(db: AsyncSession, user_id: int):
        db_user = await AdminService.get_user(db, user_id)
        if not db_user:
            return False
        
        await db.delete(db_user)
        await db.commit()
        return True

admin_service = AdminService()
