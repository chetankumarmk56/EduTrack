"""AWS S3 storage backend (production).

Uses a private bucket. All reads to clients go through short-lived presigned
URLs minted on demand — the bucket is never publicly accessible.

The boto3 client is lazy-loaded so the rest of the app can import this
module even when AWS credentials are absent (the factory will pick the local
backend instead).
"""
from __future__ import annotations

import asyncio
from typing import Optional

from app.core.config import settings
from app.core.logger import logger
from app.services.storage.base import FileStorageBackend


class S3StorageBackend(FileStorageBackend):
    name = "s3"

    def __init__(self) -> None:
        self.bucket = settings.AWS_S3_BUCKET
        self.region = settings.AWS_S3_REGION
        self._client = None  # boto3 client, lazy

    def _get_client(self):
        if self._client is not None:
            return self._client
        try:
            import boto3
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "boto3 is required for the S3 backend (pip install boto3)."
            ) from exc

        self._client = boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=self.region,
        )
        return self._client

    async def upload(self, *, key: str, data: bytes, content_type: str) -> str:
        client = self._get_client()

        def _put() -> None:
            client.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=data,
                ContentType=content_type or "application/octet-stream",
                # Defence-in-depth — even if the bucket is mis-configured, the
                # object itself stays private.
                ACL="private",
                ServerSideEncryption="AES256",
            )

        await asyncio.to_thread(_put)
        return key

    async def download(self, key: str) -> bytes:
        client = self._get_client()

        def _get() -> bytes:
            obj = client.get_object(Bucket=self.bucket, Key=key)
            return obj["Body"].read()

        return await asyncio.to_thread(_get)

    async def delete(self, key: str) -> None:
        client = self._get_client()

        def _del() -> None:
            try:
                client.delete_object(Bucket=self.bucket, Key=key)
            except Exception as exc:  # noqa: BLE001
                logger.warning("S3 delete failed for %s: %s", key, exc)

        await asyncio.to_thread(_del)

    async def signed_url(
        self,
        key: str,
        *,
        filename: Optional[str] = None,
        expires_in: int = 900,
    ) -> Optional[str]:
        client = self._get_client()

        params: dict = {"Bucket": self.bucket, "Key": key}
        if filename:
            # Force the browser to use the original filename, not the s3 key.
            params["ResponseContentDisposition"] = f'attachment; filename="{filename}"'

        def _sign() -> str:
            return client.generate_presigned_url(
                "get_object", Params=params, ExpiresIn=expires_in
            )

        return await asyncio.to_thread(_sign)
