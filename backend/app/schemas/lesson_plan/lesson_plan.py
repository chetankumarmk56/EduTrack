"""Pydantic schemas for Lesson Plan PDF export."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class LessonDay(BaseModel):
    date: str = Field(min_length=1)
    topic: str = Field(min_length=1)
    subtopics: List[str] = []
    objectives: List[str] = []
    duration_hours: float = Field(ge=0)


class ExportLessonPlanPDFRequest(BaseModel):
    lesson_plan: List[LessonDay]
    subject: str = "General"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    warning_message: Optional[str] = None
    document_name: Optional[str] = None
    filename: Optional[str] = "LessonPlan.pdf"
