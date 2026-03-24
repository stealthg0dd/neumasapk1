"""
Celery tasks for agent orchestration.

Provides:
- agents.generate_shopping_list:          Generate shopping list from predictions
- agents.optimize_budget:                 Run budget optimization on shopping list
- agents.run_predictions:                 Run full pattern + prediction pipeline
- agents.recompute_patterns:              Recompute consumption patterns for a property
- agents.recompute_predictions:           Recompute stockout predictions for a property
"""

import asyncio
import time
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.core.celery_app import celery_app, neumas_task
from app.core.logging import get_logger
from app.services.shopping_agent import get_shopping_agent
from app.services.budget_agent import get_budget_agent

logger = get_logger(__name__)


@neumas_task(
    name="agents.generate_shopping_list",
    bind=True,
    queue="agents",
    max_retries=3,
    default_retry_delay=30,
)
def generate_shopping_list(
    self,
    property_id: str,
    user_id: str,
    name: str | None = None,
    include_low_stock: bool = True,
    include_predictions: bool = True,
    days_ahead: int = 7,
    budget_limit: str | None = None,
    exclude_categories: list[str] | None = None,
    group_by_store: bool = False,
    optimize_budget: bool = True,
) -> dict[str, Any]:
    """
    Generate a shopping list from predictions and inventory.

    Pipeline:
    1. Predict Agent: Update predictions for property
    2. Shopping Agent: Generate list from predictions
    3. Budget Agent: Optimize and suggest alternatives (optional)

    Args:
        property_id: UUID of the property
        user_id: UUID of the user creating the list
        name: Optional name for the list
        include_low_stock: Include low stock items
        include_predictions: Include prediction-based items
        days_ahead: Days to forecast
        budget_limit: Optional budget constraint (as string decimal)
        exclude_categories: Category UUIDs to exclude
        group_by_store: Group items by store
        optimize_budget: Run budget optimization

    Returns:
        Generated shopping list with optimization results

    This task is idempotent - creates new list or updates draft if exists.
    """
    logger.info(
        "Generating shopping list via task",
        property_id=property_id,
        user_id=user_id,
    )

    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(
        _generate_shopping_list_async(
            task=self,
            property_id=property_id,
            user_id=user_id,
            name=name,
            include_low_stock=include_low_stock,
            include_predictions=include_predictions,
            days_ahead=days_ahead,
            budget_limit=budget_limit,
            exclude_categories=exclude_categories,
            group_by_store=group_by_store,
            optimize_budget=optimize_budget,
        )
    )


