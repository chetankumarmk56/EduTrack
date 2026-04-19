import sys
import os

sys.path.append(os.getcwd())

from app.core.database import engine
from app.models.core import Base as CoreBase
from app.models.academic import Base as AcademicBase
from app.models.directory import Base as DirectoryBase
from app.models.mark import Base as MarkBase
from app.models.attendance import Base as AttendanceBase
from app.models.event import Base as EventBase
from app.models.communication import Base as CommunicationBase
from app.core.database import Base # the master Base if it imports all, but usually each has its own unless centralized

# Let's just import the centralized Base which hopefully has all metadata
from app.models import Base

def reset_db():
    print("Dropping all tables...")
    Base.metadata.drop_all(bind=engine)
    print("Creating all tables...")
    Base.metadata.create_all(bind=engine)
    print("Database reset complete.")

if __name__ == "__main__":
    reset_db()
