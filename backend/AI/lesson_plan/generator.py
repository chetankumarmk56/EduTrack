"""In-process Lesson Plan generator.

Ported from the standalone planner script (``New folder/final_planner.py``).
The original read a PDF/zip from disk; here the orchestration service
(:mod:`AI.lesson_plan.service`) reads the uploaded resources from S3 and
extracts their text with the shared
:func:`app.services.file_parsing.extract_text`, then hands the combined
``chapter_text`` to :func:`generate_lesson_plan`. Keeping this module free
of I/O is what makes it easy to lift back out into a microservice.

The pydantic models below define the strict output contract and are the
same shape as :class:`AI.lesson_plan.schemas.GeneratedLessonPlan`, so the
generated dict round-trips through the storage + response layers
unchanged.

The OpenAI client is created lazily so importing this module never fails
when ``OPENAI_API_KEY`` is unset.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from AI.config import ai_settings

logger = logging.getLogger(__name__)


# ── Output contract (ported verbatim) ────────────────────────────────────────
class TopicCoverage(BaseModel):
    topic_name: str = Field(..., description="Main topic name as it appears in the chapter")
    subtopics: list[str] = Field(default_factory=list)

    @field_validator("topic_name")
    @classmethod
    def topic_name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("topic_name cannot be empty")
        return v.strip()

    @field_validator("subtopics")
    @classmethod
    def clean_subtopics(cls, v: list[str]) -> list[str]:
        return [s.strip() for s in v if s.strip()]


class HomeworkPlan(BaseModel):
    questions: list[str] = Field(..., min_length=1)
    estimated_time_minutes: int = Field(..., ge=5, le=120)

    @field_validator("questions")
    @classmethod
    def clean_questions(cls, v: list[str]) -> list[str]:
        cleaned = [q.strip() for q in v if q.strip()]
        if not cleaned:
            raise ValueError("At least one homework question is required")
        return cleaned


class ClassPlan(BaseModel):
    class_number: int = Field(..., ge=1)
    topics: list[TopicCoverage] = Field(..., min_length=1)
    learning_objectives: list[str] = Field(..., min_length=1)
    teacher_tip: str
    homework: HomeworkPlan

    @field_validator("learning_objectives")
    @classmethod
    def clean_objectives(cls, v: list[str]) -> list[str]:
        cleaned = [o.strip() for o in v if o.strip()]
        if not cleaned:
            raise ValueError("At least one learning objective is required")
        return cleaned

    @field_validator("teacher_tip")
    @classmethod
    def tip_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("teacher_tip cannot be empty")
        return v.strip()


class AcademicSchedule(BaseModel):
    subject: str
    chapter_title: str
    academic_year: str
    total_classes: int
    schedule: list[ClassPlan]

    @model_validator(mode="after")
    def validate_schedule_integrity(self) -> "AcademicSchedule":
        if len(self.schedule) != self.total_classes:
            raise ValueError(
                f"Expected {self.total_classes} class plans, got {len(self.schedule)}"
            )
        for i, plan in enumerate(self.schedule, start=1):
            if plan.class_number != i:
                raise ValueError(
                    f"class_number mismatch at position {i}: got {plan.class_number}"
                )
        return self


SYSTEM_PROMPT = """
You are an elite academic curriculum designer, instructional strategist,
and master classroom teacher with 20+ years of experience designing
high-quality school lesson plans.

Your outputs are used directly by real teachers in classrooms.

You specialize in:
- pedagogically sound lesson sequencing
- age-appropriate explanation strategies
- realistic classroom pacing
- activity-integrated teaching
- misconception handling
- engagement-focused delivery
- practical homework design
- deep concept scaffolding

You NEVER generate shallow, generic, compressed, placeholder,
or repetitive educational content.

You produce highly detailed, classroom-ready instructional plans
grounded strictly in the provided textbook content.

You respond ONLY with valid JSON.
No markdown.
No explanations.
No surrounding text.
"""


def build_prompt(
    subject: str,
    academic_year: str,
    num_classes: int,
    chapter_text: str,
    additional_info: str = "",
) -> str:
    extra_block = ""
    if additional_info and additional_info.strip():
        extra_block = (
            "\nADDITIONAL TEACHER INSTRUCTIONS (honor these where they do not "
            "conflict with the rules below):\n"
            f"{additional_info.strip()}\n"
        )

    return f"""
Design a complete class-by-class academic schedule for the chapter below.

INPUTS:
- Subject: {subject}
- Academic Year / Student Age Group: {academic_year}
- Number of 60-minute classes: {num_classes}
{extra_block}
TEXTBOOK CHAPTER CONTENT:

