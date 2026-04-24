from sqlalchemy import text
from app.core.database import sync_engine

def drop_all_cascade():
    with sync_engine.connect() as conn:
        print("dropping all tables with CASCADE...")
        # Get all table names in public schema
        result = conn.execute(text("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'"))
        tables = [row[0] for row in result]
        if tables:
            conn.execute(text(f"DROP TABLE IF EXISTS {', '.join(tables)} CASCADE"))
            conn.commit()
            print(f"Dropped {len(tables)} tables.")
        else:
            print("No tables found.")

if __name__ == "__main__":
    drop_all_cascade()
