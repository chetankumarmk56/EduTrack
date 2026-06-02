"""In-process Question Bank generator.

Ported from the standalone ``question-bank-microservice`` (its
``app/openai_service.py`` + ``app/schemas/s3_payload.py`` + ``app/utils``
+ ``app/constants.py``), minus the boto3/S3 layer — the orchestration
service (:mod:`AI.question_bank.service`) reads the PDF and persists the
output through the shared storage abstraction, so this module only does
the deterministic + LLM work:

    metadata (dict) + pdf bytes  →  flat question-bank output (dict)

Keeping the generation logic free of I/O is what makes the package easy
to lift back out into a microservice: wrap :func:`generate_question_bank`
in an HTTP handler and add an S3 reader/writer around it.

The OpenAI client is created lazily so importing this module never fails
when ``OPENAI_API_KEY`` is unset (the route layer still mounts; only an
actual generate call raises).
"""
from __future__ import annotations

import copy
import json
import logging
from base64 import b64encode
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from AI.config import ai_settings

logger = logging.getLogger(__name__)

# ── Generation constants (ported from the microservice) ──────────────────────
DEFAULT_NUMBER_OF_QUESTIONS = 20
DEFAULT_TOTAL_MARKS = 40

SUPPORTED_QUESTION_TYPES = [
    "mcq",
    "short_answer",
    "long_answer",
    "true_false",
    "fill_in_the_blank",
    "match_the_following",
    "numerical",
    "diagram_based",
]

# Short aliases the main app may send → canonical names used in prompt/schema.
_QUESTION_TYPE_ALIASES: dict[str, str] = {
    "short": "short_answer",
    "long": "long_answer",
    "true/false": "true_false",
    "fill_blank": "fill_in_the_blank",
    "match": "match_the_following",
}


# ── Generation-time schemas (independent of the wire/storage schemas) ─────────
class GenerationMetadata(BaseModel):
    """Metadata as the generator needs it.

    Reads the ``metadata.json`` the main app wrote to S3. ``extra="ignore"``
    drops the bookkeeping keys (school_id, resources, …) the generator does
    not care about, while the validators below accept the main app's label
    aliases so the same metadata document feeds both layers.
    """

    model_config = ConfigDict(extra="ignore")

    subject: str
    grade: str
    chapter: str

    # Focus controls: focus_questions takes priority over focus_percentage.
    focus_topic: Optional[str] = None
    focus_percentage: Optional[int] = Field(default=None, ge=0, le=100)
    focus_questions: Optional[int] = Field(default=None, ge=0)

    language: str = "English"
    number_of_questions: int = Field(default=DEFAULT_NUMBER_OF_QUESTIONS, ge=1, le=200)
    total_marks: int = Field(default=DEFAULT_TOTAL_MARKS, ge=1, le=1000)

    board: Optional[str] = None
    difficulty: str = "mixed"
    question_types: list[str] = Field(
        default_factory=lambda: SUPPORTED_QUESTION_TYPES.copy()
    )

    include_diagrams: bool = True
    include_equations: bool = True

    extra_instructions: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def _normalize_main_app_fields(cls, values):
        if not isinstance(values, dict):
            return values

        if not values.get("subject") and values.get("subject_label"):
            values["subject"] = values["subject_label"]
        if not values.get("grade") and values.get("grade_label"):
            values["grade"] = values["grade_label"]
        if not values.get("chapter") and values.get("chapter_name"):
            values["chapter"] = values["chapter_name"]

        if "extra_instructions" not in values and "additional_instructions" in values:
            raw = (values.get("additional_instructions") or "").strip()
            values["extra_instructions"] = raw or None

        if "number_of_questions" not in values and values.get("question_count"):
            values["number_of_questions"] = int(values["question_count"])

        if values.get("question_types"):
            values["question_types"] = [
                _QUESTION_TYPE_ALIASES.get(qt, qt) for qt in values["question_types"]
            ]

        return values


class QuestionItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question_number: int
    question_type: str
    difficulty: str
    bloom_level: str

    question: str
    options: list[str] | None = None
    answer: str
    explanation: str
    marks: int

    solution_steps: list[str] | None = None
    diagram_required: bool = False
    diagram_description: str | None = None


class _QuestionBankOpenAIResponse(BaseModel):
    """Shape requested from OpenAI — just the questions array.

    Every other output field is echoed from metadata by this module so
    the model cannot drift the contract values.
    """

    model_config = ConfigDict(extra="forbid")

    questions: list[QuestionItem]


# ── OpenAI client (lazy) ──────────────────────────────────────────────────────
_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    api_key = ai_settings.question_bank_api_key
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY (or QUESTION_BANK_OPENAI_API_KEY) is not configured. "
            "Set it in backend/.env to enable Question Bank generation."
        )
    from openai import OpenAI

    _client = OpenAI(api_key=api_key)
    return _client


