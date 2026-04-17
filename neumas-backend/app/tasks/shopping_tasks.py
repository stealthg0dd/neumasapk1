"""
Shopping list Celery tasks.

Thin wrapper that routes to the agent_tasks pipeline under the
neumas.shopping queue name expected by ShoppingService.
"""

import asyncio
from typing import Any

from app.core.celery_app import neumas_task
from app.core.logging import get_logger, log_business_event

logger = get_logger(__name__)


@neumas_task(
    name="app.tasks.shopping_tasks.generate_shopping_list",
    bind=True,
    queue="neumas.shopping",
    max_retries=3,
    default_retry_delay=30,
)
def generate_shopping_list(
    self,
    property_id: str,
    user_id: str,
    preferred_store: str | None = None,
) -> dict[str, Any]:
    """
    Generate a shopping list for a property.

    Delegates to the full agent pipeline (predictions -> shopping -> budget).
    preferred_store is stored in task metadata but not currently used by the
    agent pipeline; it will be wired when store-specific pricing is added.
    """
    logger.info(
        "Shopping list task received",
        property_id=property_id,
        user_id=user_id,
        preferred_store=preferred_store,
    )

    # Delegate to the agent pipeline task synchronously
    from app.tasks.agent_tasks import _generate_shopping_list_async

    result = asyncio.get_event_loop().run_until_complete(
        _generate_shopping_list_async(
            task=self,
            property_id=property_id,
            user_id=user_id,
            name=None,
            include_low_stock=True,
            include_predictions=True,
            days_ahead=7,
            budget_limit=None,
            exclude_categories=None,
            group_by_store=False,
            optimize_budget=True,
        )
    )

    # Emit business event on success
    if isinstance(result, dict) and result.get("shopping_list_id"):
        log_business_event(
            "reorder.generated",
            property_id=property_id,
            user_id=user_id,
            shopping_list_id=str(result.get("shopping_list_id", "")),
            item_count=result.get("items_count", 0),
        )

    return result
