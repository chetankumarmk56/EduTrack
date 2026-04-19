from sqlalchemy.orm import Session
from app.models.core import Institution, User
from app.core.security import get_password_hash
from app.schemas import admin as schemas

class AdminService:
    # --- Institution Management ---

    @staticmethod
    def create_institution(db: Session, inst_data: schemas.InstitutionCreate) -> Institution:
        db_inst = Institution(**inst_data.model_dump())
        db.add(db_inst)
        db.commit()
        db.refresh(db_inst)
        return db_inst

    @staticmethod
    def get_institutions(db: Session, skip: int = 0, limit: int = 100):
        return db.query(Institution).offset(skip).limit(limit).all()

    @staticmethod
    def get_institution(db: Session, inst_id: int):
        return db.query(Institution).filter(Institution.id == inst_id).first()

    @staticmethod
    def update_institution(db: Session, inst_id: int, update_data: schemas.InstitutionUpdate):
        db_inst = AdminService.get_institution(db, inst_id)
        if not db_inst:
            return None
        
        for key, value in update_data.model_dump(exclude_unset=True).items():
            setattr(db_inst, key, value)
            
        db.commit()
        db.refresh(db_inst)
        return db_inst

    @staticmethod
    def toggle_institution_status(db: Session, inst_id: int, is_active: bool):
        db_inst = AdminService.get_institution(db, inst_id)
        if not db_inst:
            return None
            
        db_inst.is_active = is_active
        db.commit()
        db.refresh(db_inst)
        return db_inst

    @staticmethod
    def delete_institution(db: Session, inst_id: int):
        db_inst = AdminService.get_institution(db, inst_id)
        if not db_inst:
            return False
        
        # All associated records (Users, Students, etc.) will be handled 
        # by the database cascade or manual deletion depending on business logic.
        # For this Saas, we'll assume a cascade is set in models.
        db.delete(db_inst)
        db.commit()
        return True

    # --- User Management ---

    @staticmethod
    def create_user(db: Session, user_data: schemas.UserCreate) -> User:
        db_user = User(
            name=user_data.name,
            email=user_data.email,
            password_hash=get_password_hash(user_data.password),
            role=user_data.role,
            institution_id=user_data.institution_id
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user

    @staticmethod
    def get_all_admins(db: Session):
        """Fetches all users with the 'admin' role."""
        return db.query(User).filter(User.role == "admin").all()

    @staticmethod
    def get_user(db: Session, user_id: int):
        return db.query(User).filter(User.id == user_id).first()

    @staticmethod
    def update_user(db: Session, user_id: int, update_data: schemas.UserUpdate):
        db_user = AdminService.get_user(db, user_id)
        if not db_user:
            return None
        
        update_dict = update_data.model_dump(exclude_unset=True)
        if "password" in update_dict:
            update_dict["password_hash"] = get_password_hash(update_dict.pop("password"))
            
        for key, value in update_dict.items():
            setattr(db_user, key, value)
            
        db.commit()
        db.refresh(db_user)
        return db_user

    @staticmethod
    def delete_user(db: Session, user_id: int):
        db_user = AdminService.get_user(db, user_id)
        if not db_user:
            return False
        
        db.delete(db_user)
        db.commit()
        return True
