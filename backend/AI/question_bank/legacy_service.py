"""Question Bank Generator orchestration.

Pipeline:
  1. Deterministic input prep (parse uploaded file → plain text).
  2. Isolated LLM call via :mod:`AI.question_bank.llm_provider`.
  3. Deterministic validation against :class:`Question` schema.

The route layer stays thin; this service is the only place that knows about
file formats, the LLM provider, and PDF rendering.
"""
from __future__ import annotations

import io
import uuid
from typing import List, Tuple

from fastapi import UploadFile
from pydantic import ValidationError

from app.core.logger import logger
from AI.question_bank.schemas import (
    GenerateRequest,
    GenerateResponse,
    Question,
    QuestionSpec,
)
from app.services.file_parsing import extract_text  # shared text extraction (host app)
from AI.question_bank.llm_provider import openai_provider

_MAX_FILE_BYTES = 8 * 1024 * 1024  # 8 MB
_DEFAULT_MARKS = {"mcq": 1, "short": 3, "long": 7}


class QuestionBankService:
    # ------------------------------------------------------------------
    # File parsing
    # ------------------------------------------------------------------
    async def parse_uploaded_file(self, file: UploadFile) -> Tuple[str, str]:
        """Extract plain text from an uploaded file. Returns (content, filename)."""
        if not file or not file.filename:
            raise ValueError("No file provided.")

        data = await file.read()
        if not data:
            raise ValueError("Uploaded file is empty.")
        if len(data) > _MAX_FILE_BYTES:
            raise ValueError("File too large (max 8 MB).")

        text = extract_text(file.filename, data)
        return text, file.filename

    # ------------------------------------------------------------------
    # Generation
    # ------------------------------------------------------------------
    async def generate(self, request: GenerateRequest) -> GenerateResponse:
        if not openai_provider.is_configured:
            raise RuntimeError(
                "Question Bank Generator is not configured: OPENAI_API_KEY missing."
            )

        raw = await openai_provider.generate_question_bank(
            topics=request.topics,
            content=request.content,
            subject=request.subject,
            specs=[s.model_dump() for s in request.specs],
        )

        validated = _validate_questions(raw["questions"])
        return GenerateResponse(
            questions=validated,
            metadata={
                **raw["metadata"],
                "requested": sum(s.count for s in request.specs),
                "returned": len(validated),
            },
        )

    # ------------------------------------------------------------------
    # PDF export
    # ------------------------------------------------------------------
    def render_pdf(
        self,
        questions: List[Question],
        subject: str,
        is_answer_key: bool,
    ) -> bytes:
        """Render a clean PDF (exam paper or answer key) using reportlab."""
        from reportlab.lib.enums import TA_LEFT
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import (
            Paragraph,
            SimpleDocTemplate,
            Spacer,
        )

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=20 * mm,
            rightMargin=20 * mm,
            topMargin=18 * mm,
            bottomMargin=18 * mm,
            title=("Answer Key" if is_answer_key else "Question Bank") + f" — {subject}",
        )

        styles = getSampleStyleSheet()
        h_style = ParagraphStyle(
            "title", parent=styles["Title"], fontSize=20, spaceAfter=4
        )
        sub_style = ParagraphStyle(
            "subtitle",
            parent=styles["Normal"],
            fontSize=11,
            textColor="#555555",
            spaceAfter=14,
        )
        q_style = ParagraphStyle(
            "question",
            parent=styles["Normal"],
            fontSize=11.5,
            leading=15,
            alignment=TA_LEFT,
            spaceAfter=6,
        )
        opt_style = ParagraphStyle(
            "option", parent=q_style, leftIndent=14, spaceAfter=2
        )
        ans_style = ParagraphStyle(
            "answer",
            parent=q_style,
            leftIndent=8,
            textColor="#15803d",
            spaceAfter=10,
        )
        meta_style = ParagraphStyle(
            "meta",
            parent=styles["Normal"],
            fontSize=9,
            textColor="#888888",
            spaceAfter=4,
        )

        story = []
        title = "Answer Key" if is_answer_key else "Question Bank"
        story.append(Paragraph(f"{title} — {_escape(subject)}", h_style))
        total_marks = sum(q.marks for q in questions)
        story.append(
            Paragraph(
                f"{len(questions)} question(s) · {total_marks} mark(s) total",
                sub_style,
            )
        )

        for idx, q in enumerate(questions, start=1):
            tag = f"Q{idx}. [{q.type.upper()} · {q.difficulty} · {q.marks}m]"
            story.append(Paragraph(_escape(tag), meta_style))
            story.append(Paragraph(_escape(q.question), q_style))

            if q.type == "mcq" and q.options:
                for opt_idx, opt in enumerate(q.options):
                    letter = chr(ord("A") + opt_idx)
                    story.append(
                        Paragraph(f"<b>{letter}.</b> {_escape(opt)}", opt_style)
                    )

            if is_answer_key:
                story.append(
                    Paragraph(f"<b>Answer:</b> {_escape(q.answer)}", ans_style)
                )
                if q.explanation:
                    story.append(
                        Paragraph(
                            f"<i>Explanation:</i> {_escape(q.explanation)}", ans_style
                        )
                    )
            else:
                story.append(Spacer(1, 8))

        doc.build(story)
        return buffer.getvalue()


# ----------------------------------------------------------------------
# Validation helpers
# ----------------------------------------------------------------------
def _validate_questions(raw: list) -> List[Question]:
    out: List[Question] = []
    for idx, item in enumerate(raw):
        if not isinstance(item, dict):
            continue
        item.setdefault("id", uuid.uuid4().hex[:12])
        item.setdefault(
            "marks", _DEFAULT_MARKS.get(str(item.get("type", "")).lower(), 2)
        )
        # Normalize options for non-mcq.
        if item.get("type") != "mcq":
            item["options"] = None
        try:
            q = Question.model_validate(item)
        except ValidationError as exc:
            logger.warning("Dropping invalid question at index %s: %s", idx, exc)
            continue

        # MCQ sanity: answer must match an option (best-effort fix).
        if q.type == "mcq" and q.options:
            if q.answer not in q.options:
                # Try case-insensitive match before giving up.
                lower_map = {o.lower(): o for o in q.options}
                fixed = lower_map.get(q.answer.lower())
                if fixed:
                    q = q.model_copy(update={"answer": fixed})
                else:
                    logger.warning(
                        "MCQ answer not in options (id=%s); keeping but flagged.",
                        q.id,
                    )
        out.append(q)
    return out


def _escape(text: str) -> str:
    """Minimal HTML escape so reportlab Paragraph won't choke on user input."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\n", "<br/>")
    )


question_bank_service = QuestionBankService()
# Re-export for convenience.
__all__ = ["question_bank_service", "QuestionBankService", "QuestionSpec"]
