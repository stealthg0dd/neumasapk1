"""
Reorder service — computes reorder recommendations from predictions and stock.

Algorithm:
  projected_consumption = sum of predicted daily demand over horizon days
  reorder_qty = max(0, projected_consumption * (1 + safety_buffer) - on_hand)
  urgency = "critical" if on_hand == 0
           "urgent"   if on_hand < par_level / 2
           "soon"     if on_hand < par_level
           "monitor"  otherwise
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.constants import REORDER_HORIZON_DAYS, REORDER_SAFETY_BUFFER
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)

_URGENCY_ORDER = {"critical": 0, "urgent": 1, "soon": 2, "monitor": 3}


class ReorderService:
    """Computes reorder recommendations for a property."""

    async def get_recommendations(
        self,
        tenant: TenantContext,
        horizon_days: int = REORDER_HORIZON_DAYS,
        safety_buffer: float = REORDER_SAFETY_BUFFER,
        min_urgency: str = "soon",
    ) -> list[dict[str, Any]]:
        """
        Return reorder recommendations sorted by urgency.

        Args:
            tenant: Tenant context with property_id.
            horizon_days: Planning horizon in days.
            safety_buffer: Fractional safety stock (0.20 = 20% buffer).
            min_urgency: Minimum urgency level to include ("critical", "urgent",
                         "soon", "monitor").

        Returns:
            List of recommendation dicts, sorted most urgent first.
        """
        if not tenant.property_id:
            return []

        client = await get_async_supabase_admin()
        prop_id = str(tenant.property_id)
        org_id = str(tenant.org_id)

        # Fetch inventory items
        inv_resp = await (
            client.table("inventory_items")
            .select("id, name, quantity, unit, par_level, category_id")
            .eq("property_id", prop_id)
            .eq("org_id", org_id)
            .execute()
        )
        items: list[dict[str, Any]] = inv_resp.data or []

        if not items:
            return []

        # Fetch forward predictions for these items over horizon
        now = datetime.now(UTC)
        end_date = now + timedelta(days=horizon_days)

        pred_resp = await (
            client.table("predictions")
            .select("inventory_item_id, predicted_value, prediction_date, prediction_type")
            .eq("property_id", prop_id)
            .eq("prediction_type", "demand")
            .gte("prediction_date", now.isoformat())
            .lte("prediction_date", end_date.isoformat())
            .execute()
        )
        predictions: list[dict[str, Any]] = pred_resp.data or []

        # Aggregate predicted consumption per item
        consumption_by_item: dict[str, float] = {}
        for pred in predictions:
            item_id = pred.get("inventory_item_id")
            val = float(pred.get("predicted_value") or 0)
            if item_id:
                consumption_by_item[item_id] = consumption_by_item.get(item_id, 0.0) + val

        min_urgency_rank = _URGENCY_ORDER.get(min_urgency, 2)
        recommendations: list[dict[str, Any]] = []

        for item in items:
            item_id = str(item["id"])
            on_hand = float(item.get("quantity") or 0)
            par_level = float(item.get("par_level") or 0)
            projected = consumption_by_item.get(item_id, 0.0)

            # With no predictions, fall back to par_level as minimum target
            if projected == 0.0 and par_level > 0:
                projected = par_level

            reorder_qty = max(0.0, projected * (1 + safety_buffer) - on_hand)

            urgency = _compute_urgency(on_hand, par_level)
            urgency_rank = _URGENCY_ORDER[urgency]

            if urgency_rank > min_urgency_rank:
                continue

            if reorder_qty <= 0 and urgency == "monitor":
                continue

            recommendations.append({
                "item_id": item_id,
                "name": item.get("name"),
                "unit": item.get("unit"),
                "on_hand": round(on_hand, 3),
                "par_level": round(par_level, 3),
                "projected_consumption": round(projected, 3),
                "reorder_qty": round(reorder_qty, 3),
                "urgency": urgency,
                "horizon_days": horizon_days,
                "computed_at": now.isoformat(),
                "reason": _reason_code(on_hand, par_level, projected),
            })

        recommendations.sort(key=lambda r: (_URGENCY_ORDER[r["urgency"]], -r["reorder_qty"]))
        return recommendations

    async def get_single_recommendation(
        self,
        tenant: TenantContext,
        item_id: UUID,
        horizon_days: int = REORDER_HORIZON_DAYS,
        safety_buffer: float = REORDER_SAFETY_BUFFER,
    ) -> dict[str, Any] | None:
        """Return reorder recommendation for one item."""
        all_recs = await self.get_recommendations(
            tenant, horizon_days=horizon_days, safety_buffer=safety_buffer, min_urgency="monitor"
        )
        for rec in all_recs:
            if rec["item_id"] == str(item_id):
                return rec
        return None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _compute_urgency(on_hand: float, par_level: float) -> str:
    if on_hand <= 0:
        return "critical"
    if par_level > 0 and on_hand < par_level / 2:
        return "urgent"
    if par_level > 0 and on_hand < par_level:
        return "soon"
    return "monitor"


def _reason_code(on_hand: float, par_level: float, projected: float) -> str:
    if on_hand <= 0:
        return "OUT_OF_STOCK"
    if par_level > 0 and on_hand < par_level / 2:
        return "CRITICALLY_LOW"
    if par_level > 0 and on_hand < par_level:
        return "BELOW_PAR"
    if projected > on_hand:
        return "PROJECTED_STOCKOUT"
    return "RECOMMENDED_REORDER"
