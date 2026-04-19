import sys
import os
from sqlalchemy import text

# Add the project root to the python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.core.database import engine

def patch_db():
    print("Patching database...")
    with engine.connect() as conn:
        try:
            # Check if column exists, if not add it
            conn.execute(text("""
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                   WHERE table_name='attendance' AND column_name='subject') THEN
                        ALTER TABLE attendance ADD COLUMN subject VARCHAR;
                        RAISE NOTICE 'Added subject column to attendance table';
                    END IF;
                END $$;
            """))
            conn.commit()
            print("Database patch applied successfully.")
        except Exception as e:
            print(f"Error patching database: {e}")

if __name__ == "__main__":
    patch_db()
