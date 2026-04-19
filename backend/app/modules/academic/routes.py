from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_admin
from app.models.academic import Grade, Section, SchoolClass, Subject
from app.models.core import User
from app.schemas.academic import (
    GradeCreate, GradeUpdate, GradeResponse,
    SectionCreate, SectionUpdate, SectionResponse,
    SchoolClassCreate, SchoolClassUpdate, SchoolClassResponse,
    SubjectCreate, SubjectUpdate, SubjectResponse
)

router = APIRouter(prefix="/api/academic", tags=["Academic Organization"])

# --- Class (Grade) Endpoints ---

@router.get("/classes", response_model=List[GradeResponse])
def get_classes(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Fetch all classes (Grades) for the user's institution."""
    return db.query(Grade).filter(Grade.institution_id == current_user.institution_id).order_by(Grade.level).all()

@router.post("/classes", response_model=GradeResponse, status_code=status.HTTP_201_CREATED)
def create_class(
    grade_in: GradeCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Create a new Class layer."""
    db_grade = Grade(**grade_in.model_dump(), institution_id=admin.institution_id)
    db.add(db_grade)
    db.commit()
    db.refresh(db_grade)
    return db_grade

@router.put("/classes/{class_id}", response_model=GradeResponse)
def update_class(
    class_id: int,
    grade_in: GradeUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    db_grade = db.query(Grade).filter(Grade.id == class_id).first()
    if not db_grade:
        raise HTTPException(status_code=404, detail="Class not found")
    
    update_data = grade_in.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(db_grade, k, v)
    
    db.commit()
    db.refresh(db_grade)
    return db_grade

@router.delete("/classes/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_class(
    class_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    db_grade = db.query(Grade).filter(Grade.id == class_id).first()
    if not db_grade:
        raise HTTPException(status_code=404, detail="Class not found")
    
    db.delete(db_grade)
    db.commit()

# --- Section Endpoints ---

@router.get("/sections", response_model=List[SectionResponse])
def get_sections(grade_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Fetch sections for the user's institution, optionally filtered by class."""
    query = db.query(Section).filter(Section.institution_id == current_user.institution_id)
    if grade_id:
        query = query.filter(Section.grade_id == grade_id)
    return query.order_by(Section.name).all()

@router.post("/sections", response_model=SectionResponse, status_code=status.HTTP_201_CREATED)
def create_section(
    section_in: SectionCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    db_grade = db.query(Grade).filter(Grade.id == section_in.grade_id, Grade.institution_id == admin.institution_id).first()
    if not db_grade:
        raise HTTPException(status_code=404, detail="Associated Class not found")

    db_section = Section(**section_in.model_dump(), institution_id=admin.institution_id)
    db.add(db_section)
    db.commit()
    db.refresh(db_section)
    return db_section

@router.put("/sections/{section_id}", response_model=SectionResponse)
def update_section(
    section_id: int,
    section_in: SectionUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    db_section = db.query(Section).filter(Section.id == section_id).first()
    if not db_section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    update_data = section_in.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(db_section, k, v)
    
    db.commit()
    db.refresh(db_section)
    return db_section

@router.delete("/sections/{section_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_section(
    section_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    db_section = db.query(Section).filter(Section.id == section_id).first()
    if not db_section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    db.delete(db_section)
    db.commit()

# --- Subjects Endpoints ---

@router.get("/subjects", response_model=List[SubjectResponse])
def get_subjects(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Subject).filter(Subject.institution_id == current_user.institution_id).all()

@router.post("/subjects", response_model=SubjectResponse)
def create_subject(
    subject_in: SubjectCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    db_subject = Subject(**subject_in.model_dump(), institution_id=admin.institution_id)
    db.add(db_subject)
    db.commit()
    db.refresh(db_subject)
    return db_subject

@router.put("/subjects/{subject_id}", response_model=SubjectResponse)
def update_subject(
    subject_id: int,
    subject_in: SubjectUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    db_subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not db_subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    
    update_data = subject_in.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(db_subject, k, v)
    
    db.commit()
    db.refresh(db_subject)
    return db_subject

@router.delete("/subjects/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subject(
    subject_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    db_subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not db_subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    db.delete(db_subject)
    db.commit()

# --- School Classes (Combination) Endpoints ---

@router.get("/school-classes", response_model=List[SchoolClassResponse])
def get_school_classes(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Fetch all unique School Classes for the user's institution."""
    return db.query(SchoolClass).filter(SchoolClass.institution_id == current_user.institution_id).all()

@router.post("/school-classes", response_model=SchoolClassResponse, status_code=status.HTTP_201_CREATED)
def create_school_class(
    class_in: SchoolClassCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    # Check if exists
    existing = db.query(SchoolClass).filter(
        SchoolClass.grade_id == class_in.grade_id,
        SchoolClass.section_id == class_in.section_id,
        SchoolClass.institution_id == admin.institution_id
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Class with this Grade and Section already exists")

    # Validate grade and section
    if not db.query(Grade).filter(Grade.id == class_in.grade_id, Grade.institution_id == admin.institution_id).first():
        raise HTTPException(status_code=404, detail="Grade not found")
    if not db.query(Section).filter(Section.id == class_in.section_id, Section.institution_id == admin.institution_id).first():
        raise HTTPException(status_code=404, detail="Section not found")

    db_class = SchoolClass(
        **class_in.model_dump(),
        institution_id=admin.institution_id
    )
    db.add(db_class)
    db.commit()
    db.refresh(db_class)
    return db_class

@router.delete("/school-classes/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_school_class(
    class_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    db_class = db.query(SchoolClass).filter(SchoolClass.id == class_id).first()
    if not db_class:
        raise HTTPException(status_code=404, detail="Class not found")
    
    db.delete(db_class)
    db.commit()
