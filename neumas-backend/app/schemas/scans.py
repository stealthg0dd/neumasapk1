"""
Scan schemas.
"""

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl


class ScanBase(BaseModel):
    """Base scan fields."""

    scan_type: Literal["full", "partial", "spot_check", "receipt", "barcode"] = "full"


class ScanCreate(ScanBase):
    """Create scan request."""

    property_id: UUID
    image_urls: list[str] = Field(..., min_length=1, max_length=10)


class ScanUploadRequest(BaseModel):
    """Request to get upload URLs for scan images."""

    property_id: UUID
    image_count: int = Field(..., ge=1, le=10)
    scan_type: Literal["full", "partial", "spot_check", "receipt", "barcode"] = "full"


class ScanUploadResponse(BaseModel):
    """Response with pre-signed upload URLs."""

    scan_id: UUID
    upload_urls: list[str]
    expires_in: int = 3600


class ScanResponse(ScanBase):
    """Scan response."""

    id: UUID
    property_id: UUID
    user_id: UUID
    status: str
    image_urls: list[str]
    items_detected: int
    confidence_score: Decimal | None
    processing_time_ms: int | None
    error_message: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ScanDetailResponse(ScanResponse):
    """Scan with full results."""

    raw_results: dict[str, Any]
    processed_results: dict[str, Any]


class ScanResultItem(BaseModel):
    """Individual item detected in scan."""

    inventory_item_id: UUID | None = None
    detected_name: str
    detected_quantity: Decimal
    confidence: Decimal
    bounding_box: dict[str, float] | None = None
    matched: bool = False
    suggested_match: "SuggestedMatch | None" = None


class SuggestedMatch(BaseModel):
    """Suggested match for unmatched item."""

    inventory_item_id: UUID
    name: str
    similarity_score: float


class ScanResults(BaseModel):
    """Processed scan results."""

    scan_id: UUID
    total_items_detected: int
    matched_items: int
    unmatched_items: int
    items: list[ScanResultItem]
    summary: dict[str, Any] = Field(default_factory=dict)


class ScanApprovalRequest(BaseModel):
    """Request to approve/confirm scan results."""

    confirmed_items: list["ConfirmedScanItem"]
    apply_updates: bool = True


class ConfirmedScanItem(BaseModel):
    """Confirmed scan item for approval."""

    detected_index: int = Field(..., description="Index in scan results")
    inventory_item_id: UUID
    confirmed_quantity: Decimal = Field(..., ge=0)
    create_if_missing: bool = False
    new_item_data: dict[str, Any] | None = None


class ScanHistoryRequest(BaseModel):
    """Request for scan history."""

    property_id: UUID
    from_date: datetime | None = None
    to_date: datetime | None = None
    status: str | None = None
    limit: int = Field(default=50, le=100)
    offset: int = 0


class ScanListResponse(BaseModel):
    """Paginated scan list response."""

    items: list[ScanResponse]
    total: int
    page: int
    page_size: int


class ScanStatsResponse(BaseModel):
    """Scan statistics for a property."""

    total_scans: int
    scans_this_week: int
    scans_this_month: int
    average_items_detected: float
    average_confidence: float
    average_processing_time_ms: float


# ============================================================================
# Scan Upload Schemas (multipart form)
# ============================================================================


class ScanUploadMultipartRequest(BaseModel):
    """Schema for scan upload via multipart form (for docs)."""

    scan_type: Literal["receipt", "barcode"] = Field(
        ..., description="Type of scan: receipt or barcode"
    )
    # Note: image is handled as UploadFile in route


class ScanQueuedResponse(BaseModel):
    """Response when scan is queued for processing."""

    scan_id: UUID
    status: str = "queued"
    message: str = "Scan uploaded and queued for processing"


class ScanStatusResponse(BaseModel):
    """Scan status check response."""

    scan_id: UUID
    processed: bool
    status: str
    created_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error_message: str | None = None
    items_detected: int | None = None
    # Extracted items from processed_results (present when status == "completed")
    extracted_items: list[dict[str, Any]] | None = None


# Forward references
ScanResultItem.model_rebuild()
