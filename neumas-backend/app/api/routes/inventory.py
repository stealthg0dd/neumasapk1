"""
Inventory routes for managing inventory items.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import TenantContext, get_tenant_context, require_property
from app.core.logging import get_logger
from app.db.repositories.inventory import get_inventory_repository
from app.schemas.inventory import (
    BurnRateRecomputeRequest,
    BurnRateRecomputeResponse,
    InventoryItemCreate,
    InventoryItemResponse,
    InventoryItemSummary,
    InventoryItemUpdate,
    InventoryUpdateRequest,
    InventoryUpdateResponse,
    RestockPreviewResponse,
    VendorOrderExportResponse,
)
from app.services.inventory_service import InventoryService
from app.services.restock_service import RestockService

logger = get_logger(__name__)
router = APIRouter()

# Service instance
inventory_service = InventoryService()
restock_service = RestockService()


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

        # Structured audit log — non-fatal
        try:
            from app.db.repositories.audit_logs import AuditLogsRepository
            await AuditLogsRepository().log(
                tenant=tenant,
                action="inventory.quantity_adjusted",
                resource_type="inventory_item",
                resource_id=str(item_id),
                metadata={"adjustment": adjustment, "reason": reason},
            )
        except Exception as audit_exc:
            logger.warning("Audit log write failed (non-fatal)", item_id=str(item_id), error=str(audit_exc))

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


@router.get(
    "/reorder-recommendations",
    summary="Reorder recommendations",
    description="Return reorder recommendations sorted by urgency.",
)
async def reorder_recommendations(
    tenant: Annotated[TenantContext, Depends(require_property)],
    horizon_days: Annotated[int, Query(ge=1, le=90)] = 14,
    min_urgency: Annotated[str, Query()] = "soon",
) -> list[dict]:
    """Compute and return reorder recommendations for the current property."""
    from app.services.reorder_service import ReorderService
    svc = ReorderService()
    return await svc.get_recommendations(
        tenant, horizon_days=horizon_days, min_urgency=min_urgency
    )


@router.post(
    "/burn-rate/recompute",
    response_model=BurnRateRecomputeResponse,
    summary="Recompute burn rates",
    description="Compute average daily usage for items from manual adjustments and scan restocks.",
)
async def recompute_burn_rate(
    body: BurnRateRecomputeRequest,
    tenant: TenantContext = require_property(),
) -> BurnRateRecomputeResponse:
    result = await restock_service.recompute_burn_rates(
        tenant=tenant,
        lookback_days=body.lookback_days,
        auto_calculate_reorder_point=body.auto_calculate_reorder_point,
        safety_buffer=float(body.safety_buffer),
    )
    return BurnRateRecomputeResponse(**result)


@router.get(
    "/restock/preview",
    response_model=RestockPreviewResponse,
    summary="Predictive restock preview",
    description="Group at-risk inventory by vendor for procurement planning.",
)
async def get_restock_preview(
    tenant: TenantContext = require_property(),
    runout_threshold_days: Annotated[int, Query(ge=1, le=30)] = 7,
) -> RestockPreviewResponse:
    payload = await restock_service.get_vendor_restock_preview(
        tenant=tenant,
        runout_threshold_days=runout_threshold_days,
    )
    return RestockPreviewResponse(**payload)


@router.get(
    "/restock/vendors/{vendor_id}/export",
    response_model=VendorOrderExportResponse,
    summary="Generate vendor order export",
    description="Build PDF/email-ready order summary for a vendor.",
)
async def export_vendor_order(
    vendor_id: UUID,
    tenant: TenantContext = require_property(),
    runout_threshold_days: Annotated[int, Query(ge=1, le=30)] = 7,
) -> VendorOrderExportResponse:
    payload = await restock_service.generate_vendor_order_export(
        tenant=tenant,
        vendor_id=str(vendor_id),
        runout_threshold_days=runout_threshold_days,
    )
    return VendorOrderExportResponse(**payload)


@router.patch(
    "/{item_id}/auto-reorder",
    response_model=InventoryItemResponse,
    summary="Toggle auto-calculate reorder point",
)
async def toggle_auto_reorder(
    item_id: UUID,
    enabled: Annotated[bool, Query()],
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
    safety_buffer: Annotated[float, Query(ge=0)] = 0,
) -> InventoryItemResponse:
    item = await inventory_service.get_item(item_id, tenant)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")

    avg_daily = float(item.average_daily_usage or 0)
    update_payload: dict[str, object] = {
        "auto_reorder_enabled": enabled,
        "safety_buffer": str(safety_buffer),
    }
    if enabled:
        update_payload["reorder_point"] = str(max(0.0, avg_daily * 7.0 + safety_buffer))

    repo = await get_inventory_repository(tenant)
    await repo.update(item_id=item_id, data=update_payload, tenant=tenant)
    refreshed = await inventory_service.get_item(item_id, tenant)
    if not refreshed:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to refresh item")
    return refreshed