===CHAPTER TEXT START===
{chapter_text}
===CHAPTER TEXT END===


INTERNAL PREPARATION — perform internally before generating output:
1. Read the entire chapter carefully.
2. Identify every:
   - topic
   - subtopic
   - definition
   - formula
   - theorem
   - law
   - diagram
   - activity
   - worked example
   - experiment
   - exercise
   - classification
   - process
   - application
3. Organize concepts from foundational to advanced.
4. Group tightly related concepts into logical classroom sessions.
5. Balance cognitive load across classes.
6. Ensure each class realistically fills a 60-minute session.
7. Avoid extremely shallow classes unless the chapter itself is highly dense.
8. Distribute difficult concepts across the schedule rather than clustering them together.
9. Internally estimate realistic teaching time for explanation, examples, interaction,
   practice, and recap.
10. Ensure textbook activities are embedded naturally into relevant concept teaching.
11. Think like a real experienced teacher preparing actual classroom sessions,
    not like an AI summarizing text.


INTERNAL CLASS PACING GUIDELINES:
Internally structure each class approximately as:
- 5 minutes recap/warm-up
- 35–40 minutes concept teaching
- 10–15 minutes examples, activities, experiments, or interaction
- 5 minutes homework explanation and closure

Do not output this pacing structure explicitly unless naturally relevant.


OUTPUT REQUIREMENTS:
Return exactly ONE valid JSON object.

The JSON object must contain these top-level fields:

subject
  String.
  Must exactly match the provided subject.

chapter_title
  String.
  Extract the exact chapter title from the textbook content.

academic_year
  String.
  Must exactly match the provided academic year.

total_classes
  Integer.
  Must equal {num_classes}.

schedule
  Array containing EXACTLY {num_classes} class objects.


EACH CLASS OBJECT MUST CONTAIN:

class_number
  Integer.
  Sequential from 1 to {num_classes} with no gaps.

topics
  Array of topic objects.

  Each topic object must contain:

    topic_name
      String.
      Use actual section/subsection titles from the chapter whenever possible.

    subtopics
      Array of strings.

      Requirements:
      - Include specific concepts, definitions, formulas, laws,
        processes, classifications, worked examples, activities,
        experiments, or diagrams from the chapter.
      - Use concrete names directly from the textbook.
      - Do NOT use vague placeholders like:
          "examples"
          "properties"
          "applications"
          "activities"
      - Name the actual content explicitly.
      - Include enough subtopics to realistically support a full class session.

  A class may contain multiple topic objects when conceptually appropriate.


learning_objectives
  Array containing 3 to 5 strings.

  Requirements:
  - Every objective must begin with:
      "Students will"
  - Use ONLY one of these action verbs immediately after:
      define
      distinguish
      calculate
      classify
      explain
      compare
      identify
      demonstrate
      predict
      state
  - Each objective must reference a specific concept,
    formula, process, experiment, law, classification,
    or example from the class.
  - Avoid vague objectives such as:
      "understand the topic"
      "learn the concept"
      "gain knowledge about"


teacher_tip
  A SINGLE detailed paragraph with a MINIMUM of 120 words.

  This field is EXTREMELY IMPORTANT.

  Requirements:
  - Describe exactly how the teacher conducts the lesson in class.
  - Include:
      - teacher actions
      - teacher speech examples
      - board work
      - demonstrations
      - experiments
      - classroom interactions
      - transitions between concepts
      - analogies
      - real-life examples
      - use of classroom materials
      - misconception handling
  - Explicitly reference:
      - textbook concepts
      - formulas
      - diagrams
      - experiments
      - activities
      - examples
      - substances
      - equipment
      - measurements
      - observations
      from the chapter whenever available.
  - The description must be concrete enough that a teacher
    unfamiliar with the chapter could directly execute it.
  - Include at least one likely student misconception
    and how the teacher addresses it.
  - Include at least one engagement or interaction technique.
  - Describe HOW the teacher transitions between subtopics.

  FORBIDDEN GENERIC PHRASES:
  - "Use visuals"
  - "Engage students"
  - "Ask students questions"
  - "Discuss the topic"
  - "Explain clearly"
  - Any vague teaching advice without detailed execution.

  BAD teacher_tip example:
  "Use a classroom discussion to explain friction."

  GOOD teacher_tip example:
  "Place a wooden block and a rubber eraser on an inclined cardboard surface.
  Slowly raise one side and ask students to predict which object will slide first.
  Write predictions on the board before demonstrating the experiment.
  After the demonstration, connect the observation to frictional force
  and explain how surface texture changes resistance."


