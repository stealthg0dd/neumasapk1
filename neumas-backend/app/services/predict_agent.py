"""
Predict Agent -- deterministic stockout prediction from consumption patterns.

Data sources (admin Supabase client, no TenantContext required):
  - consumption_patterns  (pattern_type = "daily", per item)
  - inventory_items       (current quantity, last_updated)

Pipeline per item
-----------------
1. Read avg_consumption_rate (or average_daily_consumption) from the
   item's "daily" pattern.  Skip if missing or <= 0.
2. days_remaining = current_quantity / avg_consumption_rate
3. predicted_runout_date = today + ceil(days_remaining) days
4. urgency_bucket from thresholds:
     critical  ? 1 day
     urgent    1 < days ? 3
     soon      3 < days ? 7
     later     > 7 days
5. confidence_score:
     - Start from pattern.confidence  (0.0-1.0).
     - Subtract 0.10 if inventory_items.updated_at is older than 7 days.
     - Clamp to [0.10, 1.0].
6. Upsert one "stockout" prediction row per item.

All logic is deterministic -- no LLM calls.

Entry points
------------
- recompute_predictions_for_property(property_id)  <- Celery + admin routes
- PredictAgent.generate_demand_forecast(property_id) <- backward-compat
- PredictAgent.predict_stockouts(property_id)        <- backward-compat
"""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)

# =============================================================================
# Constants
# =============================================================================

MODEL_VERSION = "neumas-predict-v3"

# Urgency bucket thresholds (days)
URGENCY_CRITICAL = "critical"   # days_remaining <= 1
URGENCY_URGENT   = "urgent"     # 1 < days_remaining <= 3
URGENCY_SOON     = "soon"       # 3 < days_remaining <= 7
URGENCY_LATER    = "later"      # > 7 days

# Confidence adjustments
MIN_CONFIDENCE       = 0.10    # floor
CONFIDENCE_CAP       = 1.00    # ceiling
_STALE_PENALTY       = 0.10    # subtract 0.10 if inventory older than threshold
_STALE_THRESHOLD_DAYS = 7      # days before the stale penalty applies

# Confidence interval: ?20 % of days_remaining
CI_VARIANCE = 0.20


# =============================================================================
# Pure-Python helpers
# =============================================================================

def _urgency_bucket(days_remaining: float) -> str:
    """Map days_remaining to an urgency bucket string."""
    if days_remaining <= 1:
        return URGENCY_CRITICAL
    if days_remaining <= 3:
        return URGENCY_URGENT
    if days_remaining <= 7:
        return URGENCY_SOON
    return URGENCY_LATER


def _compute_confidence(
    pattern_confidence: float,
    updated_at_str: str | None,
) -> float:
    """
    Confidence score for a prediction:

        score = pattern.confidence
                - 0.10  if inventory_items.updated_at is older than 7 days
        clamped to [MIN_CONFIDENCE, CONFIDENCE_CAP]

    The penalty reflects that a stale quantity reading makes the
    days-remaining estimate less reliable, regardless of how good the
    consumption pattern is.
    """
    score = float(pattern_confidence)

    # Apply stale-inventory penalty
    if updated_at_str:
        try:
            updated_at = datetime.fromisoformat(
                updated_at_str.replace("Z", "+00:00")
            )
            if (datetime.now(UTC) - updated_at).days > _STALE_THRESHOLD_DAYS:
                score -= _STALE_PENALTY
        except (ValueError, TypeError):
            score -= _STALE_PENALTY   # treat unparseable date as stale
    else:
        score -= _STALE_PENALTY       # no timestamp -> assume stale

    return round(max(MIN_CONFIDENCE, min(CONFIDENCE_CAP, score)), 4)


