"""Pydantic schemas for the Question Bank Generator module.

All wire types live here so the OpenAI provider and FastAPI routes share a
single contract.
"""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

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
