import asyncio
from app.core.database import SessionLocal, AsyncSessionLocal
from sqlalchemy import text

async def test_db():
    async with AsyncSessionLocal() as db:
        result = await db.execute(text("SELECT current_database();"))
        print("DB:", result.scalar())
        
        result2 = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'payments';"))
        columns = [row[0] for row in result2]
        print("Payments columns:", columns)

if __name__ == "__main__":
    asyncio.run(test_db())
