"""
SQLAlchemy models mirroring Supabase schema.
These models are for type safety and ORM operations.
"""

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.ext.asyncio import AsyncAttrs, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.core.config import settings


# Base class for all models
class Base(AsyncAttrs, DeclarativeBase):
    """Base class for SQLAlchemy models."""

    type_annotation_map = {
        dict[str, Any]: JSONB,
    }


# Async engine and session factory
if settings.DATABASE_URL:
    # Convert postgres:// to postgresql+asyncpg://
    db_url = settings.DATABASE_URL.replace(
        "postgres://", "postgresql+asyncpg://"
    ).replace("postgresql://", "postgresql+asyncpg://")

    engine = create_async_engine(
        db_url,
        echo=settings.DEBUG,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )
    async_session_factory = async_sessionmaker(
        engine,
        expire_on_commit=False,
        autoflush=False,
    )
else:
    engine = None
    async_session_factory = None


# ============================================================================
# Organization Models
# ============================================================================


class Organization(Base):
    """Organization/company account."""

    __tablename__ = "organizations"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    settings: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    subscription_tier: Mapped[str] = mapped_column(
        String(50), default="free", nullable=False
    )
    subscription_status: Mapped[str] = mapped_column(
        String(50), default="active", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    properties: Mapped[list["Property"]] = relationship(back_populates="organization")
    users: Mapped[list["User"]] = relationship(back_populates="organization")


class Property(Base):
    """Property/location within an organization."""

    __tablename__ = "properties"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str | None] = mapped_column(Text)
    settings: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    timezone: Mapped[str] = mapped_column(String(50), default="UTC")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    organization: Mapped["Organization"] = relationship(back_populates="properties")
    inventory_items: Mapped[list["InventoryItem"]] = relationship(
        back_populates="property"
    )
    scans: Mapped[list["Scan"]] = relationship(back_populates="property")


# ============================================================================
# User Models
# ============================================================================


class User(Base):
    """Application user (linked to Supabase Auth)."""

    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    auth_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), unique=True, nullable=False
    )  # Supabase auth.users.id
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(50), default="member", nullable=False)
    permissions: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    preferences: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    organization: Mapped["Organization"] = relationship(back_populates="users")


# ============================================================================
# Inventory Models
# ============================================================================


class InventoryItem(Base):
    """Inventory item tracked in a property."""

    __tablename__ = "inventory_items"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    property_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("properties.id"), nullable=False
    )
    category_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("inventory_categories.id")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    sku: Mapped[str | None] = mapped_column(String(100))
    barcode: Mapped[str | None] = mapped_column(String(100))
    unit: Mapped[str] = mapped_column(String(50), default="unit")
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    min_quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    max_quantity: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    reorder_point: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    cost_per_unit: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    supplier_info: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    metadata: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_scanned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    property: Mapped["Property"] = relationship(back_populates="inventory_items")
    category: Mapped["InventoryCategory | None"] = relationship(
        back_populates="items"
    )


class InventoryCategory(Base):
    """Category for organizing inventory items."""

    __tablename__ = "inventory_categories"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    parent_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("inventory_categories.id")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    items: Mapped[list["InventoryItem"]] = relationship(back_populates="category")


# ============================================================================
# Scan Models
# ============================================================================


class Scan(Base):
    """Inventory scan session."""

    __tablename__ = "scans"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    property_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("properties.id"), nullable=False
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(50), default="pending", nullable=False
    )  # pending, processing, completed, failed
    scan_type: Mapped[str] = mapped_column(
        String(50), default="full", nullable=False
    )  # full, partial, spot_check
    image_urls: Mapped[list[str]] = mapped_column(JSONB, default=list)
    raw_results: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    processed_results: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    items_detected: Mapped[int] = mapped_column(Integer, default=0)
    confidence_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    processing_time_ms: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    property: Mapped["Property"] = relationship(back_populates="scans")


# ============================================================================
# Pattern & Prediction Models
# ============================================================================


class ConsumptionPattern(Base):
    """Learned consumption pattern for an inventory item."""

    __tablename__ = "consumption_patterns"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    item_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("inventory_items.id"), nullable=False
    )
    pattern_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # daily, weekly, seasonal, event
    pattern_data: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    confidence: Mapped[Decimal] = mapped_column(Numeric(5, 4), default=0)
    sample_size: Mapped[int] = mapped_column(Integer, default=0)
    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Prediction(Base):
    """Inventory prediction/forecast."""

    __tablename__ = "predictions"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    property_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("properties.id"), nullable=False
    )
    item_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("inventory_items.id")
    )
    prediction_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # demand, stockout, reorder
    prediction_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    predicted_value: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    confidence_interval_low: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    confidence_interval_high: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    confidence: Mapped[Decimal] = mapped_column(Numeric(5, 4), default=0)
    model_version: Mapped[str | None] = mapped_column(String(50))
    features_used: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    actual_value: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


# ============================================================================
# Shopping List Models
# ============================================================================


class ShoppingList(Base):
    """Generated shopping list."""

    __tablename__ = "shopping_lists"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    property_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("properties.id"), nullable=False
    )
    created_by_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), default="draft", nullable=False
    )  # draft, approved, ordered, received
    total_estimated_cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    total_actual_cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    budget_limit: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    notes: Mapped[str | None] = mapped_column(Text)
    generation_params: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    items: Mapped[list["ShoppingListItem"]] = relationship(back_populates="shopping_list")


class ShoppingListItem(Base):
    """Item in a shopping list."""

    __tablename__ = "shopping_list_items"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    shopping_list_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("shopping_lists.id"), nullable=False
    )
    inventory_item_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("inventory_items.id")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    unit: Mapped[str] = mapped_column(String(50), default="unit")
    estimated_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    actual_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    priority: Mapped[str] = mapped_column(
        String(20), default="normal"
    )  # critical, high, normal, low
    reason: Mapped[str | None] = mapped_column(Text)  # Why this item was suggested
    is_purchased: Mapped[bool] = mapped_column(Boolean, default=False)
    purchased_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    shopping_list: Mapped["ShoppingList"] = relationship(back_populates="items")


# Helper function to get async session
async def get_db_session():
    """Get async database session."""
    if async_session_factory is None:
        raise RuntimeError("Database not configured. Set DATABASE_URL in environment.")
    async with async_session_factory() as session:
        yield session
