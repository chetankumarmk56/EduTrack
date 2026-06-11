from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import date

class GradeBase(BaseModel):
    level: int
    name: str
    tuition_fee: float = 0.0
    fee_due_date: Optional[date] = None

class GradeCreate(GradeBase):
    pass

class GradeUpdate(BaseModel):
    level: Optional[int] = None
    name: Optional[str] = None
    tuition_fee: Optional[float] = None
    fee_due_date: Optional[date] = None

class GradeResponse(GradeBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class SectionBase(BaseModel):
    name: str

class SectionCreate(SectionBase):
    grade_id: int

class SectionUpdate(BaseModel):
    name: Optional[str] = None
    grade_id: Optional[int] = None

class SectionResponse(SectionBase):
    id: int
    grade_id: int
    model_config = ConfigDict(from_attributes=True)

class SubjectBase(BaseModel):
    name: str
    code: str

class SubjectCreate(SubjectBase):
    pass

class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None

class SubjectResponse(SubjectBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class SchoolClassBase(BaseModel):
    display_name: Optional[str] = None
    room_number: Optional[str] = None
    tuition_fee: float = 0.0
    other_fee: float = 0.0
    total_fee: float = 0.0
    fee_due_date: Optional[date] = None

class SchoolClassCreate(SchoolClassBase):
    grade_id: int
    section_id: int

class SchoolClassUpdate(BaseModel):
    display_name: Optional[str] = None
    room_number: Optional[str] = None
    grade_id: Optional[int] = None
    section_id: Optional[int] = None
    tuition_fee: Optional[float] = None
    other_fee: Optional[float] = None
    fee_due_date: Optional[date] = None

class SchoolClassResponse(SchoolClassBase):
    id: int
    grade: GradeResponse
    section: SectionResponse
    model_config = ConfigDict(from_attributes=True)


# ── Academic year + promotion ───────────────────────────────────────────────

class AcademicYearResponse(BaseModel):
    id: int
    label: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: bool
    status: str
    model_config = ConfigDict(from_attributes=True)


class PromotionPreviewRequest(BaseModel):
    # Students the admin has chosen to hold back. Used to re-render the
    # preview totals; echoed into execute unchanged.
    retained_student_ids: List[int] = []


class PromotionExecuteRequest(BaseModel):
    retained_student_ids: List[int] = []
    # Defaults to the April–March successor of the active year when omitted.
    next_year_label: Optional[str] = None


class PromotionStudentRow(BaseModel):
    student_id: int
    name: Optional[str] = None
    admission_number: Optional[str] = None
    roll_number: Optional[int] = None
    overall_percentage: Optional[float] = None
    arrears: float = 0.0
    decision: str


class PromotionClassGroup(BaseModel):
    school_class_id: int
    class_name: Optional[str] = None
    grade_id: Optional[int] = None
    grade_level: Optional[int] = None
    section_name: Optional[str] = None
    is_top_grade: bool = False
    target_class_name: Optional[str] = None
    will_create_target: bool = False
    student_count: int = 0
    class_overall_percentage: Optional[float] = None
    students: List[PromotionStudentRow] = []


class PromotionTotals(BaseModel):
    students: int = 0
    promote: int = 0
    retain: int = 0
    graduate: int = 0
    unassigned: int = 0


class PromotionYearRef(BaseModel):
    id: int
    label: str


class PromotionPreviewResponse(BaseModel):
    active_year: Optional[PromotionYearRef] = None
    next_year_label: Optional[str] = None
    already_promoted: bool = False
    totals: PromotionTotals
    auto_create_classes: List[str] = []
    classes: List[PromotionClassGroup] = []
    unassigned: List[PromotionStudentRow] = []


class PromotionExecuteSummary(BaseModel):
    from_year: Optional[PromotionYearRef] = None
    to_year: Optional[PromotionYearRef] = None
    promoted: int = 0
    retained: int = 0
    graduated: int = 0
    skipped: int = 0
    created_classes: List[str] = []
    already_promoted: bool = False
