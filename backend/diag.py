from app.core.database import SessionLocal
from app.directory.models import Student

# Ensure all models are loaded in memory
from app.directory import models as directory_models
from app.attendance import models as attendance_models
from app.marks import models as marks_models
from app.messages import models as messages_models
from app.events import models as events_models

db = SessionLocal()
count = db.query(Student).count()
print(f"Student Count from SQLAlchemy: {count}")
db.close()
