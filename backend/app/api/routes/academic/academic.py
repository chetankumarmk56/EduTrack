import io
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_admin, UserContext
from app.schemas.academic import (
    GradeCreate, GradeUpdate, GradeResponse,
    SectionCreate, SectionUpdate, SectionResponse,
    SchoolClassCreate, SchoolClassUpdate, SchoolClassResponse,
    SubjectCreate, SubjectUpdate, SubjectResponse,
    AcademicYearResponse, PromotionPreviewRequest, PromotionPreviewResponse,
    PromotionExecuteRequest, PromotionExecuteSummary,
)
from app.services.academic import academic_service
from app.services.academic.academic_year_service import academic_year_service
from app.services.academic.promotion_service import promotion_service


class SectionBulkCreate(BaseModel):
    grade_id: int
    names: List[str] = Field(..., min_length=1)


class SectionBulkSkipped(BaseModel):
    name: str
    reason: str  # "already_exists" | "duplicate_in_request"


class SectionBulkInvalid(BaseModel):
    name: str
    reason: str  # "invalid_format"


class SectionBulkResponse(BaseModel):
    created: List[SectionResponse]
    skipped: List[SectionBulkSkipped]
    invalid: List[SectionBulkInvalid]
    rule: str


class GradeDependents(BaseModel):
    sections: int
    classrooms: int
    students: int
    teacher_assignments: int
    teachers: int
    timetable_slots: int

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


@router.get("/classes/{class_id}/dependents", response_model=GradeDependents)
async def get_class_dependents(
    class_id: int,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin),
):
    """Counts of cascading deletes — powers the confirmation modal."""
    data = await academic_service.get_grade_dependents(db, admin.institution_id, class_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Class not found")
    return data

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


@router.post(
    "/sections/deploy-bulk",
    response_model=SectionBulkResponse,
    status_code=status.HTTP_201_CREATED,
)
async def deploy_sections_bulk(
    payload: SectionBulkCreate,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin),
):
    """Create multiple sections (e.g. A, B, C, D) in one request.

    Skips names that already exist for the class and returns them so
    the admin sees a partial-success summary instead of an outright
    error.
    """
    result = await academic_service.deploy_segments_bulk(
        db, admin.institution_id, payload.grade_id, payload.names,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Associated Class not found")
    return result

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


# --- Academic Years & Year-End Promotion (admin only) ---

@router.get("/years", response_model=List[AcademicYearResponse])
async def list_academic_years(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
):
    return await academic_year_service.list_years(db, user.institution_id)


@router.post("/promotion/preview", response_model=PromotionPreviewResponse)
async def preview_promotion(
    payload: PromotionPreviewRequest = PromotionPreviewRequest(),
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin),
):
    """Dry-run: per-class students with overall %, arrears, and a default
    promote/retain decision. No writes."""
    return await promotion_service.preview_promotion(
        db, admin.institution_id, payload.retained_student_ids
    )


@router.get("/promotion/preview/export")
async def export_promotion_preview(
    format: str = Query("xlsx", pattern="^(xlsx|csv)$"),
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin),
):
    """Export the promotion preview for offline Principal/Admin sign-off."""
    preview = await promotion_service.preview_promotion(db, admin.institution_id, [])
    rows = _flatten_preview_rows(preview)
    label = (preview.get("active_year") or {}).get("label") or "current"
    fname = f"promotion-preview_{label}"

    if format == "csv":
        payload = _export_preview_csv(rows, preview)
        return StreamingResponse(
            io.BytesIO(payload),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{fname}.csv"'},
        )
    try:
        payload = _export_preview_xlsx(rows, preview)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return StreamingResponse(
        io.BytesIO(payload),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}.xlsx"'},
    )


@router.post("/promotion/execute", response_model=PromotionExecuteSummary)
async def execute_promotion(
    payload: PromotionExecuteRequest,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(require_admin),
):
    """Run the year-end promotion (transactional, idempotent)."""
    try:
        return await promotion_service.execute_promotion(
            db,
            admin.institution_id,
            retained_student_ids=payload.retained_student_ids,
            next_year_label=payload.next_year_label,
            performed_by_id=admin.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# --- Promotion preview export helpers ---

_EXPORT_HEADERS = [
    "Student Name", "Admission Number", "Current Class", "Current Section",
    "Overall %", "Promotion Decision", "Outstanding Arrears",
]


def _flatten_preview_rows(preview: dict) -> list[list]:
    """Flatten the per-class preview into export rows (7 columns each)."""
    out: list[list] = []
    for grp in preview.get("classes", []):
        for s in grp.get("students", []):
            out.append([
                s.get("name") or "",
                s.get("admission_number") or "",
                grp.get("class_name") or "",
                grp.get("section_name") or "",
                "" if s.get("overall_percentage") is None else s["overall_percentage"],
                s.get("decision") or "",
                s.get("arrears") or 0.0,
            ])
    for s in preview.get("unassigned", []):
        out.append([
            s.get("name") or "", s.get("admission_number") or "", "", "",
            "" if s.get("overall_percentage") is None else s["overall_percentage"],
            s.get("decision") or "", s.get("arrears") or 0.0,
        ])
    return out


def _export_preview_csv(rows: list[list], preview: dict) -> bytes:
    import csv
    buf = io.StringIO()
    writer = csv.writer(buf)
    year = (preview.get("active_year") or {}).get("label") or ""
    writer.writerow([f"Promotion Preview — {year} → {preview.get('next_year_label') or ''}"])
    writer.writerow([])
    writer.writerow(_EXPORT_HEADERS)
    for r in rows:
        writer.writerow(r)
    return buf.getvalue().encode("utf-8")


def _export_preview_xlsx(rows: list[list], preview: dict) -> bytes:
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font
    except ImportError:
        raise RuntimeError(
            "openpyxl is required for Excel exports. Install with: pip install openpyxl"
        )
    wb = Workbook()
    ws = wb.active
    ws.title = "Promotion Preview"
    header_row = ws.append
    header_row(_EXPORT_HEADERS)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
