from __future__ import annotations

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
from typing import Any
from decimal import Decimal
from uuid import UUID

from fastapi import UploadFile  # kept for get_scan / list_scans type hints

from app.api.deps import TenantContext
from app.core.config import settings
from app.core.logging import get_logger
from app.db.repositories.scans import get_scans_repository
from app.db.supabase_client import get_async_supabase_admin
from app.schemas.scans import (
    ScanQueuedResponse,
    ScanResponse,
    ScanStatusResponse,
)
from app.utils.file_hash import compute_hash, is_duplicate_upload

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
        file_bytes: bytes | None,
        scan_type: str,
        tenant: TenantContext,
        request_id: str | None = None,
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
            request_id=request_id,
            property_id=str(tenant.property_id),
            org_id=str(tenant.org_id),
            scan_type=scan_type,
            filename=file.filename,
        )

        # Read file bytes once — reuse for size check, dedup hash, and storage upload.
        if file_bytes is None:
            file_bytes = await file.read()
        if not file_bytes:
            raise ValueError("Uploaded file is empty")

        # Dedup check: reject if same file was uploaded within the window
        if not settings.DEV_MODE:
            try:
                import redis as redis_lib

                from app.core.config import settings as _s
                _redis = redis_lib.from_url(
                    _s.REDIS_URL, socket_connect_timeout=1, socket_timeout=1
                )
                file_hash = compute_hash(file_bytes)
                if is_duplicate_upload(
                    file_hash=file_hash,
                    org_id=str(tenant.org_id),
                    property_id=str(tenant.property_id),
                    redis_client=_redis,
                ):
                    logger.warning(
                        "Duplicate upload rejected",
                        file_hash=file_hash,
                        org_id=str(tenant.org_id),
                        property_id=str(tenant.property_id),
                    )
                    raise ValueError("Duplicate upload: identical file submitted within the dedup window")
            except ValueError:
                raise
            except Exception as exc:
                # Non-fatal: if Redis is unavailable, allow the upload
                logger.warning("Dedup check skipped", error=str(exc))

        # Step 1: Create scan record immediately (status "queued") so there is
        # always a DB row to track — even if storage later fails.
        scans_repo = await get_scans_repository()
        await scans_repo.create(
            tenant,
            {
                "id": str(scan_id),
                "property_id": str(tenant.property_id),
                "scan_type": scan_type,
                "status": "queued",
                "image_urls": [],
                "user_id": str(tenant.user_id),
                "processed_results": {
                    "stage_details": {
                        "request_id": request_id,
                        "upload": {
                            "status": "completed",
                            "filename": file.filename,
                            "content_type": file.content_type,
                            "size_bytes": len(file_bytes),
                        },
                        "storage": {"status": "pending"},
                        "ocr": {"status": "pending"},
                        "inventory": {"status": "pending"},
                        "baseline": {"status": "pending"},
                        "predictions": {"status": "pending"},
                    },
                    "stage_errors": [],
                },
            },
        )

        logger.info("Created scan record", scan_id=str(scan_id))

        # Step 2: Upload image to Supabase Storage (or stub in DEV_MODE).
        # Pass the already-read bytes so the file is not read a second time.
        try:
            storage_path, image_url = await self._upload_to_storage(
                file_bytes=file_bytes,
                file_content_type=file.content_type or "image/jpeg",
                file_name=file.filename or "scan.jpg",
                scan_id=scan_id,
                org_id=tenant.org_id,
                property_id=tenant.property_id,
            )
        except Exception as storage_exc:
            logger.exception(
                "Storage upload failed",
                scan_id=str(scan_id),
                request_id=request_id,
                error=str(storage_exc),
            )
            if settings.DEV_MODE:
                storage_path = f"{tenant.org_id}/{tenant.property_id}/{scan_id}.jpg"
                image_url = _dev_placeholder_url(str(scan_id))
            else:
                await scans_repo.update(
                    tenant,
                    scan_id,
                    {
                        "status": "failed",
                        "error_message": f"storage upload failed: {storage_exc}",
                        "processed_results": {
                            "stage_details": {
                                "request_id": request_id,
                                "upload": {
                                    "status": "completed",
                                    "filename": file.filename,
                                    "content_type": file.content_type,
                                    "size_bytes": len(file_bytes),
                                },
                                "storage": {
                                    "status": "failed",
                                    "message": str(storage_exc),
                                },
                            },
                            "stage_errors": [
                                {
                                    "stage": "storage",
                                    "error": str(storage_exc),
                                }
                            ],
                        },
                    },
                )
                raise RuntimeError("Storage upload failed. Please retry after verifying storage bucket configuration.")

        # Update the scan record with the resolved image URL
        await scans_repo.update(
            tenant,
            scan_id,
            {
                "image_urls": [storage_path],
                "processed_results": {
                    "stage_details": {
                        "request_id": request_id,
                        "upload": {
                            "status": "completed",
                            "filename": file.filename,
                            "content_type": file.content_type,
                            "size_bytes": len(file_bytes),
                        },
                        "storage": {
                            "status": "completed",
                            "path": storage_path,
                            "bucket": settings.STORAGE_BUCKET_RECEIPTS,
                        },
                        "ocr": {"status": "pending"},
                        "inventory": {"status": "pending"},
                        "baseline": {"status": "pending"},
                        "predictions": {"status": "pending"},
                    },
                    "stage_errors": [],
                },
            },
        )

        logger.info(
            "Storage upload complete",
            scan_id=str(scan_id),
            storage_path=storage_path,
        )

        # Step 3: Process scan in the background (no Redis/Celery needed).
        # asyncio.create_task schedules _process_scan_async on the running
        # event loop so the upload response returns immediately while the
        # AI pipeline runs concurrently.
        from app.tasks.scan_tasks import _process_scan_async

        def _on_task_done(task: asyncio.Task) -> None:
            if task.cancelled():
                logger.warning("Scan background task cancelled", scan_id=str(scan_id))
            elif task.exception():
                logger.exception(
                    "Scan background task raised an unhandled exception",
                    scan_id=str(scan_id),
                    exc_info=task.exception(),
                )

        bg_task = asyncio.create_task(
            _process_scan_async(
                task=None,
                scan_id=str(scan_id),
                org_id=str(tenant.org_id),
                property_id=str(tenant.property_id),
                user_id=str(tenant.user_id),
                image_url=image_url,
                scan_type=scan_type,
                request_id=request_id,
            )
        )
        bg_task.add_done_callback(_on_task_done)

        logger.info("Scan processing started in background", scan_id=str(scan_id))

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
        processed = scan.get("status") in {"completed", "partial_failed"}

        processed_results = scan.get("processed_results") or {}
        stage_details: dict[str, Any] | None = processed_results.get("stage_details")
        stage_errors: list[dict[str, Any]] | None = processed_results.get("stage_errors")

        # Extract items from processed_results when scan is complete.
        # VisionAgent stores items with key "item_name" — normalise to "name"
        # so the frontend doesn't need to know about the internal field name.
        extracted_items: list[dict] | None = None
        if processed:
            raw_items = processed_results.get("items") or []
            extracted_items = [
                {
                    "name": (it.get("item_name") or it.get("name") or "").strip(),
                    "quantity": it.get("quantity", 1),
                    "unit": it.get("unit", "unit"),
                    "confidence": float(it.get("confidence") or 0.8),
                }
                for it in raw_items
                if (it.get("item_name") or it.get("name") or "").strip()
            ]

        return ScanStatusResponse(
            scan_id=scan_id,
            processed=processed,
            status=scan.get("status", "unknown"),
            created_at=scan.get("created_at"),
            started_at=scan.get("started_at"),
            completed_at=scan.get("completed_at"),
            error_message=scan.get("error_message"),
            items_detected=scan.get("items_detected"),
            confidence_score=Decimal(str(scan["confidence_score"])) if scan.get("confidence_score") else None,
            stage_details=stage_details,
            stage_errors=stage_errors,
            extracted_items=extracted_items,
        )

    async def _upload_to_storage(
        self,
        file_bytes: bytes,
        file_content_type: str,
        file_name: str,
        scan_id: UUID,
        org_id: UUID,
        property_id: UUID,
    ) -> tuple[str, str]:
        """
        Upload file bytes to Supabase Storage and return (storage_path, image_url).

        Storage path format: {org_id}/{property_id}/{scan_id}.{ext}

        In DEV_MODE:
          - Skips the actual upload.
          - Returns a deterministic placeholder URL so downstream pipeline
            steps (VisionAgent stub, pattern/predict recompute) still run.

        In production:
          - Uploads to STORAGE_BUCKET_RECEIPTS.
          - Returns a signed URL (default) or public URL depending on
            STORAGE_PUBLIC_RECEIPTS setting.
          - Falls back to storage path if signed URL creation fails.

        Returns:
            Tuple of (storage_path, image_url).
            storage_path is stored in scans.image_urls[].
            image_url is passed to the background task for VisionAgent.
        """
        bucket = settings.STORAGE_BUCKET_RECEIPTS
        if not bucket:
            raise RuntimeError("STORAGE_BUCKET_RECEIPTS is not configured")
        ext = (
            file_name.rsplit(".", 1)[-1].lower()
            if file_name and "." in file_name
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
        client = await get_async_supabase_admin()
        if not client:
            raise RuntimeError("Supabase admin client unavailable for storage upload")

        await client.storage.from_(bucket).upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": file_content_type},
        )
        logger.info(
            "Uploaded receipt to storage",
            bucket=bucket,
            path=storage_path,
            size_bytes=len(file_bytes),
        )

        # -- Resolve image URL -------------------------------------------------
        image_url = await self._get_image_url(bucket, storage_path)
        if not image_url:
            logger.error(
                "Could not obtain image URL for uploaded scan",
                storage_path=storage_path,
            )
            raise RuntimeError(
                "Storage upload succeeded but Neumas could not create an OCR-readable image URL. "
                "Verify Supabase bucket permissions and signed URL configuration."
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
    ) -> ScanResponse:
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
            completed_at=scan.get("completed_at"),
            created_at=scan.get("created_at"),
            stage_details=(scan.get("processed_results") or {}).get("stage_details"),
            stage_errors=(scan.get("processed_results") or {}).get("stage_errors"),
        )

    async def rerun_with_hint(
        self,
        scan_id: UUID,
        tenant: TenantContext,
        hint: str,
    ) -> dict[str, str]:
        scans_repo = await get_scans_repository()
        scan = await scans_repo.get_by_id(tenant, scan_id)

        if not scan:
            logger.warning("Scan not found", scan_id=str(scan_id))
            raise ValueError(f"Scan {scan_id} not found")

        from app.tasks.scan_tasks import _reprocess_scan_async

        asyncio.create_task(_reprocess_scan_async(task=None, scan_id=str(scan_id), user_hint=hint))
        return {"scan_id": str(scan_id), "status": "queued", "hint": hint}

    async def list_scans(
        self,
        tenant: TenantContext,
        status_filter: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[ScanResponse]:
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
                stage_details=(scan.get("processed_results") or {}).get("stage_details"),
                stage_errors=(scan.get("processed_results") or {}).get("stage_errors"),
            )
            for scan in scans
        ]


async def get_scan_service() -> ScanService:
    """Get scan service instance."""
    return ScanService()
