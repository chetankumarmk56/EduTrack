from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.core import Institution, User
from app.core.security import get_password_hash
from app.schemas import admin as schemas

class AdminService:
    # --- Institution Management ---

    @staticmethod
    async def create_institution(db: AsyncSession, inst_data: schemas.InstitutionCreate) -> Institution:
        db_inst = Institution(**inst_data.model_dump())
        db.add(db_inst)
        await db.commit()
        await db.refresh(db_inst)
        return db_inst

    @staticmethod
    async def get_institutions(db: AsyncSession, skip: int = 0, limit: int = 100):
        result = await db.execute(select(Institution).offset(skip).limit(limit))
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
        db_inst = await AdminService.get_institution(db, inst_id)
        if not db_inst:
            return False
        
        await db.delete(db_inst)
        await db.commit()
        return True

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
