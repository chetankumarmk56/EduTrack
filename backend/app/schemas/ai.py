from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime

class MCQ(BaseModel):
    question: str
    options: List[str]
    answer: str
    difficulty: str = "Medium"

class SubjectiveQuestion(BaseModel):
    question: str
    answer: str
    difficulty: str = "Medium"

class QuestionResponse(BaseModel):
    mcqs: List[MCQ]
    short_questions: List[SubjectiveQuestion]
    long_questions: List[SubjectiveQuestion]

class SummaryResponse(BaseModel):
    title: str
    summary: str
    key_points: List[str]
    action_items: Optional[List[str]] = None

class QuestionRequest(BaseModel):
    topic: str
    difficulty: str = "medium"
    mcq_count: int = 5
    short_count: int = 5
    long_count: int = 2

class PPTDownloadRequest(BaseModel):
    slides: List[Dict[str, Any]]
    filename: Optional[str] = "LessonPlan.pptx"
    subject: Optional[str] = "Generic"

class PDFDownloadRequest(BaseModel):
    questions: List[Dict[str, Any]]
    filename: Optional[str] = "ExamPaper.pdf"
    subject: Optional[str] = "Generic"
    is_answer_key: Optional[bool] = False