async def _generate_shopping_list_async(
    task,
    property_id: str,
    user_id: str,
    name: str | None,
    include_low_stock: bool,
    include_predictions: bool,
    days_ahead: int,
    budget_limit: str | None,
    exclude_categories: list[str] | None,
    group_by_store: bool,
    optimize_budget: bool,
) -> dict[str, Any]:
    """Async implementation of shopping list generation."""
    results = {
        "property_id": property_id,
        "user_id": user_id,
        "stages_completed": [],
        "errors": [],
    }

    try:
        # Stage 1: Update predictions (if using predictions)
        if include_predictions:
            logger.info("Stage 1: Updating predictions", property_id=property_id)
            try:
                from app.services.predict_agent import get_predict_agent
                predict_agent = await get_predict_agent()
                predict_result = await predict_agent.generate_demand_forecast(
                    property_id=UUID(property_id),
                    forecast_days=days_ahead,
                )
                results["predictions"] = {
                    "items_forecasted": predict_result.get("summary", {}).get("total_items_forecasted", 0),
                    "critical_count": predict_result.get("summary", {}).get("critical_count", 0),
                    "warning_count": predict_result.get("summary", {}).get("warning_count", 0),
                }
                results["stages_completed"].append("predictions")

            except Exception as e:
                logger.warning("Prediction update failed", error=str(e))
                results["errors"].append({"stage": "predictions", "error": str(e)})
                # Continue - can still generate list from low stock

        # Stage 2: Generate shopping list
        logger.info("Stage 2: Generating shopping list", property_id=property_id)
        try:
            shopping_agent = await get_shopping_agent()

            # Convert budget limit string to Decimal if provided
            budget_decimal = Decimal(budget_limit) if budget_limit else None

            # Convert category strings to UUIDs
            category_uuids = (
                [UUID(c) for c in exclude_categories]
                if exclude_categories
                else None
            )

            shopping_result = await shopping_agent.generate_shopping_list(
                property_id=UUID(property_id),
                user_id=UUID(user_id),
                name=name,
                include_low_stock=include_low_stock,
                include_predictions=include_predictions,
                days_ahead=days_ahead,
                budget_limit=budget_decimal,
                exclude_categories=category_uuids,
                group_by_store=group_by_store,
            )
            results["shopping_list"] = shopping_result.get("shopping_list")
            results["generation_summary"] = shopping_result.get("generation_summary")
            results["stages_completed"].append("shopping")

        except Exception as e:
            logger.error("Shopping list generation failed", error=str(e))
            results["errors"].append({"stage": "shopping", "error": str(e)})
            raise

        # Stage 3: Budget optimization (optional)
        shopping_list = results.get("shopping_list")
        if optimize_budget and shopping_list and shopping_list.get("id"):
            logger.info("Stage 3: Budget optimization", list_id=shopping_list["id"])
            try:
                budget_agent = await get_budget_agent()

                # Get alternative suggestions
                alternatives = await budget_agent.suggest_alternatives(
                    shopping_list_id=UUID(shopping_list["id"]),
                )
                results["budget_suggestions"] = alternatives
                results["stages_completed"].append("budget")

                # If budget limit specified, run optimization
                if budget_decimal:
                    optimization = await budget_agent.optimize_for_budget(
                        shopping_list_id=UUID(shopping_list["id"]),
                        budget_limit=budget_decimal,
                        strategy="balanced",
                    )
                    results["budget_optimization"] = optimization

            except Exception as e:
                logger.warning("Budget optimization failed", error=str(e))
                results["errors"].append({"stage": "budget", "error": str(e)})
                # Continue - optimization is optional

        logger.info(
            "Shopping list generation complete",
            property_id=property_id,
            list_id=shopping_list.get("id") if shopping_list else None,
            stages_completed=results["stages_completed"],
        )

        return results

    except Exception as e:
        logger.error(
            "Shopping list generation failed",
            property_id=property_id,
            error=str(e),
        )
        raise


@neumas_task(
    name="agents.optimize_budget",
    bind=True,
    queue="agents",
    max_retries=2,
)
def optimize_budget(
    self,
    shopping_list_id: str,
    budget_limit: str,
    strategy: str = "balanced",
) -> dict[str, Any]:
    """
    Optimize an existing shopping list for budget.

    Args:
        shopping_list_id: UUID of the shopping list
        budget_limit: Maximum budget (as string decimal)
        strategy: Optimization strategy (priority_first, lowest_cost, balanced)

    Returns:
        Optimization results with changes made

    This task is idempotent - applies optimization to existing list.
    """
    logger.info(
        "Running budget optimization task",
        list_id=shopping_list_id,
        budget_limit=budget_limit,
        strategy=strategy,
    )

    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(
        _optimize_budget_async(
            task=self,
            shopping_list_id=shopping_list_id,
            budget_limit=budget_limit,
            strategy=strategy,
        )
    )


async def _optimize_budget_async(
    task,
    shopping_list_id: str,
    budget_limit: str,
    strategy: str,
) -> dict[str, Any]:
    """Async budget optimization implementation."""
    budget_agent = await get_budget_agent()

    result = await budget_agent.optimize_for_budget(
        shopping_list_id=UUID(shopping_list_id),
        budget_limit=Decimal(budget_limit),
        strategy=strategy,
    )

    return result


