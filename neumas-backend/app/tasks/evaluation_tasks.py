"""
Evaluation tasks — write actual consumption values back to predictions.

This closes the accuracy loop:
  1. When real consumption is observed (inventory movement), find the nearest
     forward prediction for that item and record actual_value.
  2. A periodic sweep re-evaluates past predictions that still lack actual_value
     using the aggregate movements since the prediction date.

Queue: evaluation
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from celery import shared_task
from celery.utils.log import get_task_logger

logger = get_task_logger(__name__)


# ---------------------------------------------------------------------------
# Task: write actual value for a single prediction
# ---------------------------------------------------------------------------

@shared_task(
    name="evaluation.record_actual_value",
    queue="evaluation",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    acks_late=True,
)
def record_actual_value(
    self,
    org_id: str,
    property_id: str,
    user_id: str,
    item_id: str,
    actual_qty: float,
    observed_at: str,
) -> dict[str, Any]:
    """
    Record the actual consumption value for the nearest pending prediction.

    Called after every inventory movement to keep forecast accuracy up to date.

    Args:
        org_id: Organisation UUID string.
        property_id: Property UUID string.
        user_id: Actor UUID string.
        item_id: Inventory item UUID string.
        actual_qty: Actual quantity consumed/received.
        observed_at: ISO-8601 timestamp of the observation.
    """
    try:
        return asyncio.get_event_loop().run_until_complete(
            _record_actual_value_async(
                org_id=org_id,
                property_id=property_id,
                user_id=user_id,
                item_id=item_id,
                actual_qty=actual_qty,
                observed_at=observed_at,
            )
        )
    except Exception as exc:
        logger.warning("record_actual_value failed, retrying: %s", exc)
        raise self.retry(exc=exc)


async def _record_actual_value_async(
    org_id: str,
    property_id: str,
    user_id: str,
    item_id: str,
    actual_qty: float,
    observed_at: str,
) -> dict[str, Any]:
    from app.api.deps import TenantContext
    from app.db.repositories.predictions import get_predictions_repository

    tenant = TenantContext(
        user_id=UUID(user_id),
        org_id=UUID(org_id),
        property_id=UUID(property_id),
        role="staff",
        jwt="",
    )
    repo = await get_predictions_repository()

    observed_dt = datetime.fromisoformat(observed_at.replace("Z", "+00:00"))

    # Find the nearest unfulfilled demand prediction for this item
    # within ±3 days of the observation date
    window_start = (observed_dt - timedelta(days=3)).isoformat()
    window_end = (observed_dt + timedelta(days=3)).isoformat()

    from app.db.supabase_client import get_async_supabase_admin
    client = await get_async_supabase_admin()

    resp = await (
        client.table("predictions")
        .select("id, predicted_value, actual_value")
        .eq("property_id", property_id)
        .eq("inventory_item_id", item_id)
        .eq("prediction_type", "demand")
        .is_("actual_value", "null")
        .gte("prediction_date", window_start)
        .lte("prediction_date", window_end)
        .order("prediction_date")
        .limit(1)
        .execute()
    )

    rows = resp.data or []
    if not rows:
        logger.info(
            "No pending prediction found for item %s near %s", item_id, observed_at
        )
        return {"status": "no_prediction_found", "item_id": item_id}

    prediction = rows[0]
    prediction_id = UUID(prediction["id"])

    await repo.record_actual(tenant, prediction_id, actual_qty)
    logger.info(
        "Recorded actual_value %.3f for prediction %s", actual_qty, prediction_id
    )

    return {
        "status": "recorded",
        "prediction_id": str(prediction_id),
        "actual_value": actual_qty,
        "predicted_value": prediction.get("predicted_value"),
    }


# ---------------------------------------------------------------------------
# Task: periodic sweep — backfill actual_value for stale predictions
# ---------------------------------------------------------------------------

@shared_task(
    name="evaluation.backfill_actual_values",
    queue="evaluation",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    acks_late=True,
)
def backfill_actual_values(self, org_id: str, property_id: str) -> dict[str, Any]:
    """
    Sweep predictions older than 1 day that still lack actual_value and
    attempt to compute it from aggregate inventory movements in that window.

    Scheduled daily by Celery Beat per property.
    """
    try:
        return asyncio.get_event_loop().run_until_complete(
            _backfill_async(org_id=org_id, property_id=property_id)
        )
    except Exception as exc:
        logger.warning("backfill_actual_values failed, retrying: %s", exc)
        raise self.retry(exc=exc)


async def _backfill_async(org_id: str, property_id: str) -> dict[str, Any]:
    from app.api.deps import TenantContext
    from app.db.repositories.predictions import get_predictions_repository
    from app.db.supabase_client import get_async_supabase_admin

    tenant = TenantContext(
        user_id=UUID(org_id),  # service actor
        org_id=UUID(org_id),
        property_id=UUID(property_id),
        role="service",
        jwt="",
    )

    client = await get_async_supabase_admin()
    repo = await get_predictions_repository()

    now = datetime.now(UTC)
    cutoff = (now - timedelta(days=1)).isoformat()

    # Find stale unfulfilled demand predictions
    resp = await (
        client.table("predictions")
        .select("id, inventory_item_id, prediction_date, predicted_value")
        .eq("property_id", property_id)
        .eq("prediction_type", "demand")
        .is_("actual_value", "null")
        .lte("prediction_date", cutoff)
        .limit(100)
        .execute()
    )

    predictions = resp.data or []
    filled = 0

    for pred in predictions:
        item_id = pred.get("inventory_item_id")
        pred_date = pred.get("prediction_date", "")
        if not item_id or not pred_date:
            continue

        # Sum movements for this item on the prediction date ± 1 day
        pred_dt = datetime.fromisoformat(pred_date.replace("Z", "+00:00"))
        window_start = (pred_dt - timedelta(hours=12)).isoformat()
        window_end = (pred_dt + timedelta(hours=36)).isoformat()

        mv_resp = await (
            client.table("inventory_movements")
            .select("quantity_delta, movement_type")
            .eq("property_id", property_id)
            .eq("item_id", item_id)
            .in_("movement_type", ["usage", "waste", "expiry"])
            .gte("created_at", window_start)
            .lte("created_at", window_end)
            .execute()
        )
        movements = mv_resp.data or []
        if not movements:
            continue

        # Actual consumption = sum of absolute deltas (movements store negative)
        actual = sum(abs(float(m.get("quantity_delta", 0))) for m in movements)
        if actual <= 0:
            continue

        await repo.record_actual(tenant, UUID(pred["id"]), actual)
        filled += 1

    logger.info("Backfilled actual_value for %d predictions in %s", filled, property_id)
    return {"status": "ok", "filled": filled, "property_id": property_id}
