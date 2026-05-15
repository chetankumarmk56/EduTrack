"""Lesson Plan PDF rendering service.

Pure rendering — no AI. The frontend produces the lesson_plan structure
deterministically; this service only formats it as a PDF.
"""
from __future__ import annotations

import io
from typing import List, Optional

from app.schemas.lesson_plan import LessonDay


class LessonPlanService:
    def render_pdf(
        self,
        *,
        lesson_plan: List[LessonDay],
        subject: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        warning_message: Optional[str] = None,
        document_name: Optional[str] = None,
    ) -> bytes:
        from reportlab.lib.enums import TA_LEFT
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import (
            HRFlowable,
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
            title=f"Lesson Plan — {subject}",
        )

        styles = getSampleStyleSheet()
        h_style = ParagraphStyle(
            "title", parent=styles["Title"], fontSize=22, spaceAfter=2
        )
        sub_style = ParagraphStyle(
            "subtitle",
            parent=styles["Normal"],
            fontSize=11,
            textColor="#555555",
            spaceAfter=14,
        )
        warn_style = ParagraphStyle(
            "warn",
            parent=styles["Normal"],
            fontSize=10,
            textColor="#b91c1c",
            backColor="#fef2f2",
            borderColor="#fecaca",
            borderWidth=1,
            borderPadding=8,
            spaceAfter=14,
        )
        session_meta_style = ParagraphStyle(
            "session_meta",
            parent=styles["Normal"],
            fontSize=9,
            textColor="#666666",
            spaceAfter=2,
        )
        topic_style = ParagraphStyle(
            "topic",
            parent=styles["Heading2"],
            fontSize=14,
            textColor="#111827",
            spaceAfter=6,
        )
        section_label_style = ParagraphStyle(
            "section_label",
            parent=styles["Normal"],
            fontSize=8.5,
            textColor="#6366f1",
            spaceAfter=4,
            spaceBefore=4,
        )
        bullet_style = ParagraphStyle(
            "bullet",
            parent=styles["Normal"],
            fontSize=10.5,
            leading=14,
            leftIndent=14,
            spaceAfter=2,
            alignment=TA_LEFT,
        )
        objective_style = ParagraphStyle(
            "objective",
            parent=bullet_style,
            textColor="#15803d",
        )

        story = []
        story.append(Paragraph(f"Lesson Plan — {_escape(subject)}", h_style))
        sub_bits = []
        total_hours = sum(d.duration_hours for d in lesson_plan)
        sub_bits.append(f"{len(lesson_plan)} session(s) · {total_hours:g} hour(s)")
        if start_date and end_date:
            sub_bits.append(f"{start_date} → {end_date}")
        if document_name:
            sub_bits.append(f"Source: {document_name}")
        story.append(Paragraph(" · ".join(sub_bits), sub_style))

        if warning_message:
            story.append(Paragraph(_escape(warning_message), warn_style))

        for idx, day in enumerate(lesson_plan, start=1):
            story.append(
                Paragraph(
                    f"Session {idx} · {_escape(day.date)} · {day.duration_hours:g}h",
                    session_meta_style,
                )
            )
            story.append(Paragraph(_escape(day.topic), topic_style))

            if day.subtopics:
                story.append(Paragraph("CONTENT", section_label_style))
                for st in day.subtopics:
                    story.append(Paragraph(f"• {_escape(st)}", bullet_style))

            if day.objectives:
                story.append(Paragraph("OBJECTIVES", section_label_style))
                for obj in day.objectives:
                    story.append(Paragraph(f"✓ {_escape(obj)}", objective_style))

            story.append(Spacer(1, 6))
            if idx < len(lesson_plan):
                story.append(
                    HRFlowable(
                        width="100%",
                        thickness=0.4,
                        color="#e5e7eb",
                        spaceBefore=4,
                        spaceAfter=8,
                    )
                )

        doc.build(story)
        return buffer.getvalue()


def _escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\n", "<br/>")
    )


lesson_plan_service = LessonPlanService()
