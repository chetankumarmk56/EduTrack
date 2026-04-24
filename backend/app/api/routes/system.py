from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any

from app.core.database import get_db
from app.core.dependencies import get_current_user, UserContext
from app.services.system_service import system_service

router = APIRouter(prefix="/api/system", tags=["System Operation"])

@router.get("/initialize", response_model=None)
async def initialize_portal(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user)
) -> Any:
    """
    Consolidated initialization endpoint for EduTrack portals.
    Reduces client-side network overhead by aggregating all mandatory 
    metadata and role-specific stats into a single fast-tracked payload.
    """
    return await system_service.get_initialization_context(db, user)
