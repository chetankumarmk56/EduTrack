from app.core.database import SessionLocal
from app.models.core import User

db = SessionLocal()
users = db.query(User).filter(User.role == 'super_admin').all()
for u in users:
    print(f"ID: {u.id} | Email: {u.email} | Role: {u.role}")
db.close()
