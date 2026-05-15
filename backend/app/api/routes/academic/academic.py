from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_admin, UserContext
from app.schemas.academic import (
    GradeCreate, GradeUpdate, GradeResponse,
    SectionCreate, SectionUpdate, SectionResponse,
    SchoolClassCreate, SchoolClassUpdate, SchoolClassResponse,
    SubjectCreate, SubjectUpdate, SubjectResponse
)
from app.services.academic import academic_service

router = APIRouter(prefix="/api/academic", tags=["Academic Organization"])

# --- Class (Grade) Endpoints ---

@router.get("/classes", response_model=List[GradeResponse])
async def get_classes(
    db: AsyncSession = Depends(get_db), 
    user: UserContext = Depends(get_current_user)
):
    return await academic_service.get_grades(db, user.institution_id)

@router.post("/classes", response_model=GradeResponse, status_code=status.HTTP_201_CREATED)
async def create_class(
    grade_in: GradeCreate,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin)
):
    return await academic_service.create_grade(db, admin.institution_id, grade_in)

@router.put("/classes/{class_id}", response_model=GradeResponse)
async def update_class(
    class_id: int,
    grade_in: GradeUpdate,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin)
):
    updated = await academic_service.update_grade(db, admin.institution_id, class_id, grade_in)
    if not updated:
        raise HTTPException(status_code=404, detail="Class not found")
    return updated

@router.delete("/classes/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_class(
    class_id: int,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin)
):
    success = await academic_service.delete_grade(db, admin.institution_id, class_id)
    if not success:
        raise HTTPException(status_code=404, detail="Class not found")

# --- Section Endpoints ---

@router.get("/sections", response_model=List[SectionResponse])
async def get_sections(
    grade_id: Optional[int] = None, 
    db: AsyncSession = Depends(get_db), 
    user: UserContext = Depends(get_current_user)
):
    return await academic_service.get_sections(db, user.institution_id, grade_id)

@router.post("/sections", response_model=SectionResponse, status_code=status.HTTP_201_CREATED)
async def create_section(
    section_in: SectionCreate,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin)
):
    db_section = await academic_service.create_section(db, admin.institution_id, section_in)
    if not db_section:
         raise HTTPException(status_code=404, detail="Associated Class not found")
    return db_section

@router.post("/sections/deploy", response_model=SectionResponse, status_code=status.HTTP_201_CREATED)
async def deploy_section(
    section_in: SectionCreate,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin)
):
    """Atomic endpoint to deploy a section and its scholastic mapping."""
    db_section = await academic_service.deploy_segment(db, admin.institution_id, section_in)
    if not db_section:
         raise HTTPException(status_code=404, detail="Associated Class not found")
    return db_section

@router.put("/sections/{section_id}", response_model=SectionResponse)
async def update_section(
    section_id: int,
    section_in: SectionUpdate,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin)
):
    updated = await academic_service.update_section(db, admin.institution_id, section_id, section_in)
    if not updated:
        raise HTTPException(status_code=404, detail="Section not found")
    return updated

@router.delete("/sections/{section_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_section(
    section_id: int,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin)
):
    success = await academic_service.delete_section(db, admin.institution_id, section_id)
    if not success:
        raise HTTPException(status_code=404, detail="Section not found")

# --- Subjects Endpoints ---

@router.get("/subjects", response_model=List[SubjectResponse])
async def get_subjects(
    db: AsyncSession = Depends(get_db), 
    user: UserContext = Depends(get_current_user)
):
    return await academic_service.get_subjects(db, user.institution_id)

@router.post("/subjects", response_model=SubjectResponse)
async def create_subject(
    subject_in: SubjectCreate,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin)
):
    return await academic_service.create_subject(db, admin.institution_id, subject_in)

@router.put("/subjects/{subject_id}", response_model=SubjectResponse)
async def update_subject(
    subject_id: int,
    subject_in: SubjectUpdate,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin)
):
    updated = await academic_service.update_subject(db, admin.institution_id, subject_id, subject_in)
    if not updated:
        raise HTTPException(status_code=404, detail="Subject not found")
    return updated

@router.delete("/subjects/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subject(
    subject_id: int,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin)
):
    success = await academic_service.delete_subject(db, admin.institution_id, subject_id)
    if not success:
        raise HTTPException(status_code=404, detail="Subject not found")

# --- School Classes (Combination) Endpoints ---

@router.get("/school-classes", response_model=List[SchoolClassResponse])
async def get_school_classes(
    db: AsyncSession = Depends(get_db), 
    user: UserContext = Depends(get_current_user)
):
    return await academic_service.get_school_classes(db, user.institution_id)

@router.post("/school-classes", response_model=SchoolClassResponse, status_code=status.HTTP_201_CREATED)
async def create_school_class(
    class_in: SchoolClassCreate,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin)
):
    try:
        return await academic_service.create_school_class(db, admin.institution_id, class_in)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/school-classes/{class_id}", response_model=SchoolClassResponse)
async def update_school_class(
    class_id: int,
    class_in: SchoolClassUpdate,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin)
):
    updated = await academic_service.update_school_class(db, admin.institution_id, class_id, class_in)
    if not updated:
        raise HTTPException(status_code=404, detail="Class not found")
    return updated

@router.delete("/school-classes/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_school_class(
    class_id: int,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin)
):
    success = await academic_service.delete_school_class(db, admin.institution_id, class_id)
    if not success:
        raise HTTPException(status_code=404, detail="Class not found")
