"""
Scan service for handling scan uploads and status tracking.

Storage behaviour:
  DEV_MODE=True  -> skips real Supabase upload; uses a 1?1 placeholder URL so
                   the full pipeline (VisionAgent stub -> inventory upsert ->
                   patterns -> predictions) runs without any external deps.
  DEV_MODE=False -> uploads to the configured bucket and returns either a
                   signed URL (STORAGE_PUBLIC_RECEIPTS=False, default) or a
                   public URL (STORAGE_PUBLIC_RECEIPTS=True).

Configurable via env / .env:
  STORAGE_BUCKET_RECEIPTS      bucket name          (default: "scans")
  STORAGE_PUBLIC_RECEIPTS      True -> public URL    (default: False)
  STORAGE_SIGNED_URL_EXPIRY    seconds              (default: 3600)
"""

import asyncio
import uuid
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import UploadFile

from app.api.deps import TenantContext
from app.core.config import settings
from app.core.logging import get_logger
from app.db.repositories.scans import get_scans_repository
from app.db.supabase_client import get_async_supabase_admin
from app.schemas.scans import (
    ScanQueuedResponse,
    ScanStatusResponse,
    ScanUploadMultipartRequest,
)

logger = get_logger(__name__)

# Placeholder used in DEV_MODE -- a minimal 1?1 white JPEG data URL
_DEV_PLACEHOLDER_URL = (
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/"
    "2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwg"
    "JC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAED"
    "ASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUE/8QAIhAAAA"
    "AAAAAAAAAAAAAAAAAAAAAAB/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/"
    "xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwABmX/9k="
)


def _dev_placeholder_url(scan_id: str) -> str:
    """Return a stable fake URL for DEV_MODE -- unique per scan so logs are traceable."""
    return f"https://placeholder.neumas.dev/scans/{scan_id}.jpg"


