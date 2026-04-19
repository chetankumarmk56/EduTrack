import sys
import os
from sqlalchemy import text

# Add the project root to the python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.core.database import engine, Base
from app.models import *  # Ensure all models are registered with Base metadata
from app.core.security import get_password_hash
from app.models.core import User, UserRole, Institution
from sqlalchemy.orm import Session

def reset_db():
    print("Dropping all tables...")
    Base.metadata.drop_all(bind=engine)
    
    print("Creating all tables...")
    Base.metadata.create_all(bind=engine)
    
    print("Seeding initial data...")
    with Session(engine) as db:
        # Create Institution
        institution = Institution(name="St. Mary's Academy", slug="st-marys", is_active=True)
        db.add(institution)
        db.flush() # To get the ID
        
        # Admin User
        admin_user = User(
            email="admin@stmarys.edu",
            name="System Administrator",
            password_hash=get_password_hash("admin123"),
            role=UserRole.ADMIN,
            institution_id=institution.id,
            is_active=True
        )
        db.add(admin_user)
        db.commit()
        
        print("\n" + "="*50)
        print("Reset procedure initiated for: St. Mary's Academy")
        print("Database schemas finalized and synchronization complete.")
        print("Default Admin Account created: admin@stmarys.edu / admin123")
        print("="*50 + "\n")

if __name__ == "__main__":
    confirm = input("Are you sure you want to RESET the entire database? (y/n): ")
    if confirm.lower() == 'y':
        reset_db()
    else:
        print("Reset aborted.")