homework
  Object containing:

    questions
      Array containing 6 to 10 questions.

      REQUIRED DISTRIBUTION:
      - At least 2 factual or recall questions
      - At least 2 conceptual understanding questions
      - At least 2 application/reasoning questions
      - At least 1 real-world scenario question
      - At least 1 higher-order thinking question
      - Include at least 1 numerical problem whenever formulas,
        measurements, calculations, or data appear in the class

      ADDITIONAL REQUIREMENTS:
      - Questions must directly reference concepts,
        experiments, formulas, activities, diagrams,
        or examples taught in this class.
      - Avoid extremely short or generic textbook-style questions.
      - At least 2 questions must be multi-step questions.
      - Vary cognitive difficulty.
      - Include reasoning-heavy questions where appropriate.
      - Questions should feel like real teacher-created homework,
        not auto-generated fillers.

      BAD homework question:
      "What is photosynthesis?"

      GOOD homework question:
      "A plant kept near a window bends toward sunlight after five days.
      Using the concept of phototropism discussed in class,
      explain why this happens and predict what would occur if
      the light source were moved to the opposite side."

    estimated_time_minutes
      Integer.

      Requirements:
      - Estimate realistically based on:
          - number of questions
          - question complexity
          - calculations required
          - writing length
      - Do NOT repeat the same value for every class.


FINAL CLASS REQUIREMENT:
The final class MUST:
- function as a structured recap and reinforcement session
- revisit key concepts across the chapter
- compare major classifications/categories where relevant
- reference specific end-of-chapter exercises by number whenever available
- consolidate formulas, definitions, processes, or diagrams from earlier classes


GLOBAL RULES:
- schedule must contain EXACTLY {num_classes} objects.
- total_classes must equal {num_classes}.
- Every class must contain meaningful instructional density.
- Avoid repetition across classes.
- Prefer rich detail over brevity.
- Do NOT compress explanations to save tokens.
- Every field must contain classroom-usable detail.
- Ensure the output resembles premium teacher-training lesson plans.
- Remain strictly grounded in the textbook content.
- Do NOT invent topics unrelated to the provided chapter.
- Return ONLY the JSON object.
"""


# ── OpenAI client (lazy) ──────────────────────────────────────────────────────
_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    api_key = ai_settings.lesson_plan_api_key
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY (or LESSON_PLAN_OPENAI_API_KEY) is not configured. "
            "Set it in backend/.env to enable Lesson Plan generation."
        )
    from openai import OpenAI

    _client = OpenAI(api_key=api_key)
    return _client


def generate_lesson_plan(
    *,
    subject: str,
    academic_year: str,
    num_classes: int,
    chapter_text: str,
    additional_info: str = "",
    max_retries: int = 2,
) -> dict:
    """Generate a class-by-class lesson plan and return it as a dict.

    Mirrors the planner's retry loop: on a JSON/validation failure the
    model is shown its error and asked to correct it, up to
    ``max_retries`` extra attempts. Raises ``RuntimeError`` when OpenAI is
    unconfigured or never returns a valid schedule.
    """
    if not chapter_text or not chapter_text.strip():
        raise RuntimeError(
            "No readable text could be extracted from the uploaded resources."
        )

    client = _get_client()
    model = ai_settings.lesson_plan_model

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": build_prompt(
                subject, academic_year, num_classes, chapter_text, additional_info
            ),
        },
    ]

    logger.info(
        "OpenAI LP call: model=%s subject=%s academic_year=%s num_classes=%d chars=%d",
        model,
        subject,
        academic_year,
        num_classes,
        len(chapter_text),
    )

    last_error: Optional[Exception] = None
    for attempt in range(1, max_retries + 2):
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            response_format={"type": "json_object"},
        )

        raw = (response.choices[0].message.content or "").strip()

        try:
            data = json.loads(raw)
            schedule = AcademicSchedule(**data)
            logger.info(
                "OpenAI LP response valid on attempt %d: %d classes",
                attempt,
                schedule.total_classes,
            )
            return schedule.model_dump(mode="json")
        except (json.JSONDecodeError, ValueError) as exc:
            last_error = exc
            if attempt > max_retries:
                raise RuntimeError(
                    f"Lesson plan generation failed after {max_retries + 1} attempts. "
                    f"Last error: {exc}"
                ) from exc
            messages.append({"role": "assistant", "content": raw})
            messages.append(
                {
                    "role": "user",
                    "content": (
                        f"Your response failed validation with this error: {exc}\n"
                        "Return only valid JSON that satisfies the schema. No markdown."
                    ),
                }
            )

    raise RuntimeError(f"Lesson plan generation failed: {last_error}")


__all__ = ["generate_lesson_plan", "AcademicSchedule"]