class ScanService:
    """Service for scan upload and processing."""

    async def upload_scan(
        self,
        file: UploadFile,
        scan_type: str,
        tenant: TenantContext,
    ) -> ScanQueuedResponse:
        """
        Upload scan image and queue for processing.

        Flow:
        1. Upload image to Supabase Storage
        2. Create scan record in DB
        3. Enqueue Celery task for processing

        Args:
            file: Uploaded file (receipt or barcode image)
            scan_type: "receipt" or "barcode"
            tenant: Current tenant context

        Returns:
            ScanQueuedResponse with scan_id and status

        Raises:
            Exception: If upload or DB insert fails
        """
        scan_id = uuid.uuid4()
        
        logger.info(
            "Processing scan upload",
            scan_id=str(scan_id),
            property_id=str(tenant.property_id),
            scan_type=scan_type,
            filename=file.filename,
        )

        # Step 1: Upload image to Supabase Storage (or stub in DEV_MODE)
        storage_path, image_url = await self._upload_to_storage(
            file=file,
            scan_id=scan_id,
            org_id=tenant.org_id,
            property_id=tenant.property_id,
        )

        # Step 2: Create scan record
        scans_repo = await get_scans_repository()
        scan_data = await scans_repo.create(
            tenant,
            {
                "id": str(scan_id),
                "property_id": str(tenant.property_id),
                "scan_type": scan_type,
                "status": "queued",
                "image_urls": [storage_path],
                "user_id": str(tenant.user_id),
            },
        )

        logger.info(
            "Created scan record",
            scan_id=str(scan_id),
            storage_path=storage_path,
        )

        # Step 3: Process scan in the background (no Redis/Celery needed).
        # asyncio.create_task schedules _process_scan_async on the running
        # event loop so the upload response returns immediately while the
        # AI pipeline runs concurrently.
        from app.tasks.scan_tasks import _process_scan_async

        asyncio.create_task(
            _process_scan_async(
                task=None,
                scan_id=str(scan_id),
                org_id=str(tenant.org_id),
                property_id=str(tenant.property_id),
                user_id=str(tenant.user_id),
                image_url=image_url,
                scan_type=scan_type,
            )
        )

        logger.info(
            "Scan processing started in background",
            scan_id=str(scan_id),
        )

        return ScanQueuedResponse(
            scan_id=scan_id,
            status="queued",
        )

    async def get_scan_status(
        self,
        scan_id: UUID,
        tenant: TenantContext,
    ) -> ScanStatusResponse:
        """
        Get scan processing status.

        Args:
            scan_id: ID of the scan
            tenant: Current tenant context

        Returns:
            ScanStatusResponse with current status

        Raises:
            ValueError: If scan not found
        """
        scans_repo = await get_scans_repository()
        scan = await scans_repo.get_by_id(tenant, scan_id)

        if not scan:
            logger.warning("Scan not found", scan_id=str(scan_id))
            raise ValueError(f"Scan {scan_id} not found")

        # Determine processed flag based on status
        processed = scan.get("status") == "completed"

        return ScanStatusResponse(
            scan_id=scan_id,
            processed=processed,
            status=scan.get("status", "unknown"),
            created_at=scan.get("created_at"),
            error_message=scan.get("error_message"),
        )

    async def _upload_to_storage(
        self,
        file: UploadFile,
        scan_id: UUID,
        org_id: UUID,
        property_id: UUID,
    ) -> tuple[str, str]:
        """
        Upload file to Supabase Storage and return (storage_path, image_url).

        Storage path format: {org_id}/{property_id}/{scan_id}.{ext}

        In DEV_MODE:
          - Skips the actual upload.
          - Returns a deterministic placeholder URL so downstream pipeline
            steps (VisionAgent stub, pattern/predict recompute) still run.

        In production:
          - Uploads to STORAGE_BUCKET_RECEIPTS.
          - Returns a signed URL (default) or public URL depending on
            STORAGE_PUBLIC_RECEIPTS setting.

        Returns:
            Tuple of (storage_path, image_url).
            storage_path is stored in scans.image_urls[].
            image_url is passed to the Celery task for VisionAgent.
        """
        bucket = settings.STORAGE_BUCKET_RECEIPTS
        ext = (
            file.filename.rsplit(".", 1)[-1].lower()
            if file.filename and "." in file.filename
            else "jpg"
        )
        # Normalise extension to one Supabase accepts
        if ext not in ("jpg", "jpeg", "png", "webp", "heic"):
            ext = "jpg"
        storage_path = f"{org_id}/{property_id}/{scan_id}.{ext}"

        # -- DEV_MODE: skip real upload ----------------------------------------
        if settings.DEV_MODE:
            placeholder = _dev_placeholder_url(str(scan_id))
            logger.info(
                "DEV_MODE: skipping storage upload",
                scan_id=str(scan_id),
                placeholder=placeholder,
            )
            return storage_path, placeholder

        # -- Production upload -------------------------------------------------
        content = await file.read()
        content_type = file.content_type or "image/jpeg"

        client = await get_async_supabase_admin()
        if not client:
            raise RuntimeError("Supabase admin client unavailable for storage upload")

        try:
            await client.storage.from_(bucket).upload(
                path=storage_path,
                file=content,
                file_options={"content-type": content_type},
            )
            logger.info(
                "Uploaded receipt to storage",
                bucket=bucket,
                path=storage_path,
                size_bytes=len(content),
            )
        except Exception as exc:
            logger.error(
                "Storage upload failed",
                error=str(exc),
                bucket=bucket,
                path=storage_path,
            )
            raise

        # -- Resolve image URL -------------------------------------------------
        image_url = await self._get_image_url(bucket, storage_path)
        if not image_url:
            raise ValueError(
                f"Upload succeeded but could not obtain image URL for {storage_path}"
            )
        return storage_path, image_url

    async def _get_image_url(self, bucket: str, path: str) -> str | None:
        """
        Return either a signed URL or a public URL for a stored object.

        Uses STORAGE_PUBLIC_RECEIPTS to decide:
          True  -> public URL (instant, no expiry, requires public bucket)
          False -> signed URL (time-limited, works with private bucket)
        """
        client = await get_async_supabase_admin()
        if not client:
            return None

        if settings.STORAGE_PUBLIC_RECEIPTS:
            # Synchronous helper -- no network call needed
            try:
                url = client.storage.from_(bucket).get_public_url(path)
                return url if isinstance(url, str) else None
            except Exception as exc:
                logger.error("get_public_url failed", error=str(exc), path=path)
                return None

        # Signed URL (private bucket, default)
        try:
            result = await client.storage.from_(bucket).create_signed_url(
                path, settings.STORAGE_SIGNED_URL_EXPIRY
            )
            if isinstance(result, dict):
                return result.get("signedURL") or result.get("signedUrl")
            return None
        except Exception as exc:
            logger.error("create_signed_url failed", error=str(exc), path=path)
            return None

    async def get_scan(
        self,
        scan_id: UUID,
        tenant: TenantContext,
    ) -> "ScanResponse":
        """
        Get full scan details.

        Args:
            scan_id: ID of the scan
            tenant: Current tenant context

        Returns:
            ScanResponse with full details

        Raises:
            ValueError: If scan not found
        """
        from app.schemas.scans import ScanResponse
        from decimal import Decimal

        scans_repo = await get_scans_repository()
        scan = await scans_repo.get_by_id(tenant, scan_id)

        if not scan:
            logger.warning("Scan not found", scan_id=str(scan_id))
            raise ValueError(f"Scan {scan_id} not found")

        return ScanResponse(
            id=UUID(scan["id"]),
            property_id=UUID(scan["property_id"]),
            user_id=UUID(scan["user_id"]) if scan.get("user_id") else tenant.user_id,
            scan_type=scan.get("scan_type", "full"),
            status=scan.get("status", "unknown"),
            image_urls=scan.get("image_urls", []),
            items_detected=scan.get("items_detected", 0),
            confidence_score=Decimal(str(scan["confidence_score"])) if scan.get("confidence_score") else None,
            processing_time_ms=scan.get("processing_time_ms"),
            error_message=scan.get("error_message"),
            started_at=scan.get("started_at"),
            completed_at=scan.get("processed_at"),
            created_at=scan.get("created_at"),
        )

    async def list_scans(
        self,
        tenant: TenantContext,
        status_filter: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list["ScanResponse"]:
        """
        List scans for a property.

        Args:
            tenant: Current tenant context
            status_filter: Optional status filter
            limit: Max items to return
            offset: Offset for pagination

        Returns:
            List of scan responses
        """
        from app.schemas.scans import ScanResponse
        from decimal import Decimal

        scans_repo = await get_scans_repository()
        scans = await scans_repo.get_by_property(
            tenant=tenant,
            status=status_filter,
            limit=limit,
            offset=offset,
        )

        return [
            ScanResponse(
                id=UUID(scan["id"]),
                property_id=UUID(scan["property_id"]),
                user_id=UUID(scan["user_id"]) if scan.get("user_id") else tenant.user_id,
                scan_type=scan.get("scan_type", "full"),
                status=scan.get("status", "unknown"),
                image_urls=scan.get("image_urls", []),
                items_detected=scan.get("items_detected", 0),
                confidence_score=Decimal(str(scan["confidence_score"])) if scan.get("confidence_score") else None,
                processing_time_ms=scan.get("processing_time_ms"),
                error_message=scan.get("error_message"),
                started_at=scan.get("started_at"),
                completed_at=scan.get("completed_at"),
                created_at=scan.get("created_at"),
            )
            for scan in scans
        ]


async def get_scan_service() -> ScanService:
    """Get scan service instance."""
    return ScanService()
