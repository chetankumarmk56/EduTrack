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

    Returns the persistable identifier of the uploaded file. In prod
    that's a private S3 key; in dev without S3 it's a ``/static/uploads/``
    path. The client stores this string in ``attachment_url`` when
    creating an announcement; the announcement read endpoints presign
    S3 keys at response time so clients get a working URL.
    """
    url = await storage_service.upload_file(file)
    return {
        "url": url
    }