def _generate_reason(
    item_name: str,
    days_remaining: float,
    avg_daily: float,
    current_qty: float,
    urgency: str,
) -> str:
    """
    Build a human-readable explanation for a prediction.

    Pure Python -- no LLM call.  An LLM enhancement could be layered on top
    by replacing this function's output with a call to call_agent("PREDICT", ...)
    when richer narrative is needed.
    """
    if urgency == URGENCY_CRITICAL:
        return (
            f"{item_name} will run out within 1 day at the current rate of "
            f"{avg_daily:.2f} units/day (currently {current_qty:.1f} units)."
        )
    if urgency == URGENCY_URGENT:
        return (
            f"{item_name} has ~{days_remaining:.1f} days of stock remaining "
            f"({current_qty:.1f} units at {avg_daily:.2f} units/day). "
            f"Reorder soon."
        )
    if urgency == URGENCY_SOON:
        return (
            f"{item_name} is expected to run out in {days_remaining:.0f} days. "
            f"Current stock: {current_qty:.1f} units, "
            f"consumption: {avg_daily:.2f} units/day."
        )
    return (
        f"{item_name} has sufficient stock for {days_remaining:.0f}+ days. "
        f"Next review recommended in ~7 days."
    )


# =============================================================================
# Admin-level DB helpers (service-role client, no TenantContext)
# =============================================================================

async def _fetch_items_with_patterns(
    property_id: UUID,
) -> list[dict[str, Any]]:
    """
    Return a merged list of inventory items + their daily consumption patterns.

    Each entry:
        {
            "id": item_id,
            "name": ...,
            "quantity": ...,
            "unit": ...,
            "updated_at": ...,
            "pattern": {...}  | None   <- consumption_patterns row or None
        }
    """
    client = await get_async_supabase_admin()

    # 1. Fetch active inventory items for the property
    items_resp = await (
        client.table("inventory_items")
        .select("id, name, quantity, unit, min_quantity, reorder_point, updated_at, last_scanned_at")
        .eq("property_id", str(property_id))
        .eq("is_active", True)
        .execute()
    )
    items = items_resp.data or []

    if not items:
        return []

    item_ids = [item["id"] for item in items]

    # 2. Fetch "daily" consumption patterns for those items in one query
    patterns_resp = await (
        client.table("consumption_patterns")
        .select("item_id, pattern_data, confidence, sample_size, updated_at")
        .in_("item_id", item_ids)
        .eq("pattern_type", "daily")
        .execute()
    )
    patterns_by_item: dict[str, dict[str, Any]] = {
        p["item_id"]: p
        for p in (patterns_resp.data or [])
    }

    # 3. Merge
    merged = []
    for item in items:
        merged.append({
            **item,
            "pattern": patterns_by_item.get(item["id"]),
        })

    return merged


async def _upsert_prediction(
    property_id: UUID,
    item_id: UUID,
    prediction_date: datetime,
    predicted_value: float,
    confidence: float,
    ci_low: float,
    ci_high: float,
    features: dict[str, Any],
) -> None:
    """
    INSERT or UPDATE one predictions row (matched on property_id + item_id +
    prediction_type = 'stockout').
    """
    client = await get_async_supabase_admin()

    payload: dict[str, Any] = {
        "property_id": str(property_id),
        "item_id": str(item_id),
        "prediction_type": "stockout",
        "prediction_date": prediction_date.isoformat(),
        "predicted_value": str(round(predicted_value, 4)),
        "confidence_interval_low": str(round(ci_low, 4)),
        "confidence_interval_high": str(round(ci_high, 4)),
        "confidence": str(confidence),
        "model_version": MODEL_VERSION,
        "features_used": features,
    }

    existing = await (
        client.table("predictions")
        .select("id")
        .eq("property_id", str(property_id))
        .eq("item_id", str(item_id))
        .eq("prediction_type", "stockout")
        .execute()
    )

    if existing.data:
        await (
            client.table("predictions")
            .update(payload)
            .eq("id", existing.data[0]["id"])
            .execute()
        )
    else:
        payload["id"] = str(uuid4())
        await (
            client.table("predictions")
            .insert(payload)
            .execute()
        )


# =============================================================================
# Main entry point
# =============================================================================

