import asyncio
import uuid
from sqlalchemy import text
from app.core.database import engine

async def repair_database():
    async with engine.begin() as conn:
        print("Starting Database Repair for Announcements...")
        
        # 1. Drop existing tables if they exist
        await conn.execute(text("DROP TABLE IF EXISTS announcement_reads CASCADE"))
        await conn.execute(text("DROP TABLE IF EXISTS announcements CASCADE"))
        print("Dropped old tables.")

        # 2. Create announcements table with UUID primary key
        # Note: We use PostgreSQL UUID type
        await conn.execute(text("""
            CREATE TABLE announcements (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                title VARCHAR NOT NULL,
                message TEXT NOT NULL,
                type VARCHAR NOT NULL,
                priority VARCHAR NOT NULL DEFAULT 'low',
                attachment_url VARCHAR,
                class_id INTEGER REFERENCES school_classes(id),
                student_id INTEGER REFERENCES students(id),
                teacher_id INTEGER NOT NULL REFERENCES teachers(id),
                institution_id INTEGER NOT NULL REFERENCES institutions(id),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
            )
        """))
        print("Created announcements table.")

        # 3. Create announcement_reads table
        await conn.execute(text("""
            CREATE TABLE announcement_reads (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
                parent_id INTEGER NOT NULL REFERENCES parents(id),
                read_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
                CONSTRAINT uq_announcement_parent_read UNIQUE (announcement_id, parent_id)
            )
        """))
        print("Created announcement_reads table.")
        
        # 4. Create Indexes
        await conn.execute(text("CREATE INDEX ix_announcements_class_id ON announcements (class_id)"))
        await conn.execute(text("CREATE INDEX ix_announcements_student_id ON announcements (student_id)"))
        await conn.execute(text("CREATE INDEX ix_announcements_created_at_desc ON announcements (created_at DESC)"))
        print("Created indexes.")
        
        print("Database Repair Complete.")

if __name__ == "__main__":
    asyncio.run(repair_database())
