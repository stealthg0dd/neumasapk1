"""
Analytics routes — real computed metrics from live data.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import APIRouter

from app.api.deps import TenantContext, require_property
from app.core.logging import get_logger
from app.db.repositories.inventory import get_inventory_repository
from app.db.repositories.predictions import get_predictions_repository
from app.db.repositories.scans import get_scans_repository
from app.db.repositories.shopping_lists import get_shopping_lists_repository
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)
router = APIRouter()


def _empty_analytics_summary() -> dict[str, Any]:
    return {
        "spend_total": 0.0,
        "avg_confidence_pct": 0.0,
        "items_tracked": 0,
        "predictions_count": 0,
        "scans_total": 0,
        "spend_history": [],
        "inventory_value_history": [],
        "confidence_history": [],
        "category_breakdown": [],
        "urgency_breakdown": {"critical": 0, "urgent": 0, "soon": 0, "later": 0},
    }


def _fmt_date(iso: str) -> str:
    """Format ISO date string to 'Mon D' label (cross-platform)."""
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.strftime("%b %d").replace(" 0", " ").strip()
    except Exception:
        return iso[:10]


def _dt_to_label(dt: datetime) -> str:
    return dt.strftime("%b %d").replace(" 0", " ").strip()


async def _record_inventory_value_snapshot(
    tenant: TenantContext,
    inventory_items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Upsert today's inventory value and return recent snapshot history."""
    if not tenant.property_id:
        return []

    total_value = 0.0
    for item in inventory_items:
        total_value += float(item.get("quantity") or 0) * float(item.get("cost_per_unit") or 0)

    try:
        client = await get_async_supabase_admin()
        since = (datetime.now(UTC) - timedelta(days=13)).isoformat()
        history_resp = await (
            client.table("inventory_snapshots")
            .select("created_at,total_value")
            .eq("organization_id", str(tenant.org_id))
            .eq("property_id", str(tenant.property_id))
            .gte("created_at", since)
            .order("created_at")
            .execute()
        )
        rows = history_resp.data or []
    except Exception as e:
        logger.warning("Failed to load inventory snapshot history", error=str(e))
        rows = []

    by_date = {}
    for row in rows:
        created_at = str(row.get("created_at") or "")
        if not created_at:
            continue
        day_key = created_at[:10]
        by_date[day_key] = float(row.get("total_value") or 0)
    points: list[dict[str, Any]] = []
    for i in range(14):
        d = date.today() - timedelta(days=13 - i)
        key = d.isoformat()
        value = by_date.get(key)
        if value is None and key == date.today().isoformat():
            value = round(total_value, 2)
        points.append(
            {
                "date": _dt_to_label(datetime.combine(d, datetime.min.time(), tzinfo=UTC)),
                "value": round(value or 0.0, 2),
            }
        )
    return points


