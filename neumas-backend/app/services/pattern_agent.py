"""
Pattern Agent for analyzing inventory consumption patterns.

Analyzes historical scan data (receipts / manual entries) to compute
per-item consumption patterns and persist them in consumption_patterns.

Data model
----------
Primary source: scans.processed_results JSONB, which VisionAgent writes as:
    {
        "items": [
            {"item_name": "Milk 1L", "quantity": 12, "unit": "1L",
             "unit_price": 2.50, "total_price": 30.0, "category": "Dairy"}
        ],
        "receipt_metadata": {"receipt_date": "2026-03-15", ...},
        "confidence": 0.95
    }
Each item in a scan represents a *purchase event* on the scan's date.

Pattern stored (pattern_type = "daily")
----------------------------------------
pattern_data JSONB contains:
    avg_consumption_rate    -- units per day  (also stored as average_daily_consumption
                              for backward compatibility with predict_agent.py)
    purchase_frequency      -- days between purchases
    total_purchased         -- sum of all quantities in the lookback window
    total_days_covered      -- span of the purchase timeline
    n_purchases             -- number of purchase events
    pattern_json            -- compact summary read by PredictAgent:
        {
            "daily":          avg_consumption_rate,
            "weekly":         avg_consumption_rate * 7,
            "purchase_count": n_purchases,
            "days_covered":   total_days_covered,
        }
    last_purchase_date      -- ISO timestamp of the most recent purchase

Confidence score (stored as 0.0-1.0)
--------------------------------------
  base  = min(1.0, purchase_count * 0.15)   (saturates at 7+ purchases -> 1.0)
  bonus = +0.10 if last purchase ? 14 days ago
  final = min(1.0, base + bonus)

All math is deterministic -- no LLM calls.  DEV_MODE and production share
exactly the same code path.

Entry points
------------
- recompute_patterns_for_property(property_id)  <- Celery tasks + admin routes
- PatternAgent.analyze_patterns(property_id)     <- backward-compat wrapper

Both use the Supabase service-role client; no TenantContext required.
"""

from __future__ import annotations

import re
import time as _time
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)

# =============================================================================
# Constants
# =============================================================================

SCAN_LOOKBACK_DAYS = 90   # How far back to read scans

# Confidence formula constants (0-100 conceptual scale, stored ?100 -> 0.0-1.0)
_CONF_PER_PURCHASE = 0.15   # each purchase adds 15 percentage points
_CONF_RECENCY_BONUS = 0.10  # +10 pp if last purchase ? 14 days ago
_CONF_RECENCY_DAYS = 14     # threshold for recency bonus

# =============================================================================
# Name normalisation helpers
# =============================================================================

_UNIT_RE = re.compile(
    r"\b\d+(?:\.\d+)?\s*(?:ml|cl|dl|l|lt|kg|g|oz|lb|lbs)\b",
    re.IGNORECASE,
)
_WHITESPACE_RE = re.compile(r"\s+")


def _normalize_name(name: str) -> str:
    """
    Lowercase + strip size/unit tokens so receipt names can be compared
    against inventory item names.

    Hyphens and dashes are collapsed to spaces so that "Full-Cream Milk 1L"
    and "Full Cream Milk" both normalize to "full cream milk".

    "Full-Cream Milk 1L" -> "full cream milk"
    "Mineral Water 500ml" -> "mineral water"
    """
    name = _UNIT_RE.sub("", name)
    name = name.replace("-", " ").replace("-", " ").replace("--", " ")
    return _WHITESPACE_RE.sub(" ", name).lower().strip()


