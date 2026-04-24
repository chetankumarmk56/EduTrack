from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from app.core.dependencies import get_current_user, UserContext, require_faculty
from app.services.storage_service import storage_service

router = APIRouter(prefix="/api", tags=["System Documents"])

@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    file: UploadFile = File(...),
    user: UserContext = Depends(require_faculty)
):
    """
    Authorized endpoint for uploading academic attachments.
    Returns the public URL of the uploaded file.
    """
    url = await storage_service.upload_file(file)
    return {
        "url": url
    }
