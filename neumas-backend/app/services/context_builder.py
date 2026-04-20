"""
Context builder for AI agents (copilot readiness).

Assembles a structured context payload that can be passed to any LLM agent
(vision, research, budget, predict) to ground responses in real tenant data.

This module is the single place that decides what an agent "knows" about
a property at query time. Extend it as new data sources are added.
"""

from typing import Any

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)


async def build_property_context(
    tenant: TenantContext,
    include_inventory: bool = True,
    include_recent_scans: bool = True,
    include_open_alerts: bool = True,
    include_predictions: bool = False,
    max_items: int = 50,
) -> dict[str, Any]:
    """
    Build a structured context payload for an AI agent.

    Returns a dict suitable for inclusion in an LLM system prompt or
    function call context.

    Example:
        ctx = await build_property_context(tenant)
        prompt = f"You are a procurement assistant. Here is the current state:\\n{ctx}"
    """
    client = await get_async_supabase_admin()
    ctx: dict[str, Any] = {
        "org_id": str(tenant.org_id),
        "property_id": str(tenant.property_id) if tenant.property_id else None,
    }

    if include_inventory:
        q = (
            client.table("inventory_items")
            .select("name, quantity, unit, par_level, updated_at")
            .eq("org_id", str(tenant.org_id))
            .order("name")
            .limit(max_items)
        )
        if tenant.property_id:
            q = q.eq("property_id", str(tenant.property_id))
        resp = await q.execute()
        ctx["inventory"] = [
            {
                "name": i["name"],
                "quantity": i["quantity"],
                "unit": i["unit"],
                "par_level": i.get("par_level"),
                "days_since_update": _days_ago(i.get("updated_at")),
            }
            for i in (resp.data or [])
        ]

    if include_recent_scans:
        q = (
            client.table("scans")
            .select("id, status, created_at, scan_type")
            .eq("org_id", str(tenant.org_id))
            .order("created_at", desc=True)
            .limit(5)
        )
        if tenant.property_id:
            q = q.eq("property_id", str(tenant.property_id))
        resp = await q.execute()
        ctx["recent_scans"] = resp.data or []

    if include_open_alerts:
        resp = await (
            client.table("alerts")
            .select("alert_type, severity, title")
            .eq("org_id", str(tenant.org_id))
            .eq("state", "open")
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        )
        ctx["open_alerts"] = resp.data or []

    if include_predictions:
        q = (
            client.table("predictions")
            .select("item_id, predicted_value, prediction_date, urgency")
            .eq("org_id", str(tenant.org_id))
            .order("prediction_date", desc=True)
            .limit(20)
        )
        if tenant.property_id:
            q = q.eq("property_id", str(tenant.property_id))
        resp = await q.execute()
        ctx["predictions"] = resp.data or []

    return ctx


def _days_ago(timestamp: str | None) -> int | None:
    """Convert an ISO timestamp to days-ago integer."""
    if not timestamp:
        return None
    from datetime import UTC, datetime
    try:
        ts = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        return max(0, (datetime.now(UTC) - ts).days)
    except Exception:
        return None
