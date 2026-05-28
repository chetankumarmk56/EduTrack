from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

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
    name: str = Form(..., min_length=1),
    slug: str = Form(..., min_length=1),
    is_active: bool = Form(True),
    logo: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a school. Accepts multipart/form-data so an optional logo image
    (PNG/JPG/JPEG/WEBP, ≤ 5 MB) can ride along with the basic fields.
    When no file is attached, the school is created normally and logo_url
    stays NULL.
    """
    inst_data = schemas.InstitutionCreate(name=name, slug=slug, is_active=is_active)
    # Treat an UploadFile with no filename (browsers sometimes send an empty
    # field) the same as "no file": the service-layer guard would 400 on it.
    logo_file = logo if (logo and logo.filename) else None
    inst = await admin_service.create_institution(db, inst_data, logo=logo_file)
    return await admin_service.serialize_institution(inst)

@router.get("/institutions", response_model=List[schemas.InstitutionResponse])
async def get_institutions(
    skip: int = 0, limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    insts = await admin_service.get_institutions(db, skip=skip, limit=limit)
    return [await admin_service.serialize_institution(i) for i in insts]

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
        base = await admin_service.serialize_institution(i)
        base["deleted_at"] = i.deleted_at
        base["days_until_purge"] = days_left
        out.append(base)
    return out

@router.get("/institutions/{inst_id}", response_model=schemas.InstitutionResponse)
async def get_institution(
    inst_id: int,
    db: AsyncSession = Depends(get_db)
):
    inst = await admin_service.get_institution(db, inst_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Institution not found")
    return await admin_service.serialize_institution(inst)

@router.put("/institutions/{inst_id}", response_model=schemas.InstitutionResponse)
async def update_institution(
    inst_id: int,
    name: Optional[str] = Form(None),
    slug: Optional[str] = Form(None),
    is_active: Optional[bool] = Form(None),
    logo: Optional[UploadFile] = File(None),
    remove_logo: bool = Form(False),
    db: AsyncSession = Depends(get_db),
):
    """
    Patch a school. Accepts multipart/form-data so the super-admin can
    change name / slug / active flag and optionally replace or remove
    the logo in the same request:
      * Attach a `logo` file → uploaded to storage, replaces logo_url.
      * Send `remove_logo=true` (no file) → logo_url cleared to NULL.
      * Send neither → existing logo is untouched.
    """
    # Build the patch only from fields the client actually sent so
    # absent fields don't overwrite stored values with None.
    patch: dict = {}
    if name is not None: patch["name"] = name
    if slug is not None: patch["slug"] = slug
    if is_active is not None: patch["is_active"] = is_active
    update_data = schemas.InstitutionUpdate(**patch)

    logo_file = logo if (logo and logo.filename) else None
    inst = await admin_service.update_institution(
        db, inst_id, update_data, logo=logo_file, remove_logo=remove_logo,
    )
    if not inst:
        raise HTTPException(status_code=404, detail="Institution not found")
    return await admin_service.serialize_institution(inst)

@router.post("/institutions/{inst_id}/activate", response_model=schemas.InstitutionResponse)
async def activate_institution(
    inst_id: int,
    db: AsyncSession = Depends(get_db)
):
    inst = await admin_service.toggle_institution_status(db, inst_id, True)
    if not inst:
        raise HTTPException(status_code=404, detail="Institution not found")
    return await admin_service.serialize_institution(inst)

@router.post("/institutions/{inst_id}/deactivate", response_model=schemas.InstitutionResponse)
async def deactivate_institution(
    inst_id: int,
    db: AsyncSession = Depends(get_db)
):
    inst = await admin_service.toggle_institution_status(db, inst_id, False)
    if not inst:
        raise HTTPException(status_code=404, detail="Institution not found")
    return await admin_service.serialize_institution(inst)

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
    return await admin_service.serialize_institution(inst)

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
