"""
Scan routes for receipt/barcode processing.
"""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    Query,
    UploadFile,
    status,
)
from pydantic import BaseModel

from app.api.deps import TenantContext, get_tenant_context, require_property
from app.core.logging import get_logger
from app.schemas.scans import (
    ScanQueuedResponse,
    ScanResponse,
    ScanStatusResponse,
)
from app.services.scan_service import ScanService

logger = get_logger(__name__)
router = APIRouter()

# Service instance
scan_service = ScanService()


class ScanRerunRequest(BaseModel):
    hint: str


@router.post(
    "/upload",
    response_model=ScanQueuedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload scan",
    description="Upload a receipt or barcode image for processing.",
)
async def upload_scan(
    request: Request,
    file: Annotated[UploadFile, File(description="Image file (JPEG, PNG, WebP)")],
    scan_type: Annotated[
        Literal["receipt", "barcode"],
        Form(description="Type of scan"),
    ] = "receipt",
    tenant: TenantContext = require_property(),
) -> ScanQueuedResponse:
    """
    Upload an image for scan processing.

    Accepts receipt or barcode images. The image will be:
    1. Uploaded to storage
    2. Queued for AI processing
    3. Results saved to database

    Returns scan_id to check status later.
    """
    # Validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an image (JPEG, PNG, WebP)",
        )

    # Validate file size (max 10MB)
    MAX_SIZE = 10 * 1024 * 1024
    file_bytes = await file.read()
    if len(file_bytes) > MAX_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large. Maximum size is 10MB.",
        )
    request_id = getattr(request.state, "request_id", None)

    try:
        return await scan_service.upload_scan(
            file=file,
            file_bytes=file_bytes,
            scan_type=scan_type,
            tenant=tenant,
            request_id=request_id,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.exception(
            "Scan upload failed",
            error=str(e),
            request_id=request_id,
            property_id=str(tenant.property_id),
            scan_type=scan_type,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process scan upload: {e}",
        )


@router.get(
    "/{scan_id}/status",
    response_model=ScanStatusResponse,
    summary="Get scan status",
    description="Check the processing status of a scan.",
)
async def get_scan_status(
    scan_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> ScanStatusResponse:
    """
    Get the current status of a scan.

    Statuses:
    - queued: Waiting to be processed
    - processing: Currently being analyzed
    - completed: Processing finished successfully
    - failed: Processing failed
    """
    try:
        return await scan_service.get_scan_status(scan_id, tenant)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        logger.error("Failed to get scan status", scan_id=str(scan_id), error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve scan status",
        )


@router.get(
    "/{scan_id}",
    response_model=ScanResponse,
    summary="Get scan details",
    description="Get full details of a completed scan.",
)
async def get_scan(
    scan_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> ScanResponse:
    """Get full scan details including detected items."""
    try:
        return await scan_service.get_scan(scan_id, tenant)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        logger.error("Failed to get scan", scan_id=str(scan_id), error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve scan",
        )


@router.post(
    "/{scan_id}/rerun",
    summary="Re-run scan with operator hint",
)
async def rerun_scan(
    scan_id: UUID,
    body: ScanRerunRequest,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> dict[str, str]:
    try:
        return await scan_service.rerun_with_hint(scan_id, tenant, body.hint)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        logger.error("Failed to rerun scan", scan_id=str(scan_id), error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to queue scan rerun",
        )


@router.get(
    "/",
    response_model=list[ScanResponse],
    summary="List scans",
    description="List scans for the current property.",
)
async def list_scans(
    tenant: TenantContext = require_property(),
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[ScanResponse]:
    """List scans for the current property with optional status filter."""
    try:
        return await scan_service.list_scans(
            tenant=tenant,
            status_filter=status_filter,
            limit=limit,
            offset=offset,
        )
    except Exception as e:
        logger.error("Failed to list scans", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve scans",
        )