@neumas_task(
    name="agents.run_predictions",
    bind=True,
    queue="agents",
    max_retries=2,
)
def run_predictions(
    self,
    property_id: str,
    forecast_days: int = 30,
    update_patterns: bool = True,
) -> dict[str, Any]:
    """
    Run full prediction pipeline for a property.

    Pipeline:
    1. Pattern Agent: Update consumption patterns
    2. Predict Agent: Generate forecasts

    Args:
        property_id: UUID of the property
        forecast_days: Number of days to forecast
        update_patterns: Whether to run pattern analysis first

    Returns:
        Prediction results

    This task is idempotent - updates existing predictions via upserts.
    """
    logger.info(
        "Running predictions task",
        property_id=property_id,
        forecast_days=forecast_days,
    )

    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(
        _run_predictions_async(
            task=self,
            property_id=property_id,
            forecast_days=forecast_days,
            update_patterns=update_patterns,
        )
    )


async def _run_predictions_async(
    task,
    property_id: str,
    forecast_days: int,
    update_patterns: bool,
) -> dict[str, Any]:
    """Async predictions implementation."""
    results = {
        "property_id": property_id,
        "stages_completed": [],
        "errors": [],
    }

    # Stage 1: Update patterns (optional)
    if update_patterns:
        logger.info("Stage 1: Updating patterns", property_id=property_id)
        try:
            from app.services.pattern_agent import get_pattern_agent
            pattern_agent = await get_pattern_agent()
            pattern_result = await pattern_agent.analyze_patterns(
                property_id=UUID(property_id),
                pattern_types=["daily", "weekly"],
            )
            results["patterns"] = {
                "items_analyzed": pattern_result.get("items_analyzed", 0),
                "patterns_found": pattern_result.get("patterns_found", 0),
            }
            results["stages_completed"].append("patterns")

        except Exception as e:
            logger.warning("Pattern analysis failed", error=str(e))
            results["errors"].append({"stage": "patterns", "error": str(e)})

    # Stage 2: Generate predictions
    logger.info("Stage 2: Generating predictions", property_id=property_id)
    try:
        from app.services.predict_agent import get_predict_agent
        predict_agent = await get_predict_agent()
        predict_result = await predict_agent.generate_demand_forecast(
            property_id=UUID(property_id),
            forecast_days=forecast_days,
        )
        results["predictions"] = predict_result.get("summary", {})
        results["stages_completed"].append("predictions")

    except Exception as e:
        logger.error("Prediction generation failed", error=str(e))
        results["errors"].append({"stage": "predictions", "error": str(e)})
        raise

    logger.info(
        "Predictions complete",
        property_id=property_id,
        stages_completed=results["stages_completed"],
    )

    return results


@neumas_task(
    name="agents.analyze_spending",
    bind=True,
    queue="agents",
    max_retries=2,
)
def analyze_spending(
    self,
    property_id: str,
    days: int = 30,
) -> dict[str, Any]:
    """
    Analyze spending patterns for a property.

    Args:
        property_id: UUID of the property
        days: Number of days to analyze

    Returns:
        Spending analysis with insights
    """
    logger.info(
        "Running spending analysis task",
        property_id=property_id,
        days=days,
    )

    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(
        _analyze_spending_async(
            task=self,
            property_id=property_id,
            days=days,
        )
    )


async def _analyze_spending_async(
    task,
    property_id: str,
    days: int,
) -> dict[str, Any]:
    """Async spending analysis implementation."""
    budget_agent = await get_budget_agent()

    result = await budget_agent.analyze_spending(
        property_id=UUID(property_id),
        days=days,
    )

    return result


# =============================================================================
# Task: agents.recompute_patterns_for_property
# =============================================================================

@neumas_task(
    name="agents.recompute_patterns_for_property",
    bind=True,
    queue="neumas.predictions",
    max_retries=2,
    default_retry_delay=60,
)
def recompute_patterns_for_property_task(
    self,
    property_id: str,
) -> dict[str, Any]:
    """
    Recompute consumption patterns for a property.

    Delegates to recompute_patterns_for_property() from pattern_agent.
    Idempotent -- safe to call multiple times; upserts existing rows.

    Args:
        property_id: UUID of the property

    Returns:
        Summary dict with items_analyzed, patterns_found, and timing.
    """
    logger.info("Recompute patterns task received", property_id=property_id)

    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(
        _recompute_patterns_async(self, property_id)
    )


