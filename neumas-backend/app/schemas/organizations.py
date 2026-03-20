"""
Organization schemas.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class OrganizationBase(BaseModel):
    """Base organization fields."""

    name: str = Field(..., min_length=2, max_length=255)
    slug: str | None = Field(None, min_length=2, max_length=100, pattern=r"^[a-z0-9-]+$")


class OrganizationCreate(OrganizationBase):
    """Create organization request."""

    settings: dict[str, Any] = Field(default_factory=dict)


class OrganizationUpdate(BaseModel):
    """Update organization request."""

    name: str | None = Field(None, min_length=2, max_length=255)
    settings: dict[str, Any] | None = None


class OrganizationResponse(OrganizationBase):
    """Organization response."""

    id: UUID
    settings: dict[str, Any]
    subscription_tier: str
    subscription_status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OrganizationWithProperties(OrganizationResponse):
    """Organization with properties list."""

    properties: list["PropertySummary"] = Field(default_factory=list)


class OrganizationSettings(BaseModel):
    """Organization settings schema."""

    default_timezone: str = "UTC"
    default_currency: str = "USD"
    notification_preferences: dict[str, bool] = Field(default_factory=dict)
    feature_flags: dict[str, bool] = Field(default_factory=dict)


# ============================================================================
# Property Schemas
# ============================================================================


class PropertyBase(BaseModel):
    """Base property fields."""

    name: str = Field(..., min_length=2, max_length=255)
    address: str | None = None
    timezone: str = "UTC"


class PropertyCreate(PropertyBase):
    """Create property request."""

    organization_id: UUID
    settings: dict[str, Any] = Field(default_factory=dict)


class PropertyUpdate(BaseModel):
    """Update property request."""

    name: str | None = Field(None, min_length=2, max_length=255)
    address: str | None = None
    timezone: str | None = None
    settings: dict[str, Any] | None = None
    is_active: bool | None = None


class PropertyResponse(PropertyBase):
    """Property response."""

    id: UUID
    organization_id: UUID
    settings: dict[str, Any]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PropertySummary(BaseModel):
    """Property summary (for lists)."""

    id: UUID
    name: str
    address: str | None = None
    is_active: bool

    model_config = {"from_attributes": True}


class PropertyWithStats(PropertyResponse):
    """Property with inventory statistics."""

    inventory_summary: "InventorySummary | None" = None


class InventorySummary(BaseModel):
    """Inventory summary stats."""

    total_items: int = 0
    low_stock_count: int = 0
    out_of_stock_count: int = 0
    total_value: float | None = None


# ============================================================================
# User Management (within org)
# ============================================================================


class UserBase(BaseModel):
    """Base user fields."""

    email: str
    full_name: str | None = None
    role: str = "member"


class UserCreate(UserBase):
    """Create user request."""

    organization_id: UUID
    auth_id: UUID


class UserUpdate(BaseModel):
    """Update user request."""

    full_name: str | None = None
    role: str | None = None
    permissions: dict[str, bool] | None = None
    is_active: bool | None = None


class UserResponse(UserBase):
    """User response."""

    id: UUID
    organization_id: UUID
    is_active: bool
    last_login_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserListResponse(BaseModel):
    """Paginated user list response."""

    items: list[UserResponse]
    total: int
    page: int
    page_size: int


# Forward references
OrganizationWithProperties.model_rebuild()
PropertyWithStats.model_rebuild()
