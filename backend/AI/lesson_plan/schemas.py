"""Pydantic schemas for the ID-based Lesson Plan AI flow."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


# ─── ID-based lesson plan ─────────────────────────────────────────────────────
def _strip_id(v: Any) -> str:
    if v is None:
        return ""
    return str(v).strip()


class ChapterIdentity(BaseModel):
    """The five IDs that pin a lesson plan to its S3 namespace."""

    school_id: str = Field(min_length=1, max_length=64)
    teacher_id: str = Field(min_length=1, max_length=64)
    grade_id: str = Field(min_length=1, max_length=64)
    subject_id: str = Field(min_length=1, max_length=64)
    chapter_id: str = Field(min_length=1, max_length=64)

    @field_validator(
        "school_id",
        "teacher_id",
        "grade_id",
        "subject_id",
        "chapter_id",
        mode="before",
    )
    @classmethod
    def _coerce(cls, v: Any) -> str:
        return _strip_id(v)


class LessonPlanMetadata(ChapterIdentity):
    """Persisted JSON envelope under `<scope>/metadata/metadata.json`.

    Path-relevant IDs stay in keys; human-readable labels and the
    pre-computed timetable session dates live in the body so the
    dashboard can render the calendar without re-querying the timetable.
    """

    number_of_classes: int = Field(default=12, ge=1, le=60)
    additional_info: str = ""
    resources: List[str] = Field(default_factory=list)

    # Display + scheduling context (optional for back-compat with older saves).
    chapter_name: Optional[str] = None
    grade_label: Optional[str] = None
    section_label: Optional[str] = None
    subject_label: Optional[str] = None
    start_date: Optional[str] = None  # ISO YYYY-MM-DD
    end_date: Optional[str] = None    # ISO YYYY-MM-DD
    session_dates: List[str] = Field(default_factory=list)  # one ISO date per class
    color_hue: Optional[int] = None   # 0–359, picked by frontend for legend


class ChapterListItem(BaseModel):
    """One row returned by ``GET /api/lesson-plan/chapters``."""

    metadata: LessonPlanMetadata
    lesson_plan: Optional["GeneratedLessonPlan"] = None
    has_output: bool = False
    last_modified: Optional[str] = None


# ─── Upload ──────────────────────────────────────────────────────────────────
class UploadResponse(BaseModel):
    resources: List[str]
    metadata_path: str


# ─── Generated lesson plan (read from S3 — external microservice produced it) ─
# Extensible via Pydantic ``extra="allow"``.
class HomeworkBlock(BaseModel):
    questions: List[str] = []
    estimated_time_minutes: Optional[int] = None


class LessonPlanTopic(BaseModel):
    topic_name: str
    subtopics: List[str] = []


class LessonPlanScheduleItem(BaseModel):
    class_number: int
    topics: List[LessonPlanTopic] = []
    learning_objectives: List[str] = []
    teacher_tip: Optional[str] = ""
    homework: Optional[HomeworkBlock] = None

    model_config = {"extra": "allow"}


class GeneratedLessonPlan(BaseModel):
    subject: str
    chapter_title: str
    academic_year: Optional[str] = None
    total_classes: int
    schedule: List[LessonPlanScheduleItem]

    model_config = {"extra": "allow"}


# ─── Read output ──────────────────────────────────────────────────────────────
class LessonPlanOutputResponse(BaseModel):
    output_path: str
    metadata: LessonPlanMetadata
    lesson_plan: GeneratedLessonPlan
    provider_meta: Dict[str, Any] = Field(default_factory=dict)


# Resolve the forward reference now that GeneratedLessonPlan is defined.
ChapterListItem.model_rebuild()


class ChapterListResponse(BaseModel):
    chapters: List[ChapterListItem]


class DeleteChapterResponse(BaseModel):
    deleted_keys: int