@router.get("/summary")
async def get_analytics_summary(
    tenant: TenantContext = require_property(),
) -> dict[str, Any]:
    """
    Return real computed analytics for the current property.

    Computes:
    - spend_total: sum of total_estimated_cost across all shopping lists
    - avg_confidence_pct: mean prediction confidence × 100
    - items_tracked: inventory item count
    - predictions_count: total predictions
    - scans_total: total scans
    - spend_history: shopping list costs grouped by creation date (last 90 days)
    - confidence_history: mean prediction confidence grouped by prediction date
    - category_breakdown: inventory items by category
    - urgency_breakdown: prediction counts by urgency level
    """
    try:
        inv_repo   = await get_inventory_repository()
        pred_repo  = await get_predictions_repository()
        shop_repo  = await get_shopping_lists_repository()
        scan_repo  = await get_scans_repository()
    except Exception as e:
        logger.exception("Failed to initialize analytics repositories", error=str(e))
        return _empty_analytics_summary()

    since_90 = datetime.now(UTC) - timedelta(days=90)

    # ── Fetch all data in parallel ────────────────────────────────────────────
    import asyncio

    inv_task   = inv_repo.get_items_by_property(tenant, limit=1000)
    pred_task  = pred_repo.get_by_property(tenant, limit=500)
    shop_task  = shop_repo.get_by_property(tenant, limit=200)
    scan_task  = scan_repo.get_by_property(tenant, limit=200)

    inventory_items, predictions, shopping_lists, scans = await asyncio.gather(
        inv_task, pred_task, shop_task, scan_task,
        return_exceptions=True,
    )

    # Safely coerce exceptions to empty lists
    if isinstance(inventory_items, Exception):
        logger.warning("Failed to fetch inventory", error=str(inventory_items))
        inventory_items = []
    if isinstance(predictions, Exception):
        logger.warning("Failed to fetch predictions", error=str(predictions))
        predictions = []
    if isinstance(shopping_lists, Exception):
        logger.warning("Failed to fetch shopping lists", error=str(shopping_lists))
        shopping_lists = []
    if isinstance(scans, Exception):
        logger.warning("Failed to fetch scans", error=str(scans))
        scans = []

    # ── Spend metrics ─────────────────────────────────────────────────────────
    spend_total = sum(
        float(sl.get("total_estimated_cost") or 0)
        for sl in shopping_lists
    )

    # Build spend history: cumulative cost over time (last 90 days)
    daily_spend: dict[str, float] = defaultdict(float)
    for sl in shopping_lists:
        created = sl.get("created_at", "")
        if not created:
            continue
        try:
            dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
            if dt < since_90:
                continue
            key = dt.strftime("%b %d").replace(" 0", " ").strip()
            daily_spend[key] += float(sl.get("total_estimated_cost") or 0)
        except Exception:
            pass

    # Produce sorted list with cumulative
    sorted_dates = sorted(daily_spend.keys(), key=lambda d: datetime.strptime(d, "%b %d"))
    cumulative = 0.0
    spend_history: list[dict[str, Any]] = []
    for d in sorted_dates:
        cumulative += daily_spend[d]
        spend_history.append({
            "date":       d,
            "amount":     round(daily_spend[d], 2),
            "cumulative": round(cumulative, 2),
        })

    # If no real history, emit zeros for the last 14 days so charts render
    if not spend_history:
        spend_history = [
            {
                "date":       _dt_to_label(datetime.now(UTC) - timedelta(days=13 - i)),
                "amount":     0.0,
                "cumulative": 0.0,
            }
            for i in range(14)
        ]

    # ── Prediction confidence metrics ─────────────────────────────────────────
    confidence_values = [
        float(p.get("confidence") or 0)
        for p in predictions
        if p.get("confidence") is not None
    ]
    avg_confidence_pct = (
        round(sum(confidence_values) / len(confidence_values) * 100, 1)
        if confidence_values else 0.0
    )

    # Confidence history: group by prediction_date
    daily_conf: dict[str, list[float]] = defaultdict(list)
    for p in predictions:
        pred_date = p.get("prediction_date", "")
        conf      = p.get("confidence")
        if not pred_date or conf is None:
            continue
        try:
            dt  = datetime.fromisoformat(pred_date.replace("Z", "+00:00"))
            key = dt.strftime("%b %d").replace(" 0", " ").strip()
            daily_conf[key].append(float(conf))
        except Exception:
            pass

    confidence_history: list[dict[str, Any]] = [
        {
            "date":           d,
            "avg_confidence": round(sum(vals) / len(vals) * 100, 1),
            "count":          len(vals),
        }
        for d, vals in sorted(daily_conf.items())
    ]

    if not confidence_history:
        confidence_history = [
            {
                "date":           _dt_to_label(datetime.now(UTC) - timedelta(days=13 - i)),
                "avg_confidence": 0.0,
                "count":          0,
            }
            for i in range(14)
        ]

    # ── Category breakdown from inventory ────────────────────────────────────
    cat_map: dict[str, int] = defaultdict(int)
    for item in inventory_items:
        cat = (
            (item.get("category") or {}).get("name")
            or item.get("category_name")
            or "Other"
        )
        cat_map[cat] += 1

    category_breakdown = [
        {"name": name, "value": count}
        for name, count in sorted(cat_map.items(), key=lambda x: -x[1])
    ][:8]

    # ── Urgency breakdown from predictions ────────────────────────────────────
    urgency_map: dict[str, int] = defaultdict(int)
    for p in predictions:
        level = p.get("stockout_risk_level") or "later"
        urgency_map[level] += 1

    urgency_breakdown = {k: urgency_map[k] for k in ("critical", "urgent", "soon", "later")}

    inventory_value_history = await _record_inventory_value_snapshot(
        tenant=tenant,
        inventory_items=inventory_items,
    )

    return {
        "spend_total":          round(spend_total, 2),
        "avg_confidence_pct":   avg_confidence_pct,
        "items_tracked":        len(inventory_items),
        "predictions_count":    len(predictions),
        "scans_total":          len(scans),
        "spend_history":        spend_history,
        "inventory_value_history": inventory_value_history,
        "confidence_history":   confidence_history,
        "category_breakdown":   category_breakdown,
        "urgency_breakdown":    urgency_breakdown,
    }
