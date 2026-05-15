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
    success = await admin_service.delete_institution(db, inst_id)
    if not success:
        raise HTTPException(status_code=404, detail="Institution not found")
    return {"message": "Institution deleted successfully"}

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
