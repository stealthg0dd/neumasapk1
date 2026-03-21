"""
Shopping list routes.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import TenantContext, get_tenant_context, require_property
from app.core.logging import get_logger
from app.schemas.shopping import (
    ActiveShoppingListResponse,
    GenerateListRequest,
    GenerateListResponse,
)
from app.services.shopping_service import ShoppingService

logger = get_logger(__name__)
router = APIRouter()

shopping_service = ShoppingService()


@router.get(
    "",
    response_model=list[ActiveShoppingListResponse],
    summary="List shopping lists",
    description="Return all active shopping lists for the current property. "
                "Works with or without a trailing slash.",
)
async def list_shopping_lists(
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
    property_id: Annotated[UUID | None, Query(description="Property ID (defaults to tenant property)")] = None,
) -> list[ActiveShoppingListResponse]:
    """
    Returns the active shopping list for a property wrapped in a list so the
    frontend can treat it as a paginated collection.  Returns [] when no list
    exists rather than a 404 so the dashboard degrades gracefully.
    """
    try:
        pid = property_id or tenant.property_id
        result = await shopping_service.get_active_list(pid, tenant)
        return [result] if result is not None else []
    except Exception as e:
        logger.error("Failed to list shopping lists", error=str(e))
        return []


@router.post(
    "/generate",
    response_model=GenerateListResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Generate shopping list",
    description="Enqueue async generation of a shopping list from inventory and predictions.",
)
async def generate_shopping_list(
    request: GenerateListRequest,
    tenant: TenantContext = require_property(),
) -> GenerateListResponse:
    """
    Kick off shopping list generation.

    Returns a job_id that can be used to track progress.
    The list will appear under GET / once complete.
    """
    try:
        return await shopping_service.generate_list(request, tenant)
    except Exception as e:
        logger.error("Failed to enqueue shopping list generation", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start shopping list generation",
        )


@router.get(
    "/{list_id}",
    response_model=ActiveShoppingListResponse,
    summary="Get shopping list by ID",
    description="Fetch a specific shopping list by its ID or by property ID.",
)
async def get_shopping_list(
    list_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> ActiveShoppingListResponse:
    """
    Fetch a shopping list.  Falls back to getting the active list for the
    property when no list with the given ID is found (handles the case where
    the frontend passes a property_id instead of a list_id).
    """
    try:
        result = await shopping_service.get_active_list(list_id, tenant)
        if result is None:
            # Fallback: treat the ID as a property_id and try tenant property
            result = await shopping_service.get_active_list(tenant.property_id, tenant)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active shopping list found",
            )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to fetch shopping list", list_id=str(list_id), error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve shopping list",
        )