def _match_inventory_item(
    raw_receipt_name: str,
    inventory_items: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """
    Find the best-matching inventory_items row for a receipt item name.

    Match strategy (first win):
    1. Exact normalized-name equality
    2. One name is a substring of the other (normalized)

    Returns None if no match is found.
    """
    norm_receipt = _normalize_name(raw_receipt_name)

    for item in inventory_items:
        if _normalize_name(item.get("name", "")) == norm_receipt:
            return item

    for item in inventory_items:
        norm_inv = _normalize_name(item.get("name", ""))
        if norm_inv and (norm_inv in norm_receipt or norm_receipt in norm_inv):
            return item

    return None


# =============================================================================
# Pure-Python pattern maths
# =============================================================================

PurchaseEvents = list[tuple[datetime, float]]


def _compute_daily_pattern(events: PurchaseEvents) -> dict[str, Any]:
    """
    Given a sorted list of (purchase_date, quantity) events:

    - avg_daily_consumption  = total_purchased / total_days_covered
    - purchase_frequency_days = total_days_covered / n_purchases

    For a single event we assume a 30-day cycle as a conservative default.
    """
    n = len(events)
    total_purchased = sum(qty for _, qty in events)

    if n == 1:
        return {
            "average_daily_consumption": round(total_purchased / 30.0, 4),
            "purchase_frequency_days": 30.0,
            "total_purchased": round(total_purchased, 4),
            "total_days_covered": 30,
            "n_purchases": 1,
        }

    earliest, _ = events[0]
    latest, _ = events[-1]
    total_days = max(1, (latest - earliest).days)

    return {
        "average_daily_consumption": round(total_purchased / total_days, 4),
        "purchase_frequency_days": round(total_days / n, 2),
        "total_purchased": round(total_purchased, 4),
        "total_days_covered": total_days,
        "n_purchases": n,
    }


def _compute_weekly_pattern(events: PurchaseEvents) -> dict[str, Any]:
    """
    Per-weekday purchase quantity averages (0 = Monday ... 6 = Sunday).

    Returns weekday_average, weekend_average, weekend_ratio, and the
    per-day averages dict.
    """
    by_day: dict[int, list[float]] = {d: [] for d in range(7)}
    for dt, qty in events:
        by_day[dt.weekday()].append(qty)

    day_avgs: dict[int, float] = {
        d: round(sum(vals) / len(vals), 4) if vals else 0.0
        for d, vals in by_day.items()
    }

    weekday_avg = sum(day_avgs[d] for d in range(5)) / 5
    weekend_avg = sum(day_avgs[d] for d in range(5, 7)) / 2
    weekend_ratio = (weekend_avg / weekday_avg) if weekday_avg > 0 else 1.0

    return {
        "by_day_of_week": day_avgs,
        "weekday_average": round(weekday_avg, 4),
        "weekend_average": round(weekend_avg, 4),
        "weekend_ratio": round(weekend_ratio, 4),
    }


def _compute_confidence(n_purchases: int, last_purchase_dt: datetime) -> float:
    """
    Confidence score in 0.0-1.0, derived from a 0-100 conceptual scale:

        base  = min(100, n_purchases * 15)  ->  /100
        bonus = +10 if last purchase ? 14 days ago ->  /100
        final = min(1.0, base + bonus)

    Examples:
        1 purchase, stale -> 0.15
        3 purchases, recent -> min(1.0, 0.45 + 0.10) = 0.55
        7 purchases, recent -> min(1.0, 1.05 + 0.10) = 1.00 -> capped at 1.0
    """
    base = min(1.0, n_purchases * _CONF_PER_PURCHASE)

    days_since = (datetime.now(UTC) - last_purchase_dt).days
    bonus = _CONF_RECENCY_BONUS if days_since <= _CONF_RECENCY_DAYS else 0.0

    return round(min(1.0, base + bonus), 4)


# =============================================================================
# Admin-level DB helpers (service-role client, no TenantContext)
# =============================================================================

async def _fetch_scans(
    property_id: UUID,
    from_date: datetime,
) -> list[dict[str, Any]]:
    """Fetch completed receipt/manual scans via the service-role client."""
    client = await get_async_supabase_admin()
    response = await (
        client.table("scans")
        .select("id, created_at, scan_type, processed_results")
        .eq("property_id", str(property_id))
        .in_("scan_type", ["receipt", "manual"])
        .eq("status", "completed")
        .gte("created_at", from_date.isoformat())
        .order("created_at")
        .execute()
    )
    return response.data or []


async def _fetch_inventory_items(
    property_id: UUID,
) -> list[dict[str, Any]]:
    """Fetch active inventory_items for a property via the service-role client."""
    client = await get_async_supabase_admin()
    response = await (
        client.table("inventory_items")
        .select("id, name, unit, quantity")
        .eq("property_id", str(property_id))
        .eq("is_active", True)
        .execute()
    )
    return response.data or []


async def _upsert_pattern(
    item_id: UUID,
    pattern_type: str,
    pattern_data: dict[str, Any],
    confidence: float,
    sample_size: int,
) -> None:
    """
    Insert or update one consumption_patterns row.

    Matches on (item_id, pattern_type).  We do the SELECT-then-write
    ourselves so there is no dependency on a DB unique constraint.
    """
    client = await get_async_supabase_admin()

    payload: dict[str, Any] = {
        "item_id": str(item_id),
        "pattern_type": pattern_type,
        "pattern_data": pattern_data,
        "confidence": str(confidence),
        "sample_size": sample_size,
    }

    existing = await (
        client.table("consumption_patterns")
        .select("id")
        .eq("item_id", str(item_id))
        .eq("pattern_type", pattern_type)
        .execute()
    )

    if existing.data:
        await (
            client.table("consumption_patterns")
            .update(payload)
            .eq("id", existing.data[0]["id"])
            .execute()
        )
    else:
        payload["id"] = str(uuid4())
        await (
            client.table("consumption_patterns")
            .insert(payload)
            .execute()
        )


# =============================================================================
# Main entry point
# =============================================================================

async def recompute_patterns_for_property(
    property_id: UUID,
) -> dict[str, Any]:
    """
    Analyse historical purchase scans for a property and upsert consumption
    patterns into the consumption_patterns table.

    Called by:
    - Celery task  agents.run_predictions  (via PatternAgent.analyze_patterns)
    - Admin endpoints
    - Post-scan hooks after VisionAgent completes

    Uses the Supabase service-role key throughout -- no TenantContext required.

    Returns a summary dict compatible with the Celery task result schema:
        {
            "property_id": "...",
            "items_analyzed": N,
            "patterns_found": N,
            "unmatched_receipt_items": N,
            "scan_count": N,
        }
    """
    wall_start = _time.perf_counter()

    logger.info(
        "Starting pattern recomputation",
        property_id=str(property_id),
    )

    cutoff = datetime.now(UTC) - timedelta(days=SCAN_LOOKBACK_DAYS)

    # -- 1. Fetch raw data ----------------------------------------------------
    scans = await _fetch_scans(property_id, cutoff)
    inventory_items = await _fetch_inventory_items(property_id)

    if not scans:
        logger.info(
            "No completed scans found; skipping pattern recomputation",
            property_id=str(property_id),
        )
        return {
            "property_id": str(property_id),
            "items_analyzed": 0,
            "patterns_found": 0,
            "unmatched_receipt_items": 0,
            "scan_count": 0,
        }

    logger.info(
        "Scan history fetched",
        property_id=str(property_id),
        scan_count=len(scans),
        inventory_item_count=len(inventory_items),
    )

    # -- 2. Build purchase-event timelines per normalized item name -----------
    # events_by_norm: normalized_name -> [(datetime, qty)]
    # raw_by_norm:   normalized_name -> first raw receipt name seen (for logging)
    events_by_norm: dict[str, PurchaseEvents] = {}
    raw_by_norm: dict[str, str] = {}

    for scan in scans:
        processed: dict[str, Any] = scan.get("processed_results") or {}
        items_in_scan: list[dict[str, Any]] = processed.get("items", [])

        # Prefer the explicit receipt_date over the scan's created_at
        receipt_meta = processed.get("receipt_metadata") or {}
        date_str = receipt_meta.get("receipt_date") or scan.get("created_at") or ""

        try:
            if "T" in date_str:
                purchase_dt = datetime.fromisoformat(
                    date_str.replace("Z", "+00:00")
                )
            elif date_str:
                purchase_dt = datetime.fromisoformat(
                    date_str + "T00:00:00+00:00"
                )
            else:
                purchase_dt = datetime.now(UTC)
        except (ValueError, AttributeError):
            purchase_dt = datetime.now(UTC)

        for item in items_in_scan:
            raw_name: str = (
                item.get("item_name") or item.get("name") or ""
            ).strip()
            if not raw_name:
                continue

            qty = float(item.get("quantity") or 1)
            norm = _normalize_name(raw_name)

            events_by_norm.setdefault(norm, []).append((purchase_dt, qty))
            raw_by_norm.setdefault(norm, raw_name)

    # -- 3. Process each item name --------------------------------------------
    items_analyzed = 0
    patterns_upserted = 0
    unmatched = 0

    for norm_name, events in events_by_norm.items():
        raw_name = raw_by_norm.get(norm_name, norm_name)

        # Match to an inventory_item by name
        matched = _match_inventory_item(raw_name, inventory_items)
        if not matched:
            logger.debug(
                "Receipt item has no inventory match; skipping",
                receipt_name=raw_name,
                normalized=norm_name,
            )
            unmatched += 1
            continue

        item_id = UUID(matched["id"])
        display_name: str = matched.get("name", raw_name)

        # Sort chronologically
        events.sort(key=lambda x: x[0])
        n_purchases = len(events)
        last_dt = events[-1][0]

        items_analyzed += 1

        # -- Compute patterns -------------------------------------------------
        daily_data = _compute_daily_pattern(events)
        weekly_data = _compute_weekly_pattern(events)
        confidence = _compute_confidence(n_purchases, last_dt)

        avg_consumption_rate: float = daily_data["average_daily_consumption"]
        total_days_covered: int = daily_data["total_days_covered"]
        purchase_frequency: float = daily_data["purchase_frequency_days"]

        # -- Compact pattern_json consumed by PredictAgent ---------------------
        pattern_json: dict[str, Any] = {
            "daily":          avg_consumption_rate,
            "weekly":         round(avg_consumption_rate * 7, 4),
            "purchase_count": n_purchases,
            "days_covered":   total_days_covered,
        }

        # -- Full JSONB stored in consumption_patterns.pattern_data ------------
        # "average_daily_consumption" kept for backward compat with predict_agent
        daily_pattern_data: dict[str, Any] = {
            "avg_consumption_rate":     avg_consumption_rate,
            "average_daily_consumption": avg_consumption_rate,   # <- compat alias
            "purchase_frequency":       purchase_frequency,
            "total_purchased":          daily_data["total_purchased"],
            "total_days_covered":       total_days_covered,
            "n_purchases":              n_purchases,
            "pattern_json":             pattern_json,
            "last_purchase_date":       last_dt.isoformat(),
        }

        weekly_pattern_data: dict[str, Any] = {
            **weekly_data,
            "n_purchases": n_purchases,
            "last_purchase_date": last_dt.isoformat(),
        }

        # -- Upsert "daily" pattern --------------------------------------------
        try:
            await _upsert_pattern(
                item_id=item_id,
                pattern_type="daily",
                pattern_data=daily_pattern_data,
                confidence=confidence,
                sample_size=n_purchases,
            )
            patterns_upserted += 1
        except Exception as exc:
            logger.error(
                "Failed to upsert daily pattern",
                item_id=str(item_id),
                item_name=display_name,
                error=str(exc),
            )

        # -- Upsert "weekly" pattern (only if purchases span ? 2 weekdays) ----
        unique_weekdays = {dt.weekday() for dt, _ in events}
        if len(unique_weekdays) >= 2:
            try:
                await _upsert_pattern(
                    item_id=item_id,
                    pattern_type="weekly",
                    pattern_data=weekly_pattern_data,
                    # Weekly patterns are less certain than daily ones
                    confidence=min(confidence, 0.70),
                    sample_size=n_purchases,
                )
                patterns_upserted += 1
            except Exception as exc:
                logger.error(
                    "Failed to upsert weekly pattern",
                    item_id=str(item_id),
                    item_name=display_name,
                    error=str(exc),
                )

    total_events = sum(len(evs) for evs in events_by_norm.values())
    elapsed_ms = int((_time.perf_counter() - wall_start) * 1000)

    logger.info(
        "Pattern recomputation complete",
        property_id=str(property_id),
        scan_count=len(scans),
        total_events=total_events,
        number_of_items=items_analyzed,
        items_analyzed=items_analyzed,
        patterns_upserted=patterns_upserted,
        unmatched_receipt_items=unmatched,
        elapsed_ms=elapsed_ms,
    )

    return {
        "property_id": str(property_id),
        "items_analyzed": items_analyzed,
        "patterns_found": patterns_upserted,
        "unmatched_receipt_items": unmatched,
        "scan_count": len(scans),
    }


# =============================================================================
# PatternAgent class -- backward-compatible wrapper used by Celery tasks
# =============================================================================

class PatternAgent:
    """
    Backward-compatible wrapper around recompute_patterns_for_property.

    The Celery task agents.run_predictions calls:
        agent = await get_pattern_agent()
        result = await agent.analyze_patterns(property_id=..., pattern_types=...)

    This class delegates to the module-level function and returns the same
    summary dict the Celery task expects.
    """

    async def analyze_patterns(
        self,
        property_id: UUID,
        item_ids: list[UUID] | None = None,
        pattern_types: list[str] | None = None,
        parsed_items: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """
        Analyze consumption patterns for a property.

        item_ids and parsed_items are accepted for API compatibility but
        are not used; recompute_patterns_for_property always processes all
        items visible in the last 90 days of scans.

        Returns a dict with at minimum:
            items_analyzed, patterns_found, property_id
        """
        return await recompute_patterns_for_property(property_id)

    async def get_item_patterns(
        self,
        item_id: UUID,
    ) -> list[dict[str, Any]]:
        """Return all stored patterns for an inventory item (admin client)."""
        client = await get_async_supabase_admin()
        response = await (
            client.table("consumption_patterns")
            .select("*")
            .eq("item_id", str(item_id))
            .order("confidence", desc=True)
            .execute()
        )
        return response.data or []


async def get_pattern_agent() -> PatternAgent:
    """Return a PatternAgent instance (factory for dependency injection)."""
    return PatternAgent()