async def recompute_predictions_for_property(
    property_id: UUID,
) -> dict[str, Any]:
    """
    Compute stockout predictions for every active inventory item that has a
    daily consumption pattern, then upsert results into the predictions table.

    Called by:
    - Celery task  agents.recompute_predictions  (new)
    - Celery task  agents.run_predictions        (via PredictAgent wrapper)
    - scan_tasks.process_scan                    (post-scan pipeline)
    - Admin endpoints

    Returns a summary dict:
        {
            "property_id":          "...",
            "items_evaluated":      N,
            "predictions_upserted": N,
            "items_skipped":        N,   <- no pattern or zero consumption
            "critical_count":       N,
            "urgent_count":         N,
            "soon_count":           N,
            "later_count":          N,
        }
    """
    logger.info(
        "Starting prediction recomputation",
        property_id=str(property_id),
    )

    merged = await _fetch_items_with_patterns(property_id)

    if not merged:
        logger.info(
            "No active inventory items found; skipping prediction recomputation",
            property_id=str(property_id),
        )
        return {
            "property_id": str(property_id),
            "items_evaluated": 0,
            "predictions_upserted": 0,
            "items_skipped": 0,
            "critical_count": 0,
            "urgent_count": 0,
            "soon_count": 0,
            "later_count": 0,
        }

    today = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)

    predictions_upserted = 0
    items_skipped = 0
    bucket_counts: dict[str, int] = {
        URGENCY_CRITICAL: 0,
        URGENCY_URGENT: 0,
        URGENCY_SOON: 0,
        URGENCY_LATER: 0,
    }

    for entry in merged:
        item_id = UUID(entry["id"])
        item_name: str = entry.get("name", str(item_id))
        current_qty = float(entry.get("quantity") or 0)
        pattern = entry.get("pattern")

        # -- Skip: no pattern data ------------------------------------------
        if pattern is None:
            logger.debug(
                "No daily pattern for item; skipping prediction",
                item_id=str(item_id),
                item_name=item_name,
            )
            items_skipped += 1
            continue

        pattern_data: dict[str, Any] = pattern.get("pattern_data") or {}
        # "avg_consumption_rate" is the new field name; fall back to the
        # legacy alias "average_daily_consumption" for older pattern rows.
        avg_daily = float(
            pattern_data.get("avg_consumption_rate")
            or pattern_data.get("average_daily_consumption")
            or 0
        )

        # -- Skip: zero or negative consumption rate ------------------------
        if avg_daily <= 0:
            logger.debug(
                "Zero consumption rate for item; skipping prediction",
                item_id=str(item_id),
                item_name=item_name,
                avg_daily=avg_daily,
            )
            items_skipped += 1
            continue

        # -- Core maths -----------------------------------------------------
        days_remaining = current_qty / avg_daily
        days_ceil = math.ceil(days_remaining)
        predicted_runout_date = today + timedelta(days=max(1, days_ceil))

        urgency = _urgency_bucket(days_remaining)
        bucket_counts[urgency] += 1

        # Confidence interval (?20 % of days_remaining, floored at 0)
        ci_low = max(0.0, days_remaining * (1 - CI_VARIANCE))
        ci_high = days_remaining * (1 + CI_VARIANCE)

        # Confidence: pattern score ? inventory recency factor
        pattern_conf = float(pattern.get("confidence") or 0.5)
        confidence = _compute_confidence(
            pattern_conf,
            entry.get("updated_at"),
        )

        reason = _generate_reason(
            item_name, days_remaining, avg_daily, current_qty, urgency
        )

        features: dict[str, Any] = {
            "urgency_bucket": urgency,
            "days_remaining": round(days_remaining, 4),
            "avg_daily_consumption": avg_daily,
            "current_quantity": current_qty,
            "pattern_confidence": pattern_conf,
            "inventory_recency_days": (
                (datetime.now(UTC) - datetime.fromisoformat(
                    entry["updated_at"].replace("Z", "+00:00")
                )).days
                if entry.get("updated_at") else None
            ),
            "sample_size": pattern.get("sample_size", 0),
            "reason": reason,
        }

        # -- Persist --------------------------------------------------------
        try:
            await _upsert_prediction(
                property_id=property_id,
                item_id=item_id,
                prediction_date=predicted_runout_date,
                predicted_value=days_remaining,
                confidence=confidence,
                ci_low=ci_low,
                ci_high=ci_high,
                features=features,
            )
            predictions_upserted += 1

            logger.debug(
                "Upserted prediction",
                item_name=item_name,
                days_remaining=round(days_remaining, 1),
                urgency=urgency,
                confidence=confidence,
            )

        except Exception as exc:
            logger.error(
                "Failed to upsert prediction",
                item_id=str(item_id),
                item_name=item_name,
                error=str(exc),
            )

    errors_count = len(merged) - items_skipped - predictions_upserted

    logger.info(
        "Prediction recomputation complete",
        property_id=str(property_id),
        number_of_predictions_updated=predictions_upserted,
        number_skipped=items_skipped,
        errors=max(0, errors_count),
        critical_count=bucket_counts[URGENCY_CRITICAL],
        urgent_count=bucket_counts[URGENCY_URGENT],
        soon_count=bucket_counts[URGENCY_SOON],
        later_count=bucket_counts[URGENCY_LATER],
    )

    return {
        "property_id": str(property_id),
        "items_evaluated": len(merged),
        "predictions_upserted": predictions_upserted,
        "items_skipped": items_skipped,
        "critical_count": bucket_counts[URGENCY_CRITICAL],
        "urgent_count": bucket_counts[URGENCY_URGENT],
        "soon_count": bucket_counts[URGENCY_SOON],
        "later_count": bucket_counts[URGENCY_LATER],
    }


