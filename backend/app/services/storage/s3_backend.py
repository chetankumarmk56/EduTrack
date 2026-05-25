"""AWS S3 storage backend (production).

Uses a private bucket. All reads to clients go through short-lived presigned
URLs minted on demand — the bucket is never publicly accessible.

The boto3 client is lazy-loaded so the rest of the app can import this
module even when AWS credentials are absent (the factory will pick the local
backend instead).
"""
from __future__ import annotations

import asyncio
from typing import BinaryIO, Optional

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
        """
        Bytes-in upload. Used by callers that already have an in-memory
        payload (lesson_plan_s3, question_bank_s3). For user-uploaded
        content prefer ``upload_stream``.
        """
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

    async def upload_stream(
        self,
        *,
        key: str,
        fileobj: BinaryIO,
        content_type: str,
        content_length: Optional[int] = None,
    ) -> str:
        """
        Multipart-stream ``fileobj`` straight to S3.

        ``upload_fileobj`` reads in chunks (default 8 MiB threshold for
        multipart) so a 25 MB upload never sits in Python memory in full.
        It also retries transient failures internally, which is what we
        want — the alternative is hand-rolling MultipartCreate / Upload /
        Complete with our own retry/abort plumbing.

        boto3 is blocking, so the whole call is offloaded to a worker
        thread via ``asyncio.to_thread``.
        """
        client = self._get_client()
        bucket = self.bucket

        # Rewind in case a size check seeked the file. SpooledTemporaryFile
        # is seekable; if a caller hands us something that isn't, S3 will
        # error and the caller will see a 5xx.
        try:
            fileobj.seek(0)
        except Exception:  # noqa: BLE001
            pass

        def _put() -> None:
            from boto3.s3.transfer import TransferConfig
            # 8 MiB threshold matches boto3 default. Below this we use a
            # single PUT; above, automatic multipart with 8 MiB chunks.
            cfg = TransferConfig(
                multipart_threshold=8 * 1024 * 1024,
                multipart_chunksize=8 * 1024 * 1024,
                use_threads=True,
            )
            client.upload_fileobj(
                Fileobj=fileobj,
                Bucket=bucket,
                Key=key,
                ExtraArgs={
                    "ContentType": content_type or "application/octet-stream",
                    "ACL": "private",
                    "ServerSideEncryption": "AES256",
                },
                Config=cfg,
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
