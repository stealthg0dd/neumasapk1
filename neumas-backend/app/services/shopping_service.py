"""
Shopping service for shopping list management and order deep links.
"""

from decimal import Decimal
from urllib.parse import quote
from uuid import UUID

from app.api.deps import TenantContext
from app.core.celery_app import celery_app
from app.core.logging import get_logger
from app.db.repositories.shopping_lists import get_shopping_lists_repository
from app.schemas.shopping import (
    ActiveShoppingListResponse,
    GenerateListRequest,
    GenerateListResponse,
    OrderDeepLinkRequest,
    OrderDeepLinkResponse,
    ShoppingListItem,
)

logger = get_logger(__name__)


# Platform-specific deep link templates
DEEP_LINK_TEMPLATES = {
    "grab": "grab://food/search?q={query}",
    "redmart": "https://redmart.lazada.sg/search/?q={query}",
    "shopee": "https://shopee.sg/search?keyword={query}",
}


class ShoppingService:
    """Service for shopping list management and order deep links."""

    async def generate_list(
        self,
        request: GenerateListRequest,
        tenant: TenantContext,
    ) -> GenerateListResponse:
        """
        Initiate shopping list generation (async via Celery).

        Args:
            request: Generation request with property_id and preferred_store
            tenant: Current tenant context

        Returns:
            GenerateListResponse with job_id
        """
        logger.info(
            "Starting shopping list generation",
            property_id=str(request.property_id),
            user_id=str(tenant.user_id),
            preferred_store=request.preferred_store,
        )

        # Enqueue the generation task
        task = celery_app.send_task(
            "app.tasks.shopping_tasks.generate_shopping_list",
            args=[
                str(request.property_id),
                str(tenant.user_id),
                request.preferred_store,
            ],
            queue="neumas.shopping",
        )

        logger.info(
            "Enqueued shopping list generation",
            property_id=str(request.property_id),
            job_id=task.id,
        )

        return GenerateListResponse(
            job_id=task.id,
            message="generation_started",
            property_id=request.property_id,
        )

    async def get_active_list(
        self,
        property_id: UUID,
        tenant: TenantContext,
    ) -> ActiveShoppingListResponse | None:
        """
        Get the current active shopping list for a property.

        Args:
            property_id: Property to get list for
            tenant: Current tenant context

        Returns:
            ActiveShoppingListResponse or None if no active list
        """
        logger.info(
            "Fetching active shopping list",
            property_id=str(property_id),
            user_id=str(tenant.user_id),
        )

        shopping_repo = await get_shopping_lists_repository()

        # Get the most recent active list
        active_list = await shopping_repo.get_active_list(property_id, tenant)

        if not active_list:
            logger.info(
                "No active shopping list found",
                property_id=str(property_id),
            )
            return None

        # Get list items
        list_items = await shopping_repo.get_list_items(
            UUID(active_list["id"]),
            tenant,
        )

        items = [
            ShoppingListItem(
                id=UUID(item["id"]),
                name=item["name"],
                quantity=Decimal(str(item.get("quantity", 1))),
                unit=item.get("unit"),
                category=item.get("category"),
                estimated_price=Decimal(str(item["estimated_price"])) if item.get("estimated_price") else None,
                reason=item.get("reason"),
                checked=item.get("checked", False),
            )
            for item in list_items
        ]

        # Calculate totals
        total_items = len(items)
        total_estimated = sum(
            (item.estimated_price or Decimal("0")) * item.quantity
            for item in items
        )

        return ActiveShoppingListResponse(
            id=UUID(active_list["id"]),
            property_id=property_id,
            name=active_list.get("name", "Shopping List"),
            status=active_list.get("status", "active"),
            items=items,
            total_items=total_items,
            total_estimated_cost=total_estimated,
            created_at=active_list.get("created_at"),
            updated_at=active_list.get("updated_at"),
        )

    async def generate_deep_link(
        self,
        request: OrderDeepLinkRequest,
        tenant: TenantContext,
    ) -> OrderDeepLinkResponse:
        """
        Generate a deep link for ordering items on a platform.

        Supported platforms: grab, redmart, shopee

        Args:
            request: Deep link request with platform and items
            tenant: Current tenant context

        Returns:
            OrderDeepLinkResponse with the generated URL
        """
        logger.info(
            "Generating order deep link",
            platform=request.platform,
            property_id=str(request.property_id),
            items_count=len(request.items),
        )

        platform = request.platform.lower()

        if platform not in DEEP_LINK_TEMPLATES:
            raise ValueError(f"Unsupported platform: {platform}")

        # Build search query from items
        # For most platforms, we combine item names
        item_names = [item.name for item in request.items]
        query = " ".join(item_names[:5])  # Limit to first 5 items for URL length

        # URL encode the query
        encoded_query = quote(query)

        # Generate the deep link
        template = DEEP_LINK_TEMPLATES[platform]
        deep_link_url = template.format(query=encoded_query)

        # For more sophisticated platforms, we might add cart items
        # This is a simplified implementation
        if platform == "shopee" and len(request.items) == 1:
            # Single item search
            deep_link_url = f"https://shopee.sg/search?keyword={quote(request.items[0].name)}"
        elif platform == "redmart":
            # RedMart with quantity hints
            items_param = "&".join([
                f"item{i}={quote(item.name)}"
                for i, item in enumerate(request.items[:10])
            ])
            deep_link_url = f"https://redmart.lazada.sg/search/?q={encoded_query}&{items_param}"

        logger.info(
            "Generated deep link",
            platform=platform,
            url_length=len(deep_link_url),
        )

        return OrderDeepLinkResponse(
            platform=platform,
            deep_link_url=deep_link_url,
            items_count=len(request.items),
        )


async def get_shopping_service() -> ShoppingService:
    """Get shopping service instance."""
    return ShoppingService()
