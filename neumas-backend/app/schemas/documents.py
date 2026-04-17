"""
Document schemas for the Neumas API.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class DocumentLineItemBase(BaseModel):
    """Base schema for a document line item."""
    raw_name: str
    raw_quantity: float | None = None
    raw_unit: str | None = None
    raw_price: float | None = None
    raw_total: float | None = None


class DocumentLineItemResponse(DocumentLineItemBase):
    """Response schema for a document line item."""
    id: UUID
    document_id: UUID
    normalized_name: str | None = None
    normalized_quantity: float | None = None
    normalized_unit: str | None = None
    unit_price: float | None = None
    canonical_item_id: UUID | None = None
    vendor_id: UUID | None = None
    confidence: float | None = None
    review_needed: bool = False
    review_reason: str | None = None
    inventory_movement_id: UUID | None = None
    created_at: datetime


class DocumentLineItemUpdate(BaseModel):
    """Operator correction to a document line item."""
    normalized_name: str | None = None
    normalized_quantity: float | None = None
    normalized_unit: str | None = None
    unit_price: float | None = None
    canonical_item_id: UUID | None = None


class DocumentResponse(BaseModel):
    """Response schema for a document."""
    id: UUID
    property_id: UUID | None = None
    org_id: UUID
    scan_id: UUID | None = None
    document_type: str
    status: str
    raw_vendor_name: str | None = None
    vendor_id: UUID | None = None
    overall_confidence: float | None = None
    review_needed: bool
    review_reason: str | None = None
    reviewed_at: datetime | None = None
    approved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    line_items: list[DocumentLineItemResponse] = Field(default_factory=list)


class DocumentListResponse(BaseModel):
    """Paginated list of documents."""
    documents: list[DocumentResponse]
    total: int
    page: int
    page_size: int


class DocumentApproveRequest(BaseModel):
    """Request to approve and post a document to inventory."""
    notes: str | None = None


class DocumentReviewQueueResponse(BaseModel):
    """Document review queue entry."""
    document_id: UUID
    scan_id: UUID | None = None
    document_type: str
    raw_vendor_name: str | None = None
    overall_confidence: float | None = None
    review_reason: str | None = None
    items_needing_review: int
    total_items: int
    created_at: datetime
