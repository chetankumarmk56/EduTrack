import os
import google.generativeai as genai
from typing import List, Dict, Any, Optional
import json

from app.core.config import settings
from app.core.logger import logger
from app.schemas.ai import QuestionRequest, QuestionResponse, SummaryResponse

class AIService:
    def __init__(self):
        if settings.GOOGLE_API_KEY:
            genai.configure(api_key=settings.GOOGLE_API_KEY)
            self.model = genai.GenerativeModel('gemini-1.5-flash')
        else:
            self.model = None

    async def get_indexed_documents(self, institution_id: int) -> List[Dict[str, Any]]:
        """
        Returns a list of simulated indexed documents for the institution.
        In a production environment, this would query a Vector DB (like Pinecone/Milvus).
        """
        # For now, we return a high-fidelity mock that satisfies the frontend UI
        return [
            {
                "id": "doc_001",
                "title": "Grade 10 Mathematics - Calculus Basics.pdf",
                "category": "Mathematics",
                "indexed_at": "2024-03-20T10:00:00Z",
                "status": "Ready"
            },
            {
                "id": "doc_002",
                "title": "Quantum Physics Introduction.pptx",
                "category": "Physics",
                "indexed_at": "2024-03-21T14:30:00Z",
                "status": "Ready"
            },
             {
                "id": "doc_003",
                "title": "World History - French Revolution.docx",
                "category": "History",
                "indexed_at": "2024-03-22T09:15:00Z",
                "status": "Processing"
            }
        ]

    async def generate_questions(self, request: QuestionRequest) -> QuestionResponse:
        """
        Generates MCQs and subjective questions using Gemini based on a topic.
        """
        if not self.model:
            raise Exception("AI Service not configured (Google API Key missing)")

        prompt = f"""
        Generate a structured school assessment about '{request.topic}' with difficulty '{request.difficulty}'.
        Return ONLY valid JSON with this format:
        {{
            "mcqs": [{{ "question": "...", "options": ["A", "B", "C", "D"], "answer": "...", "difficulty": "..." }}],
            "short_questions": [{{ "question": "...", "answer": "...", "difficulty": "..." }}],
            "long_questions": [{{ "question": "...", "answer": "...", "difficulty": "..." }}]
        }}
        Provide exactly {request.mcq_count} MCQs, {request.short_count} short questions, and {request.long_count} long questions.
        """

        response = self.model.generate_content(prompt)
        
        # Parse JSON from response
        try:
            # Clean possible markdown formatting
            text = response.text.strip().replace("```json", "").replace("```", "")
            data = json.loads(text)
            return QuestionResponse(**data)
        except Exception as e:
            logger.error(f"AI Generation Error: {str(e)}")
            # Return a fallback if parsing fails
            return QuestionResponse(mcqs=[], short_questions=[], long_questions=[])

ai_service = AIService()