def _bytes_to_pdf_data_url(pdf_bytes: bytes) -> str:
    encoded = b64encode(pdf_bytes).decode("ascii")
    return f"data:application/pdf;base64,{encoded}"


def _to_openai_strict_schema(schema: dict) -> dict:
    """Post-process a pydantic JSON schema for OpenAI strict structured output.

    Strict mode requires every declared property in ``required`` (even
    nullable ones) and ``additionalProperties: false`` on every object.
    Pydantic omits Optional fields from ``required``, which silently breaks
    the call, so we patch the schema here.
    """
    schema = copy.deepcopy(schema)

    def fix(node: dict) -> dict:
        if not isinstance(node, dict):
            return node
        if "properties" in node:
            node["required"] = list(node["properties"].keys())
            node["additionalProperties"] = False
            node["properties"] = {k: fix(v) for k, v in node["properties"].items()}
        if "anyOf" in node:
            node["anyOf"] = [fix(x) for x in node["anyOf"]]
        if "allOf" in node:
            node["allOf"] = [fix(x) for x in node["allOf"]]
        if node.get("type") == "array" and "items" in node:
            node["items"] = fix(node["items"])
        return node

    if "$defs" in schema:
        schema["$defs"] = {k: fix(v) for k, v in schema["$defs"].items()}
    return fix(schema)


def _resolve_focus_counts(metadata: GenerationMetadata) -> tuple[int, int]:
    """Return (focus_count, non_focus_count) summing to number_of_questions.

    Priority: focus_questions > focus_percentage > none.
    """
    total = metadata.number_of_questions
    if not metadata.focus_topic:
        return 0, total

    if metadata.focus_questions is not None:
        focus = min(max(metadata.focus_questions, 0), total)
    elif metadata.focus_percentage is not None:
        focus = max(0, min(total, round(total * metadata.focus_percentage / 100)))
    else:
        return 0, total

    return focus, total - focus


def _focus_instructions(metadata: GenerationMetadata) -> str:
    focus_count, non_focus_count = _resolve_focus_counts(metadata)
    total = metadata.number_of_questions

    if not metadata.focus_topic or focus_count == 0:
        return (
            f"- Distribute all {total} questions across the chapter '{metadata.chapter}' "
            "with a balanced spread of sub-topics. No single sub-topic should dominate."
        )

    return (
        f"- Generate exactly {focus_count} questions that focus on '{metadata.focus_topic}' "
        f"within the chapter '{metadata.chapter}'.\n"
        f"- Generate the remaining {non_focus_count} questions from the rest of the chapter "
        "with a balanced spread.\n"
        "- Order questions so the focus questions are interleaved naturally with the others, "
        "not all clustered together."
    )


def _subject_specific_instructions(metadata: GenerationMetadata) -> str:
    subject = (metadata.subject or "").lower().strip()
    language = (metadata.language or "English").strip()

    instructions: list[str] = [
        f"Write all human-readable content in {language}. Keep JSON keys in English.",
        "When the PDF contains diagrams, charts, graphs, maps, tables, or labeled figures, "
        "create diagram-based questions and set diagram_required=true with a clear diagram_description.",
        "If the PDF shows equations, formulas, or stepwise working, preserve that context and "
        "create fresh practice questions based on it.",
        "Return only valid JSON that matches the schema. No markdown. No code fences.",
    ]

    if any(term in subject for term in ["math", "maths", "mathematics"]):
        instructions.extend(
            [
                "For mathematics, generate fresh numerical, algebraic, geometry, and word-problem questions — "
                "not just paraphrases of the source.",
                "Create new equations where appropriate and include solution_steps for multi-step problems.",
            ]
        )
    elif any(term in subject for term in ["science", "physics", "chemistry", "biology"]):
        instructions.extend(
            [
                "For science subjects, include conceptual questions and diagram-based questions whenever the PDF suggests them.",
                "If the topic benefits from labeling or observation, create diagram-based items with diagram_description.",
            ]
        )
    else:
        instructions.append(
            "Create a balanced mix of recall, understanding, application, and higher-order thinking questions suitable for the grade."
        )

    if metadata.include_equations:
        instructions.append("Include equation-based or formula-based questions whenever appropriate for the subject.")
    if metadata.include_diagrams:
        instructions.append("Prefer diagram-based questions when the source PDF or subject naturally supports them.")

    if metadata.extra_instructions:
        instructions.append(f"Extra instructions from the user: {metadata.extra_instructions}")

    return "\n".join(f"- {line}" for line in instructions)