async def _recompute_patterns_async(task: Any, property_id: str) -> dict[str, Any]:
    """Async implementation of pattern recomputation."""
    from app.services.pattern_agent import recompute_patterns_for_property

    wall_start = time.perf_counter()

    result = await recompute_patterns_for_property(UUID(property_id))

    total_ms = int((time.perf_counter() - wall_start) * 1000)
    result["processing_time_ms"] = total_ms

    logger.info(
        "Recompute patterns task complete",
        property_id=property_id,
        items_analyzed=result.get("items_analyzed", 0),
        patterns_found=result.get("patterns_found", 0),
        total_ms=total_ms,
    )

    return result


# =============================================================================
# Task: agents.recompute_predictions_for_property
# =============================================================================

@neumas_task(
    name="agents.recompute_predictions_for_property",
    bind=True,
    queue="neumas.predictions",
    max_retries=2,
    default_retry_delay=60,
)
def recompute_predictions_for_property_task(
    self,
    property_id: str,
) -> dict[str, Any]:
    """
    Recompute stockout predictions for a property.

    Delegates to recompute_predictions_for_property() from predict_agent.
    Idempotent -- safe to call multiple times; upserts existing rows.

    Args:
        property_id: UUID of the property

    Returns:
        Summary dict with predictions_upserted, critical_count, and timing.
    """
    logger.info("Recompute predictions task received", property_id=property_id)

    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(
        _recompute_predictions_async(self, property_id)
    )


async def _recompute_predictions_async(task: Any, property_id: str) -> dict[str, Any]:
    """Async implementation of prediction recomputation."""
    from app.services.predict_agent import recompute_predictions_for_property

    wall_start = time.perf_counter()

    result = await recompute_predictions_for_property(UUID(property_id))

    total_ms = int((time.perf_counter() - wall_start) * 1000)
    result["processing_time_ms"] = total_ms

    logger.info(
        "Recompute predictions task complete",
        property_id=property_id,
        predictions_upserted=result.get("predictions_upserted", 0),
        critical_count=result.get("critical_count", 0),
        urgent_count=result.get("urgent_count", 0),
        total_ms=total_ms,
    )

    return result


# =============================================================================
# Task: agents.refresh_all_predictions
# =============================================================================


@neumas_task(
    name="agents.refresh_all_predictions",
    bind=True,
    queue="agents",
    max_retries=1,
)
def refresh_all_predictions(self) -> dict[str, Any]:
    """
    Daily beat task: refresh predictions for every active property.

    Fetches all active properties via the admin client (no tenant context
    needed) and fans out one `agents.run_predictions` task per property.

    Returns a summary with the number of properties enqueued.
    """
    logger.info("refresh_all_predictions: starting daily refresh")

    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(_refresh_all_predictions_async())


async def _refresh_all_predictions_async() -> dict[str, Any]:
    """Fetch all active properties and enqueue per-property prediction tasks."""
    from app.db.repositories.properties import get_properties_repository

    repo = await get_properties_repository()  # admin client, no tenant
    properties = await repo.get_all_active()

    enqueued = 0
    failed = 0
    for prop in properties:
        try:
            celery_app.send_task(
                "agents.run_predictions",
                args=[str(prop["id"])],
                queue="agents",
            )
            enqueued += 1
        except Exception as exc:
            logger.warning(
                "refresh_all_predictions: failed to enqueue property",
                property_id=str(prop.get("id")),
                error=str(exc),
            )
            failed += 1

    logger.info(
        "refresh_all_predictions: fan-out complete",
        enqueued=enqueued,
        failed=failed,
        total=len(properties),
    )
    return {"enqueued": enqueued, "failed": failed, "total": len(properties)}
