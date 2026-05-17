from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_db
from app.core.dependencies import require_super_admin, UserContext
from app.schemas import admin as schemas
from app.services.admin import admin_service

router = APIRouter(
    prefix="/api/admin",
    tags=["super-admin"],
    dependencies=[Depends(require_super_admin)] 
)

# --- Institution Routes ---

@router.post("/institutions", response_model=schemas.InstitutionResponse)
async def create_institution(
    inst_data: schemas.InstitutionCreate, 
    db: AsyncSession = Depends(get_db)
):
    return await admin_service.create_institution(db, inst_data)

@router.get("/institutions", response_model=List[schemas.InstitutionResponse])
async def get_institutions(
    skip: int = 0, limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    return await admin_service.get_institutions(db, skip=skip, limit=limit)

# IMPORTANT: must be registered BEFORE /institutions/{inst_id} so FastAPI
# doesn't match "trash" as an int path param.
@router.get("/institutions/trash", response_model=List[schemas.TrashedInstitutionResponse])
async def list_trashed_institutions(
    db: AsyncSession = Depends(get_db)
):
    """List soft-deleted schools with days_until_purge for each."""
    from datetime import datetime, timezone, timedelta
    from app.services.admin.admin_service import TRASH_RETENTION_DAYS
    insts = await admin_service.get_trashed_institutions(db)
    out = []
    now = datetime.now(timezone.utc)
    for i in insts:
        purge_at = i.deleted_at + timedelta(days=TRASH_RETENTION_DAYS)
        days_left = max(0, (purge_at - now).days)
        out.append({
            "id": i.id, "name": i.name, "slug": i.slug,
            "is_active": i.is_active, "created_at": i.created_at,
            "deleted_at": i.deleted_at, "days_until_purge": days_left,
        })
    return out

@router.get("/institutions/{inst_id}", response_model=schemas.InstitutionResponse)
async def get_institution(
    inst_id: int, 
    db: AsyncSession = Depends(get_db)
):
    inst = await admin_service.get_institution(db, inst_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Institution not found")
    return inst

@router.put("/institutions/{inst_id}", response_model=schemas.InstitutionResponse)
async def update_institution(
    inst_id: int, 
    update_data: schemas.InstitutionUpdate,
    db: AsyncSession = Depends(get_db)
):
    inst = await admin_service.update_institution(db, inst_id, update_data)
    if not inst:
        raise HTTPException(status_code=404, detail="Institution not found")
    return inst

@router.post("/institutions/{inst_id}/activate", response_model=schemas.InstitutionResponse)
async def activate_institution(
    inst_id: int, 
    db: AsyncSession = Depends(get_db)
):
    inst = await admin_service.toggle_institution_status(db, inst_id, True)
    if not inst:
        raise HTTPException(status_code=404, detail="Institution not found")
    return inst

@router.post("/institutions/{inst_id}/deactivate", response_model=schemas.InstitutionResponse)
async def deactivate_institution(
    inst_id: int, 
    db: AsyncSession = Depends(get_db)
):
    inst = await admin_service.toggle_institution_status(db, inst_id, False)
    if not inst:
        raise HTTPException(status_code=404, detail="Institution not found")
    return inst

@router.delete("/institutions/{inst_id}")
async def delete_institution(
    inst_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Move a school to the trash. Permanently purged after 90 days."""
    success = await admin_service.delete_institution(db, inst_id)
    if not success:
        raise HTTPException(status_code=404, detail="Institution not found or already in trash")
    return {"message": "Institution moved to trash. Restorable for 90 days."}

@router.post("/institutions/{inst_id}/restore", response_model=schemas.InstitutionResponse)
async def restore_institution(
    inst_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Restore a trashed school. All admin/teacher/student credentials become usable again."""
    inst = await admin_service.restore_institution(db, inst_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Institution not found in trash")
    return inst

# --- Admin User Routes ---

@router.post("/institutions/{inst_id}/admins", response_model=schemas.UserResponse)
async def create_institution_admin(
    inst_id: int,
    user_data: schemas.UserCreate,
    db: AsyncSession = Depends(get_db)
):
    inst = await admin_service.get_institution(db, inst_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Institution not found")
    user_data.institution_id = inst_id
    user_data.role = "admin"
    return await admin_service.create_user(db, user_data)

@router.get("/admins", response_model=List[schemas.UserResponse])
async def get_all_admins(
    db: AsyncSession = Depends(get_db)
):
    return await admin_service.get_all_admins(db)

@router.put("/admins/{user_id}", response_model=schemas.UserResponse)
async def update_admin(
    user_id: int,
    update_data: schemas.UserUpdate,
    db: AsyncSession = Depends(get_db)
):
    user = await admin_service.update_user(db, user_id, update_data)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.delete("/admins/{user_id}")
async def delete_admin(
    user_id: int,
    db: AsyncSession = Depends(get_db)
):
    success = await admin_service.delete_user(db, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Admin deleted successfully"}
