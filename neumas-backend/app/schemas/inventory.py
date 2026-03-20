"""
Inventory schemas.
"""

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class InventoryItemBase(BaseModel):
    """Base inventory item fields."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    sku: str | None = Field(None, max_length=100)
    barcode: str | None = Field(None, max_length=100)
    unit: str = "unit"
    category_id: UUID | None = None


class InventoryItemCreate(InventoryItemBase):
    """Create inventory item request."""

    property_id: UUID
    quantity: Decimal = Field(default=Decimal("0"), ge=0)
    min_quantity: Decimal = Field(default=Decimal("0"), ge=0)
    max_quantity: Decimal | None = Field(None, ge=0)
    reorder_point: Decimal | None = Field(None, ge=0)
    cost_per_unit: Decimal | None = Field(None, ge=0)
    supplier_info: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class InventoryItemUpdate(BaseModel):
    """Update inventory item request."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    sku: str | None = None
    barcode: str | None = None
    unit: str | None = None
    category_id: UUID | None = None
    min_quantity: Decimal | None = Field(None, ge=0)
    max_quantity: Decimal | None = Field(None, ge=0)
    reorder_point: Decimal | None = Field(None, ge=0)
    cost_per_unit: Decimal | None = Field(None, ge=0)
    supplier_info: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None
    is_active: bool | None = None


class InventoryItemResponse(InventoryItemBase):
    """Inventory item response."""

    id: UUID
    property_id: UUID
    quantity: Decimal
    min_quantity: Decimal
    max_quantity: Decimal | None
    reorder_point: Decimal | None
    cost_per_unit: Decimal | None
    supplier_info: dict[str, Any]
    metadata: dict[str, Any]
    is_active: bool
    last_scanned_at: datetime | None
    created_at: datetime
    updated_at: datetime
    category: "CategorySummary | None" = None

    model_config = {"from_attributes": True}

    @property
    def is_low_stock(self) -> bool:
        threshold = self.reorder_point or self.min_quantity
        return self.quantity <= threshold

    @property
    def stock_status(self) -> str:
        if self.quantity <= 0:
            return "out_of_stock"
        if self.is_low_stock:
            return "low_stock"
        if self.max_quantity and self.quantity >= self.max_quantity:
            return "overstocked"
        return "normal"


class InventoryItemSummary(BaseModel):
    """Inventory item summary (for lists)."""

    id: UUID
    name: str
    sku: str | None
    quantity: Decimal
    unit: str
    stock_status: str
    category_name: str | None = None

    model_config = {"from_attributes": True}


class QuantityAdjustment(BaseModel):
    """Quantity adjustment request."""

    adjustment: Decimal = Field(..., description="Positive or negative adjustment")
    reason: str | None = Field(None, max_length=500)


class QuantitySet(BaseModel):
    """Set quantity request."""

    quantity: Decimal = Field(..., ge=0)
    reason: str | None = Field(None, max_length=500)


class BulkQuantityUpdate(BaseModel):
    """Bulk quantity update from scan."""

    item_id: UUID
    quantity: Decimal = Field(..., ge=0)


class BulkUpdateRequest(BaseModel):
    """Bulk update request."""

    updates: list[BulkQuantityUpdate]
    source: str = Field(default="manual", description="Source of update (scan, manual)")


# ============================================================================
# Category Schemas
# ============================================================================


class CategoryBase(BaseModel):
    """Base category fields."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    parent_id: UUID | None = None
    sort_order: int = 0


class CategoryCreate(CategoryBase):
    """Create category request."""

    organization_id: UUID


class CategoryUpdate(BaseModel):
    """Update category request."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    parent_id: UUID | None = None
    sort_order: int | None = None


class CategoryResponse(CategoryBase):
    """Category response."""

    id: UUID
    organization_id: UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class CategorySummary(BaseModel):
    """Category summary."""

    id: UUID
    name: str

    model_config = {"from_attributes": True}


class CategoryTree(CategoryResponse):
    """Category with children."""

    children: list["CategoryTree"] = Field(default_factory=list)
    item_count: int = 0


# ============================================================================
# List Responses
# ============================================================================


class InventoryListResponse(BaseModel):
    """Paginated inventory list response."""

    items: list[InventoryItemResponse]
    total: int
    page: int
    page_size: int
    low_stock_count: int = 0


# ============================================================================
# Inventory Update Schemas (for POST /api/inventory/update)
# ============================================================================


class InventoryUpdateRequest(BaseModel):
    """Request to upsert inventory item."""

    property_id: UUID
    item_name: str = Field(..., min_length=1, max_length=255)
    new_qty: Decimal = Field(..., ge=0)
    unit: str = Field(default="unit", max_length=50)
    trigger_prediction: bool = Field(
        default=True,
        description="Whether to trigger pattern + prediction recalculation",
    )


class InventoryUpdateResponse(BaseModel):
    """Response from inventory update."""

    item_id: UUID
    item_name: str
    previous_qty: Decimal | None
    new_qty: Decimal
    created: bool = False
    prediction_task_id: str | None = None


class InventorySearchRequest(BaseModel):
    """Inventory search request."""

    query: str | None = None
    category_id: UUID | None = None
    stock_status: str | None = Field(None, pattern=r"^(low_stock|out_of_stock|normal|overstocked)$")
    min_quantity: Decimal | None = None
    max_quantity: Decimal | None = None


# Forward references
InventoryItemResponse.model_rebuild()
CategoryTree.model_rebuild()
