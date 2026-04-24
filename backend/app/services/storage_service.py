import os
import asyncio
import datetime
from typing import Optional
from fastapi import UploadFile, HTTPException, status
from app.core.config import settings
from app.core.logger import logger

try:
    from azure.storage.blob import BlobServiceClient, ContentSettings
    AZURE_AVAILABLE = True
except ImportError:
    AZURE_AVAILABLE = False

class StorageService:
    def __init__(self):
        self.upload_dir = os.path.join(os.getcwd(), "static", "uploads")
        os.makedirs(self.upload_dir, exist_ok=True)
        self.allowed_extensions = {".pdf", ".jpg", ".png"}
        self.max_size = 5 * 1024 * 1024  # 5MB
        
        # Azure Initialization
        self.connection_string = settings.AZURE_STORAGE_CONNECTION_STRING
        self.container_name = settings.AZURE_CONTAINER_NAME
        self.blob_service_client = None
        
        if AZURE_AVAILABLE and self.connection_string:
            try:
                self.blob_service_client = BlobServiceClient.from_connection_string(self.connection_string)
            except Exception as e:
                logger.error(f"Azure Storage Init Error: {e}")

    async def upload_file(self, file: UploadFile) -> str:
        """
        Upload a file to storage (Azure if configured, else local) and return the public URL.
        Validates extension and size.
        """
        # 1. Validate Extension
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in self.allowed_extensions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file type. Allowed: {', '.join(self.allowed_extensions)}"
            )

        # 2. Read contents for validation and upload
        try:
            contents = await file.read()
            if len(contents) > self.max_size:
                 raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="File too large. Max size is 5MB."
                )
        except Exception as e:
            if isinstance(e, HTTPException): raise e
            raise HTTPException(status_code=500, detail=f"File read error: {str(e)}")

        unique_filename = f"{int(datetime.datetime.now().timestamp())}_{file.filename}"

        # 3. Try Azure Upload
        if self.blob_service_client:
            try:
                # Ensure container exists with public access
                container_client = self.blob_service_client.get_container_client(self.container_name)
                try:
                    await asyncio.to_thread(container_client.get_container_properties)
                except Exception:
                    # Create container if it doesn't exist
                    # 'blob' access level allows public read for blobs but not listing container contents
                    await asyncio.to_thread(container_client.create_container, public_access='blob')

                blob_client = self.blob_service_client.get_blob_client(
                    container=self.container_name, 
                    blob=unique_filename
                )
                
                # Upload to Azure
                await asyncio.to_thread(
                    blob_client.upload_blob,
                    contents, 
                    overwrite=True,
                    content_settings=ContentSettings(content_type=file.content_type)
                )
                
                # Return the Azure Blob URL
                return blob_client.url
            except Exception as e:
                logger.warning(f"Azure Upload Failed, falling back to local: {e}")
                # Fallback to local storage logic below

        # 4. Local Storage (Fallback or Primary)
        file_path = os.path.join(self.upload_dir, unique_filename)
        try:
            with open(file_path, "wb") as f:
                f.write(contents)
            
            # Return a relative URL that can be served by FastAPI or Nginx
            return f"/static/uploads/{unique_filename}"
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Storage error: {str(e)}")

    async def verify_file_exists(self, file_url: str) -> bool:
        """
        Verify if a file exists at the given URL.
        Supports both Azure blob URLs and local file paths.
        """
        if not file_url:
            return False
        
        # Check if it's an Azure blob URL
        if "blob.core.windows.net" in file_url or file_url.startswith("https://"):
            try:
                # Extract blob name from URL
                # Format: https://{account}.blob.core.windows.net/{container}/{blob}
                import asyncio
                import httpx
                async with httpx.AsyncClient() as client:
                    response = await client.head(file_url, follow_redirects=True)
                    return response.status_code < 400
            except Exception as e:
                logger.warning(f"Failed to verify Azure blob URL: {file_url}, error: {str(e)}")
                return False
        
        # Check if it's a local file path
        if file_url.startswith("/static/uploads/"):
            file_path = os.path.join(os.getcwd(), file_url.lstrip("/"))
            return os.path.exists(file_path)
        
        # Unknown URL format, assume invalid
        return False

storage_service = StorageService()
