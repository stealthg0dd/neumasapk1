"""
Shopping list routes.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

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
    The list will appear under GET /{property_id} once complete.
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
    "/{property_id}",
    response_model=ActiveShoppingListResponse,
    summary="Get active shopping list",
    description="Fetch the most recent active shopping list for a property.",
)
async def get_active_shopping_list(
    property_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> ActiveShoppingListResponse:
    """Get the current active shopping list for a property."""
    try:
        result = await shopping_service.get_active_list(property_id, tenant)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active shopping list found for this property",
            )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Failed to fetch active shopping list",
            property_id=str(property_id),
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve shopping list",
        )