# =============================================================================
# PredictAgent -- backward-compatible wrapper consumed by existing Celery tasks
# =============================================================================

class PredictAgent:
    """
    Backward-compatible wrapper around recompute_predictions_for_property.

    The existing Celery task agents.run_predictions calls:
        agent = await get_predict_agent()
        result = await agent.generate_demand_forecast(property_id=..., ...)
        results["predictions"] = predict_result.get("summary", {})

    generate_demand_forecast returns a dict whose "summary" key matches
    that expectation.
    """

    async def generate_demand_forecast(
        self,
        property_id: UUID,
        item_ids: list[UUID] | None = None,
        forecast_days: int = 30,
    ) -> dict[str, Any]:
        """
        Generate demand forecasts and return in the legacy format expected
        by agents.run_predictions.

        item_ids and forecast_days are accepted for API compatibility but
        the implementation always processes all items in the property.
        """
        result = await recompute_predictions_for_property(property_id)

        return {
            "property_id": str(property_id),
            "forecast_generated_at": datetime.now(UTC).isoformat(),
            "forecast_days": forecast_days,
            # "items" is not populated to keep backward compat with caller
            # which only reads result.get("summary", {})
            "summary": {
                "total_items_forecasted": result["predictions_upserted"],
                "critical_count": result["critical_count"],
                "warning_count": result["urgent_count"],   # map urgent -> warning
                "normal_count": (
                    result["soon_count"] + result["later_count"]
                ),
            },
        }

    async def predict_stockouts(
        self,
        property_id: UUID,
        days_ahead: int = 14,
        confidence_threshold: float = 0.5,
    ) -> dict[str, Any]:
        """
        Return active stockout predictions within days_ahead from the DB.

        Runs recomputation first to ensure data is current.
        """
        await recompute_predictions_for_property(property_id)

        client = await get_async_supabase_admin()
        cutoff = (datetime.now(UTC) + timedelta(days=days_ahead)).isoformat()

        resp = await (
            client.table("predictions")
            .select("*, inventory_item:inventory_items(id, name, unit, quantity)")
            .eq("property_id", str(property_id))
            .eq("prediction_type", "stockout")
            .lte("prediction_date", cutoff)
            .gte("confidence", str(confidence_threshold))
            .order("prediction_date")
            .execute()
        )

        stockouts = []
        for row in (resp.data or []):
            features = row.get("features_used") or {}
            stockouts.append({
                "item_id": row.get("item_id"),
                "item_name": (row.get("inventory_item") or {}).get("name", "Unknown"),
                "current_quantity": features.get("current_quantity"),
                "predicted_runout_date": row.get("prediction_date"),
                "days_until_stockout": features.get("days_remaining"),
                "urgency_bucket": features.get("urgency_bucket", URGENCY_LATER),
                "confidence": float(row.get("confidence") or 0),
                "daily_rate": features.get("avg_daily_consumption"),
                "reason": features.get("reason"),
            })

        critical = sum(1 for s in stockouts if s["urgency_bucket"] == URGENCY_CRITICAL)
        urgent = sum(1 for s in stockouts if s["urgency_bucket"] == URGENCY_URGENT)

        return {
            "property_id": str(property_id),
            "generated_at": datetime.now(UTC).isoformat(),
            "days_ahead": days_ahead,
            "predictions": stockouts,
            "critical_count": critical,
            "warning_count": urgent,
        }


async def get_predict_agent() -> PredictAgent:
    """Return a PredictAgent instance (factory for dependency injection)."""
    return PredictAgent()
