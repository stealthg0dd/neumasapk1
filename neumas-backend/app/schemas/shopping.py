"""
Shopping list schemas.
"""

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ShoppingListBase(BaseModel):
    """Base shopping list fields."""

    name: str = Field(..., min_length=1, max_length=255)
    notes: str | None = None
    budget_limit: Decimal | None = Field(None, ge=0)


class ShoppingListCreate(ShoppingListBase):
    """Create shopping list request."""

    property_id: UUID
    items: list["ShoppingListItemCreate"] = Field(default_factory=list)


class ShoppingListUpdate(BaseModel):
    """Update shopping list request."""

    name: str | None = Field(None, min_length=1, max_length=255)
    notes: str | None = None
    budget_limit: Decimal | None = None
    status: Literal["draft", "approved", "ordered", "received"] | None = None


class ShoppingListResponse(ShoppingListBase):
    """Shopping list response."""

    id: UUID
    property_id: UUID
    created_by_id: UUID
    status: str
    total_estimated_cost: Decimal | None
    total_actual_cost: Decimal | None
    approved_at: datetime | None
    approved_by_id: UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ShoppingListDetailResponse(ShoppingListResponse):
    """Shopping list with items."""

    items: list["ShoppingListItemResponse"]
    totals: "ShoppingListTotals | None" = None


class ShoppingListTotals(BaseModel):
    """Shopping list cost totals."""

    total_items: int
    purchased_items: int
    estimated_total: Decimal
    actual_total: Decimal
    budget_remaining: Decimal | None = None
    completion_percentage: float


# ============================================================================
# Shopping List Item Schemas
# ============================================================================


class ShoppingListItemBase(BaseModel):
    """Base shopping list item fields."""

    name: str = Field(..., min_length=1, max_length=255)
    quantity: Decimal = Field(..., gt=0)
    unit: str = "unit"
    priority: Literal["critical", "high", "normal", "low"] = "normal"
    reason: str | None = None


class ShoppingListItemCreate(ShoppingListItemBase):
    """Create shopping list item."""

    inventory_item_id: UUID | None = None
    estimated_price: Decimal | None = Field(None, ge=0)


class ShoppingListItemUpdate(BaseModel):
    """Update shopping list item."""

    name: str | None = None
    quantity: Decimal | None = Field(None, gt=0)
    unit: str | None = None
    priority: Literal["critical", "high", "normal", "low"] | None = None
    estimated_price: Decimal | None = None
    actual_price: Decimal | None = None
    reason: str | None = None


class ShoppingListItemResponse(ShoppingListItemBase):
    """Shopping list item response."""

    id: UUID
    shopping_list_id: UUID
    inventory_item_id: UUID | None
    estimated_price: Decimal | None
    actual_price: Decimal | None
    is_purchased: bool
    purchased_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MarkPurchasedRequest(BaseModel):
    """Mark items as purchased."""

    item_ids: list[UUID]
    actual_prices: dict[str, Decimal] | None = Field(
        None,
        description="Map of item_id -> actual_price",
    )


# ============================================================================
# Shopping List Generation Schemas
# ============================================================================


class GenerateShoppingListRequest(BaseModel):
    """Request to auto-generate shopping list."""

    property_id: UUID
    name: str | None = None
    include_low_stock: bool = True
    include_predicted_needs: bool = True
    days_ahead: int = Field(default=7, ge=1, le=30)
    budget_limit: Decimal | None = Field(None, ge=0)
    exclude_categories: list[UUID] | None = None
    priority_threshold: Literal["critical", "high", "normal", "low"] | None = None


class GeneratedShoppingListResponse(BaseModel):
    """Response from shopping list generation."""

    shopping_list: ShoppingListDetailResponse
    generation_summary: "GenerationSummary"


class GenerationSummary(BaseModel):
    """Summary of how list was generated."""

    low_stock_items_added: int
    predicted_needs_added: int
    items_excluded_by_budget: int
    items_excluded_by_category: int
    total_estimated_cost: Decimal
    budget_utilization: float | None = None


# ============================================================================
# Budget Optimization Schemas
# ============================================================================


class OptimizeBudgetRequest(BaseModel):
    """Request to optimize shopping list for budget."""

    shopping_list_id: UUID
    budget_limit: Decimal = Field(..., gt=0)
    optimization_strategy: Literal[
        "priority_first",
        "lowest_cost",
        "balanced",
    ] = "priority_first"


class OptimizeBudgetResponse(BaseModel):
    """Budget optimization result."""

    shopping_list_id: UUID
    original_cost: Decimal
    optimized_cost: Decimal
    savings: Decimal
    items_removed: list["RemovedItemSummary"]
    items_reduced: list["ReducedItemSummary"]


class RemovedItemSummary(BaseModel):
    """Summary of item removed during optimization."""

    item_id: UUID
    name: str
    estimated_cost: Decimal


class ReducedItemSummary(BaseModel):
    """Summary of item quantity reduced during optimization."""

    item_id: UUID
    name: str
    original_quantity: Decimal
    reduced_quantity: Decimal
    savings: Decimal


# ============================================================================
# Shopping List Generation (simplified for API)
# ============================================================================


class GenerateListRequest(BaseModel):
    """Request to generate shopping list via Celery."""

    property_id: UUID
    preferred_store: str | None = Field(
        None,
        max_length=100,
        description="Preferred store for price lookup",
    )


class GenerateListResponse(BaseModel):
    """Response when generation is enqueued."""

    job_id: str
    message: str = "generation_started"
    property_id: UUID


# ============================================================================
# Order Deep Link Schemas
# ============================================================================


class DeepLinkItem(BaseModel):
    """Item for deep link generation."""

    name: str = Field(..., min_length=1, max_length=255)
    qty: int = Field(..., ge=1)


class OrderDeepLinkRequest(BaseModel):
    """Request to generate order deep link."""

    property_id: UUID
    platform: Literal["grab", "redmart", "shopee"]
    items: list[DeepLinkItem] | None = Field(
        None,
        description="Items to include. If not provided, uses latest shopping list.",
    )


class OrderDeepLinkResponse(BaseModel):
    """Deep link response."""

    platform: str
    deep_link_url: str
    items_count: int
    note: str | None = None
    reason: str | None = None


# ============================================================================
# List Responses
# ============================================================================


class ShoppingListListResponse(BaseModel):
    """Paginated shopping list response."""

    items: list[ShoppingListResponse]
    total: int
    page: int
    page_size: int


# ============================================================================
# Simplified schemas used by shopping service active-list view
# ============================================================================


class ShoppingListItem(BaseModel):
    """Simplified item for active shopping list view."""

    id: UUID
    name: str
    quantity: Decimal
    unit: str | None = None
    category: str | None = None
    estimated_price: Decimal | None = None
    reason: str | None = None
    checked: bool = False


class ActiveShoppingListResponse(BaseModel):
    """Response returned by get_active_list."""

    id: UUID
    property_id: UUID
    name: str
    status: str
    items: list[ShoppingListItem]
    total_items: int
    total_estimated_cost: Decimal | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


# Forward references
ShoppingListCreate.model_rebuild()
ShoppingListDetailResponse.model_rebuild()
GeneratedShoppingListResponse.model_rebuild()
OptimizeBudgetResponse.model_rebuild()
