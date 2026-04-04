"""
Inventory routes for managing inventory items.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import TenantContext, get_tenant_context, require_property
from app.core.logging import get_logger
from app.schemas.inventory import (
    InventoryItemCreate,
    InventoryItemResponse,
    InventoryItemSummary,
    InventoryItemUpdate,
    InventoryUpdateRequest,
    InventoryUpdateResponse,
)
from app.services.inventory_service import InventoryService

logger = get_logger(__name__)
router = APIRouter()

# Service instance
inventory_service = InventoryService()


@router.get(
    "/",
    response_model=list[InventoryItemSummary],
    summary="List inventory items",
    description="Get a list of inventory items for the current property.",
)
async def list_items(
    tenant: TenantContext = require_property(),
    category_id: Annotated[UUID | None, Query(description="Filter by category")] = None,
    status_filter: Annotated[str | None, Query(alias="status", description="Filter by stock status")] = None,
    search: Annotated[str | None, Query(description="Search by name or SKU")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[InventoryItemSummary]:
    """
    List inventory items with optional filters.

    Filters:
    - category_id: Filter by category
    - status: Filter by stock status (normal, low_stock, out_of_stock)
    - search: Search by name or SKU
    """
    try:
        return await inventory_service.list_items(
            tenant=tenant,
            category_id=category_id,
            status_filter=status_filter,
            search=search,
            limit=limit,
            offset=offset,
        )
    except Exception as e:
        logger.error("Failed to list inventory items", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve inventory items",
        )


@router.get(
    "/{item_id}",
    response_model=InventoryItemResponse,
    summary="Get inventory item",
    description="Get details of a specific inventory item.",
)
async def get_item(
    item_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> InventoryItemResponse:
    """Get a specific inventory item by ID."""
    try:
        item = await inventory_service.get_item(item_id, tenant)
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Inventory item not found",
            )
        return item
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get inventory item", item_id=str(item_id), error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve inventory item",
        )


@router.post(
    "/",
    response_model=InventoryItemResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create inventory item",
    description="Create a new inventory item.",
)
async def create_item(
    item: InventoryItemCreate,
    tenant: TenantContext = require_property(),
) -> InventoryItemResponse:
    """Create a new inventory item."""
    try:
        return await inventory_service.create_item(item, tenant)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error("Failed to create inventory item", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create inventory item",
        )


@router.patch(
    "/{item_id}",
    response_model=InventoryItemResponse,
    summary="Update inventory item",
    description="Update an existing inventory item.",
)
async def update_item(
    item_id: UUID,
    updates: InventoryItemUpdate,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> InventoryItemResponse:
    """Update an inventory item."""
    try:
        item = await inventory_service.update_item(item_id, updates, tenant)
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Inventory item not found",
            )
        return item
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error("Failed to update inventory item", item_id=str(item_id), error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update inventory item",
        )


@router.delete(
    "/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete inventory item",
    description="Delete an inventory item (soft delete).",
)
async def delete_item(
    item_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> None:
    """Delete an inventory item (soft delete - sets is_active=False)."""
    try:
        success = await inventory_service.delete_item(item_id, tenant)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Inventory item not found",
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete inventory item", item_id=str(item_id), error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete inventory item",
        )


@router.post(
    "/update",
    response_model=InventoryUpdateResponse,
    summary="Upsert inventory item by name",
    description="Create or update an inventory item by name and set its quantity.",
)
async def update_inventory_item(
    request: InventoryUpdateRequest,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> InventoryUpdateResponse:
    """
    Upsert an inventory item by name.

    If an item with the given name exists for the property, its quantity is updated.
    Otherwise a new item is created.
    """
    try:
        return await inventory_service.update_item(request, tenant)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error("Failed to update inventory item", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update inventory item",
        )


@router.post(
    "/{item_id}/quantity/adjust",
    response_model=InventoryItemResponse,
    summary="Adjust quantity",
    description="Adjust inventory quantity (add or subtract).",
)
async def adjust_quantity(
    item_id: UUID,
    adjustment: Annotated[float, Query(description="Quantity to add (negative to subtract)")],
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
    reason: Annotated[str | None, Query(description="Reason for adjustment")] = None,
) -> InventoryItemResponse:
    """
    Adjust inventory quantity.

    Positive values add to quantity, negative values subtract.
    """
    try:
        item = await inventory_service.adjust_quantity(
            item_id=item_id,
            adjustment=adjustment,
            reason=reason,
            tenant=tenant,
        )
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Inventory item not found",
            )
        return item
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error("Failed to adjust quantity", item_id=str(item_id), error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to adjust quantity",
        )
