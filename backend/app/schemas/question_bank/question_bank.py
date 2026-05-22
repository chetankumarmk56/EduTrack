"""Pydantic schemas for the Question Bank Generator module.

All wire types live here so the OpenAI provider, the external AI
microservice (S3 flow), and FastAPI routes share a single contract.

The S3 + microservice flow uses the **flat** contract:

    {
      "subject": "Mathematics",
      "grade": "Grade 10",
      "chapter": "Force and Laws of Motion",
      "focus_topic": "Newton's Second Law of Motion",
      "focus_percentage": 40,
      "focus_questions": null,
      "language": "English",
      "number_of_questions": 20,
      "total_marks": 40,
      "extra_instructions": ""
    }

Generation logic (enforced by the microservice, mirrored here for the UI):

* ``focus_questions`` — if provided, that exact number of questions comes
  from ``focus_topic``.
* ``focus_percentage`` — used only when ``focus_questions`` is null;
  ``round(number_of_questions * focus_percentage / 100)`` questions come
  from ``focus_topic``.
* Both null — generate a normal chapter-wide bank.
"""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

QuestionType = Literal["mcq", "short", "long"]
Difficulty = Literal["Easy", "Medium", "Hard"]


class QuestionSpec(BaseModel):
    """A single (type, difficulty, count) bucket the teacher asked for."""

    type: QuestionType
    difficulty: Difficulty
    count: int = Field(ge=0, le=50)

    @field_validator("difficulty", mode="before")
    @classmethod
    def _normalize_difficulty(cls, v: str) -> str:
        if isinstance(v, str):
            return v.strip().capitalize()
        return v


class GenerateRequest(BaseModel):
    topics: str = Field(min_length=1, max_length=2000)
    content: str = Field(default="", max_length=40_000)
    subject: str = Field(default="General", max_length=120)
    specs: List[QuestionSpec]

    @field_validator("specs")
    @classmethod
    def _at_least_one_question(cls, v: List[QuestionSpec]) -> List[QuestionSpec]:
        if sum(s.count for s in v) <= 0:
            raise ValueError("Specs must request at least one question in total.")
        if sum(s.count for s in v) > 100:
            raise ValueError("Cannot request more than 100 questions at once.")
        return v


class Question(BaseModel):
    id: str
    type: QuestionType
    difficulty: Difficulty
    marks: int = Field(ge=1, le=20)
    question: str
    options: Optional[List[str]] = None
    answer: str
    explanation: str = ""

    @field_validator("difficulty", mode="before")
    @classmethod
    def _normalize_difficulty(cls, v: str) -> str:
        if isinstance(v, str):
            return v.strip().capitalize()
        return v


class GenerateResponse(BaseModel):
    questions: List[Question]
    metadata: dict


class ParseFileResponse(BaseModel):
    content: str
    filename: str
    chars: int


class ExportPDFRequest(BaseModel):
    questions: List[Question]
    subject: str = "General"
    filename: Optional[str] = "QuestionBank.pdf"
    is_answer_key: bool = False


# ─── ID-based question bank (S3 + external microservice flow) ────────────────
def _strip_id(v: Any) -> str:
    if v is None:
        return ""
    return str(v).strip()


class QuestionBankIdentity(BaseModel):
    """The five IDs that pin a question bank to its S3 namespace."""

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


