from __future__ import annotations

"""
Inventory service for managing inventory items and triggering predictions.
"""

from decimal import Decimal
from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.celery_app import celery_app
from app.core.logging import get_logger
from app.db.repositories.inventory import get_inventory_repository
from app.schemas.inventory import (
    InventoryItemCreate,
    InventoryItemResponse,
    InventoryItemSummary,
    InventoryUpdateRequest,
    InventoryUpdateResponse,
)

logger = get_logger(__name__)


def _compute_stock_status(item: dict[str, Any]) -> str:
    """Derive stock_status from quantity vs reorder_point / min_quantity."""
    qty = Decimal(str(item.get("quantity") or 0))
    rp_raw = item.get("reorder_point") or item.get("min_quantity") or 0
    rp = Decimal(str(rp_raw))
    if qty <= 0:
        return "out_of_stock"
    if rp > 0 and qty <= rp:
        return "low_stock"
    return "normal"


class InventoryService:
    """Service for inventory management operations."""

    async def get_property_inventory(
        self,
        property_id: UUID,
        tenant: TenantContext,
    ) -> list[InventoryItemResponse]:
        """
        Get all inventory items for a property.

        Args:
            property_id: Property to get inventory for
            tenant: Current tenant context

        Returns:
            List of inventory items
        """
        logger.info(
            "Fetching property inventory",
            property_id=str(property_id),
            user_id=str(tenant.user_id),
        )

        inventory_repo = await get_inventory_repository()
        items = await inventory_repo.get_by_property(property_id, tenant)

        logger.info(
            "Retrieved inventory items",
            property_id=str(property_id),
            item_count=len(items),
        )

        return [
            InventoryItemResponse(
                id=UUID(item["id"]),
                property_id=UUID(item["property_id"]),
                name=item["name"],
                quantity=Decimal(str(item.get("quantity", 0))),
                unit=item.get("unit", "unit"),
                category_id=UUID(item["category_id"]) if item.get("category_id") else None,
                sku=item.get("sku"),
                barcode=item.get("barcode"),
                description=item.get("description"),
                min_quantity=Decimal(str(item.get("min_quantity", 0))),
                max_quantity=Decimal(str(item["max_quantity"])) if item.get("max_quantity") else None,
                reorder_point=Decimal(str(item["reorder_point"])) if item.get("reorder_point") else None,
                cost_per_unit=Decimal(str(item["cost_per_unit"])) if item.get("cost_per_unit") else None,
                supplier_info=item.get("supplier_info") or {},
                metadata=item.get("metadata") or {},
                is_active=item.get("is_active", True),
                last_scanned_at=item.get("last_scanned_at"),
                created_at=item.get("created_at"),
                updated_at=item.get("updated_at"),
            )
            for item in items
        ]

    async def update_item(
        self,
        request: InventoryUpdateRequest,
        tenant: TenantContext,
    ) -> InventoryUpdateResponse:
        """
        Update inventory item quantity.

        Optionally triggers prediction regeneration.

        Args:
            request: Update request with item details
            tenant: Current tenant context

        Returns:
            InventoryUpdateResponse with update results

        Raises:
            ValueError: If item not found or property mismatch
        """
        logger.info(
            "Updating inventory item",
            property_id=str(request.property_id),
            item_name=request.item_name,
            new_qty=str(request.new_qty),
        )

        inventory_repo = await get_inventory_repository()

        # Try to find existing item by name
        existing_item = await inventory_repo.get_by_name(
            property_id=request.property_id,
            name=request.item_name,
            tenant=tenant,
        )

        item_id: UUID
        previous_qty: Decimal | None = None
        created = False
        prediction_task_id: str | None = None

        if existing_item:
            # Update existing item
            item_id = UUID(existing_item["id"])
            previous_qty = Decimal(str(existing_item.get("quantity", 0)))

            await inventory_repo.update(
                item_id=item_id,
                data={"quantity": str(request.new_qty), "unit": request.unit},
                tenant=tenant,
            )

            logger.info(
                "Updated existing inventory item",
                item_id=str(item_id),
                previous_qty=str(previous_qty),
                new_qty=str(request.new_qty),
            )
        else:
            # Create new item
            new_item = await inventory_repo.create(
                {
                    "property_id": str(request.property_id),
                    "name": request.item_name,
                    "quantity": str(request.new_qty),
                    "unit": request.unit,
                },
                tenant,
            )
            item_id = UUID(new_item["id"])
            created = True

            logger.info(
                "Created new inventory item",
                item_id=str(item_id),
                name=request.item_name,
            )

        # Optionally trigger prediction regeneration
        if request.trigger_prediction:
            task = celery_app.send_task(
                "app.tasks.prediction_tasks.regenerate_predictions",
                args=[str(request.property_id), str(item_id)],
                queue="neumas.predictions",
            )
            prediction_task_id = task.id

            logger.info(
                "Triggered prediction regeneration",
                property_id=str(request.property_id),
                item_id=str(item_id),
                task_id=prediction_task_id,
            )

        return InventoryUpdateResponse(
            item_id=item_id,
            previous_qty=previous_qty,
            new_qty=request.new_qty,
            created=created,
            prediction_task_id=prediction_task_id,
        )

    async def list_items(
        self,
        tenant: TenantContext,
        category_id: UUID | None = None,
        status_filter: str | None = None,
        search: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[InventoryItemSummary]:
        """
        List inventory items with filters.

        Args:
            tenant: Current tenant context
            category_id: Optional category filter
            status_filter: Optional stock status filter
            search: Optional search term
            limit: Max items to return
            offset: Offset for pagination

        Returns:
            List of inventory item summaries
        """
        inventory_repo = await get_inventory_repository()
        items = await inventory_repo.list_items(
            property_id=tenant.property_id,
            tenant=tenant,
            category_id=category_id,
            status_filter=status_filter,
            search=search,
            limit=limit,
            offset=offset,
        )

        return [
            InventoryItemSummary(
                id=UUID(item["id"]),
                name=item["name"],
                sku=item.get("sku"),
                quantity=Decimal(str(item.get("quantity", 0))),
                unit=item.get("unit", "unit"),
                stock_status=_compute_stock_status(item),
                reorder_point=Decimal(str(item["reorder_point"])) if item.get("reorder_point") else None,
                updated_at=item.get("updated_at"),
                category_name=item.get("category", {}).get("name") if item.get("category") else None,
            )
            for item in items
        ]

    async def get_item(
        self,
        item_id: UUID,
        tenant: TenantContext,
    ) -> InventoryItemResponse | None:
        """Get a single inventory item by ID."""
        inventory_repo = await get_inventory_repository()
        item = await inventory_repo.get_by_id(item_id, tenant)

        if not item:
            return None

        return InventoryItemResponse(
            id=UUID(item["id"]),
            property_id=UUID(item["property_id"]),
            name=item["name"],
            quantity=Decimal(str(item.get("quantity", 0))),
            unit=item.get("unit", "unit"),
            category_id=UUID(item["category_id"]) if item.get("category_id") else None,
            sku=item.get("sku"),
            barcode=item.get("barcode"),
            description=item.get("description"),
            min_quantity=Decimal(str(item.get("min_quantity", 0))),
            max_quantity=Decimal(str(item["max_quantity"])) if item.get("max_quantity") else None,
            reorder_point=Decimal(str(item["reorder_point"])) if item.get("reorder_point") else None,
            cost_per_unit=Decimal(str(item["cost_per_unit"])) if item.get("cost_per_unit") else None,
            supplier_info=item.get("supplier_info") or {},
            metadata=item.get("metadata") or {},
            is_active=item.get("is_active", True),
            last_scanned_at=item.get("last_scanned_at"),
            created_at=item.get("created_at"),
            updated_at=item.get("updated_at"),
        )

    async def create_item(
        self,
        item: InventoryItemCreate,
        tenant: TenantContext,
    ) -> InventoryItemResponse:
        """Create a new inventory item."""

        inventory_repo = await get_inventory_repository()
        new_item = await inventory_repo.create(
            {
                "property_id": str(tenant.property_id),
                "name": item.name,
                "description": item.description,
                "sku": item.sku,
                "barcode": item.barcode,
                "unit": item.unit,
                "category_id": str(item.category_id) if item.category_id else None,
                "quantity": str(item.quantity),
                "min_quantity": str(item.min_quantity),
                "max_quantity": str(item.max_quantity) if item.max_quantity else None,
                "cost_per_unit": str(item.cost_per_unit) if item.cost_per_unit else None,
            },
            tenant,
        )

        return await self.get_item(UUID(new_item["id"]), tenant)

    async def delete_item(
        self,
        item_id: UUID,
        tenant: TenantContext,
    ) -> bool:
        """Soft delete an inventory item."""
        inventory_repo = await get_inventory_repository()
        return await inventory_repo.soft_delete(item_id, tenant)

    async def adjust_quantity(
        self,
        item_id: UUID,
        adjustment: float,
        tenant: TenantContext,
        reason: str | None = None,
    ) -> InventoryItemResponse | None:
        """
        Adjust inventory quantity.

        Args:
            item_id: Item to adjust
            adjustment: Amount to add (negative to subtract)
            tenant: Current tenant context
            reason: Optional reason for adjustment

        Returns:
            Updated inventory item
        """
        inventory_repo = await get_inventory_repository()

        # Get current item
        item = await inventory_repo.get_by_id(item_id, tenant)
        if not item:
            return None

        current_qty = Decimal(str(item.get("quantity", 0)))
        new_qty = current_qty + Decimal(str(adjustment))

        # Don't allow negative quantities
        if new_qty < 0:
            raise ValueError("Adjustment would result in negative quantity")

        await inventory_repo.update(
            item_id=item_id,
            data={"quantity": str(new_qty)},
            tenant=tenant,
        )

        logger.info(
            "Adjusted inventory quantity",
            item_id=str(item_id),
            previous_qty=str(current_qty),
            adjustment=str(adjustment),
            new_qty=str(new_qty),
            reason=reason,
        )

        return await self.get_item(item_id, tenant)


async def get_inventory_service() -> InventoryService:
    """Get inventory service instance."""
    return InventoryService()