def build_question_bank_prompt(metadata: GenerationMetadata) -> str:
    total = metadata.number_of_questions
    total_marks = metadata.total_marks
    allowed_types = ", ".join(metadata.question_types) if metadata.question_types else "all supported types"

    return f"""
You are an expert curriculum and assessment designer.

Generate a question bank from the uploaded PDF and the metadata below.

Metadata:
{json.dumps(metadata.model_dump(), indent=2, ensure_ascii=False)}

Counting rules:
- Generate exactly {total} questions in a single flat array, numbered 1..{total}.
- The sum of `marks` across all questions must equal {total_marks}.
- Use only these question_type values: {allowed_types}.
- Use the difficulty hint '{metadata.difficulty}' (use the literal "mixed" by varying across easy/medium/hard for items).

Focus rules:
{_focus_instructions(metadata)}

Content rules:
- Use the PDF as the primary source of facts and diagrams.
- For mathematics or numerical problems, invent fresh values where helpful — do not just copy the source.
- For diagram questions, set diagram_required=true and write a precise diagram_description.
- Each question_number must be unique and start from 1.

Subject and language rules:
{_subject_specific_instructions(metadata)}

Schema requirements:
- Each question must contain: question_number, question_type, difficulty, bloom_level,
  question, answer, explanation, marks.
- For MCQs, include options (4 choices recommended).
- For multi-step problems, include solution_steps as a list of strings.
- For diagram questions, set diagram_required=true and include diagram_description.
- Use the language requested in the metadata for all question text, options, answers, and explanations.
- Return only JSON matching the schema. No prose. No markdown.
""".strip()


def _generate_questions_from_pdf(
    metadata: GenerationMetadata,
    pdf_bytes: bytes,
) -> list[QuestionItem]:
    """Call OpenAI with the PDF + metadata and return the flat questions array."""
    pdf_data_url = _bytes_to_pdf_data_url(pdf_bytes)
    prompt = build_question_bank_prompt(metadata)
    openai_schema = _to_openai_strict_schema(_QuestionBankOpenAIResponse.model_json_schema())

    client = _get_client()
    model = ai_settings.question_bank_model

    focus_count, non_focus_count = _resolve_focus_counts(metadata)
    logger.info(
        "OpenAI QB call: model=%s subject=%s grade=%s chapter=%s n=%d marks=%d "
        "focus_topic=%s focus=%d non_focus=%d lang=%s",
        model,
        metadata.subject,
        metadata.grade,
        metadata.chapter,
        metadata.number_of_questions,
        metadata.total_marks,
        metadata.focus_topic,
        focus_count,
        non_focus_count,
        metadata.language,
    )

    response = client.responses.create(
        model=model,
        input=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_file",
                        "filename": "source.pdf",
                        "file_data": pdf_data_url,
                    },
                    {
                        "type": "input_text",
                        "text": prompt,
                    },
                ],
            }
        ],
        text={
            "format": {
                "type": "json_schema",
                "name": "question_bank_questions",
                "schema": openai_schema,
                "strict": True,
            }
        },
    )

    raw = response.output_text
    if not raw:
        raise RuntimeError("OpenAI returned empty output")

    logger.info("OpenAI QB response received: %d characters", len(raw))

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.exception("OpenAI returned invalid JSON")
        raise RuntimeError("OpenAI returned invalid JSON") from exc

    return _QuestionBankOpenAIResponse.model_validate(parsed).questions


def generate_question_bank(
    *,
    metadata_dict: dict,
    pdf_bytes: bytes,
    source: dict | None = None,
) -> dict:
    """Generate a question bank and return the **flat output payload** (dict).

    The shape matches what the external microservice returned inline and
    what :meth:`AI.question_bank.service.QuestionBankAIService._parse_output_payload`
    expects: the echoed metadata header plus a flat ``questions[]`` array.

    Raises ``RuntimeError`` when OpenAI is unconfigured or returns nothing
    usable; the caller maps these to HTTP errors.
    """
    metadata = GenerationMetadata.model_validate(metadata_dict)
    questions = _generate_questions_from_pdf(metadata, pdf_bytes)
    if not questions:
        raise RuntimeError("OpenAI returned no questions")

    output: dict = {
        "subject": metadata.subject,
        "grade": metadata.grade,
        "chapter": metadata.chapter,
        "focus_topic": metadata.focus_topic,
        "focus_percentage": metadata.focus_percentage,
        "focus_questions": metadata.focus_questions,
        "language": metadata.language,
        "number_of_questions": metadata.number_of_questions,
        "total_marks": metadata.total_marks,
        "questions": [q.model_dump(mode="json") for q in questions],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    if source:
        output["source"] = source
    return output


__all__ = ["generate_question_bank", "GenerationMetadata"]