class QuestionBankMetadata(QuestionBankIdentity):
    """Persisted JSON envelope under ``<scope>/metadata/metadata.json``.

    The five IDs anchor the S3 prefix; the rest is the **flat** form
    payload the external AI microservice consumes.
    """

    # ── Microservice contract fields (mirrored as-is in metadata.json) ──
    subject: str = Field(min_length=1, max_length=200)
    grade: str = Field(min_length=1, max_length=120)
    chapter: str = Field(min_length=1, max_length=300)
    focus_topic: Optional[str] = Field(default=None, max_length=300)
    focus_percentage: Optional[int] = Field(default=None, ge=0, le=100)
    focus_questions: Optional[int] = Field(default=None, ge=0, le=200)
    language: str = Field(default="English", max_length=64)
    number_of_questions: int = Field(ge=1, le=200)
    total_marks: int = Field(ge=1, le=2000)
    extra_instructions: str = ""

    # ── Internal-only bookkeeping (microservice ignores unknown keys) ───
    resources: List[str] = Field(default_factory=list)

    @field_validator("language", mode="before")
    @classmethod
    def _normalize_language(cls, v: Any) -> Any:
        if v is None or (isinstance(v, str) and not v.strip()):
            return "English"
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("subject", "grade", "chapter", mode="before")
    @classmethod
    def _strip_required_strings(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("focus_topic", mode="before")
    @classmethod
    def _normalize_focus_topic(cls, v: Any) -> Any:
        # Empty string from the form should round-trip as null so the
        # microservice's "no focus topic" branch triggers cleanly.
        if isinstance(v, str):
            stripped = v.strip()
            return stripped or None
        return v

    @field_validator("extra_instructions", mode="before")
    @classmethod
    def _normalize_extra_instructions(cls, v: Any) -> Any:
        if v is None:
            return ""
        if isinstance(v, str):
            return v.strip()
        return v

    @model_validator(mode="after")
    def _enforce_focus_rules(self) -> "QuestionBankMetadata":
        """Enforce the focus_topic / focus_questions / focus_percentage rules.

        * No ``focus_topic`` ⇒ neither ``focus_questions`` nor
          ``focus_percentage`` may be set (otherwise the inputs are
          contradictory).
        * With a ``focus_topic`` the teacher must supply *exactly one* of
          ``focus_questions`` or ``focus_percentage``. Supplying both is
          rejected here so the microservice never has to guess which
          takes priority.
        """
        has_topic = bool(self.focus_topic)
        has_count = self.focus_questions is not None
        has_pct = self.focus_percentage is not None

        if not has_topic and (has_count or has_pct):
            raise ValueError(
                "focus_questions and focus_percentage can only be used when "
                "a focus_topic is provided."
            )
        if has_topic and has_count and has_pct:
            raise ValueError(
                "Choose either focus_questions or focus_percentage, not both."
            )
        return self


class QuestionBankUploadResponse(BaseModel):
    resources: List[str]
    metadata_path: str


# ─── Generated question bank (read from S3 — external microservice produced) ─
class GeneratedQuestion(BaseModel):
    """One question in the generated bank.

    Looser than :class:`Question` because the external microservice may
    include richer optional fields (numerical solution steps, diagram
    pointers, multilingual variants). ``extra="allow"`` keeps unknown
    keys round-tripping cleanly.

    Diagram fields:
    * ``diagram_required`` — the microservice signals the teacher should
      attach an image (e.g. for geometry questions). The frontend shows
      an upload widget only when this is true.
    * ``diagram_image_key`` — S3 key of the teacher-uploaded image,
      stored under ``<scope>/output/diagrams/``. Resolved to a streaming
      URL via :py:meth:`/api/question-bank/diagram` at view time.
    """

    id: Optional[str] = None
    type: Optional[str] = None
    difficulty: Optional[str] = None
    bloom_level: Optional[str] = None
    marks: Optional[int] = None
    question: str
    options: Optional[List[str]] = None
    answer: Optional[str] = None
    explanation: Optional[str] = ""
    diagram_required: Optional[bool] = None
    diagram_image_key: Optional[str] = None

    model_config = {"extra": "allow"}


class GeneratedQuestionBank(BaseModel):
    """The full question bank JSON returned by the AI microservice.

    Matches the flat contract: a single ``questions[]`` array plus the
    same identifying fields the metadata carried in.
    """

    subject: Optional[str] = None
    grade: Optional[str] = None
    chapter: Optional[str] = None
    focus_topic: Optional[str] = None
    focus_percentage: Optional[int] = None
    focus_questions: Optional[int] = None
    language: Optional[str] = None
    number_of_questions: Optional[int] = None
    total_marks: Optional[int] = None
    questions: List[GeneratedQuestion] = Field(default_factory=list)

    model_config = {"extra": "allow"}


class QuestionBankOutputResponse(BaseModel):
    output_path: str
    metadata: QuestionBankMetadata
    question_bank: GeneratedQuestionBank
    provider_meta: Dict[str, Any] = Field(default_factory=dict)


class QuestionBankMetadataUpdate(BaseModel):
    """Editable header fields the teacher can change on the Result page.

    All optional so the frontend can patch one field at a time. The
    server merges these into the stored ``metadata.json`` before saving,
    so the same focus_topic / focus_questions / focus_percentage rules
    enforced on the initial save also apply to edits.
    """

    subject: Optional[str] = Field(default=None, max_length=200)
    grade: Optional[str] = Field(default=None, max_length=120)
    chapter: Optional[str] = Field(default=None, max_length=300)
    focus_topic: Optional[str] = Field(default=None, max_length=300)
    focus_percentage: Optional[int] = Field(default=None, ge=0, le=100)
    focus_questions: Optional[int] = Field(default=None, ge=0, le=200)
    language: Optional[str] = Field(default=None, max_length=64)
    number_of_questions: Optional[int] = Field(default=None, ge=1, le=200)
    total_marks: Optional[int] = Field(default=None, ge=1, le=2000)
    extra_instructions: Optional[str] = None


class SaveQuestionBankRequest(QuestionBankIdentity):
    """Teacher-edited question bank pushed back to S3.

    ``metadata`` patches the stored ``metadata.json`` header (any field
    not supplied is left untouched). ``question_bank`` overwrites the
    output JSON.
    """

    metadata: Optional[QuestionBankMetadataUpdate] = None
    question_bank: GeneratedQuestionBank


class DiagramUploadResponse(BaseModel):
    """Result of uploading a diagram image for a single question."""

    key: str
    question_id: Optional[str] = None
    content_type: str
    size_bytes: int


class QuestionBankListItem(BaseModel):
    metadata: QuestionBankMetadata
    question_bank: Optional[GeneratedQuestionBank] = None
    has_output: bool = False
    last_modified: Optional[str] = None


class QuestionBankListResponse(BaseModel):
    chapters: List[QuestionBankListItem]


class DeleteQuestionBankResponse(BaseModel):
    deleted_keys: int
