from fastapi import APIRouter, Depends, HTTPException
from typing import List, Any

from app.core.dependencies import get_current_user, UserContext
from app.services.ai_service import ai_service
from app.schemas.ai import QuestionRequest, QuestionResponse

router = APIRouter(prefix="/api/ai", tags=["Artificial Intelligence"])

@router.get("/indexed-documents", response_model=List[Any])
async def get_indexed_docs(user: UserContext = Depends(get_current_user)):
    """
    Returns the list of training documents/materials indexed for this institution.
    """
    return await ai_service.get_indexed_documents(user.institution_id)

@router.post("/generate-questions", response_model=QuestionResponse)
async def generate_questions(
    request: QuestionRequest,
    user: UserContext = Depends(get_current_user)
):
    """
    Leverages Gemini to generate structured MCQs and short/long questions.
    """
    try:
        return await ai_service.generate_questions(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
