from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.core.database import get_db

router = APIRouter()

@router.get("/api/debug_db")
async def debug_db(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT current_database();"))
    db_name = result.scalar()
    
    result2 = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'payments';"))
    columns = [row[0] for row in result2]
    
    return {"database": db_name, "payments_columns": columns}
