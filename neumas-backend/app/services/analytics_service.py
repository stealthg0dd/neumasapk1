"""
Analytics service — aggregates usage and inventory metrics for the dashboard.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)


class AnalyticsService:
    """Service for analytics aggregation."""

    async def get_usage_summary(
        self,
        tenant: TenantContext,
        period_days: int = 30,
    ) -> dict[str, Any]:
        """Return AI usage cost summary for the given period."""
        from app.db.repositories.usage_metering import UsageMeteringRepository

        repo = UsageMeteringRepository()
        now = datetime.now(UTC)
        period_start = (now - timedelta(days=period_days)).isoformat()
        period_end = now.isoformat()

        events = await repo.get_summary(tenant, period_start, period_end)

        # Aggregate by feature
        by_feature: dict[str, dict[str, Any]] = {}
        total_cost = 0.0
        total_input_tokens = 0
        total_output_tokens = 0

        for event in events:
            feature = event.get("feature", "unknown")
            if feature not in by_feature:
                by_feature[feature] = {"input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0}
            by_feature[feature]["input_tokens"] += int(event.get("input_tokens") or 0)
            by_feature[feature]["output_tokens"] += int(event.get("output_tokens") or 0)
            by_feature[feature]["cost_usd"] += float(event.get("cost_usd") or 0)
            total_cost += float(event.get("cost_usd") or 0)
            total_input_tokens += int(event.get("input_tokens") or 0)
            total_output_tokens += int(event.get("output_tokens") or 0)

        return {
            "period_days": period_days,
            "period_start": period_start,
            "period_end": period_end,
            "total_cost_usd": round(total_cost, 6),
            "total_input_tokens": total_input_tokens,
            "total_output_tokens": total_output_tokens,
            "by_feature": by_feature,
        }

    async def get_inventory_health(self, tenant: TenantContext) -> dict[str, Any]:
        """Return inventory health metrics for the dashboard."""
        client = await get_async_supabase_admin()
        prop_filter = str(tenant.property_id) if tenant.property_id else None

        q = (
            client.table("inventory_items")
            .select("id, quantity, par_level, updated_at")
            .eq("org_id", str(tenant.org_id))
        )
        if prop_filter:
            q = q.eq("property_id", prop_filter)

        items_resp = await q.execute()
        items = items_resp.data or []

        total = len(items)
        out_of_stock = sum(1 for i in items if float(i.get("quantity") or 0) == 0)
        low_stock = sum(
            1
            for i in items
            if i.get("par_level")
            and 0 < float(i.get("quantity") or 0) <= float(i.get("par_level") or 0)
        )
        healthy = total - out_of_stock - low_stock

        return {
            "total_items": total,
            "out_of_stock": out_of_stock,
            "low_stock": low_stock,
            "healthy": healthy,
            "health_score": round(healthy / total, 2) if total > 0 else 1.0,
        }

    async def get_scan_activity(
        self,
        tenant: TenantContext,
        period_days: int = 30,
    ) -> dict[str, Any]:
        """Return scan activity summary."""
        client = await get_async_supabase_admin()
        cutoff = (datetime.now(UTC) - timedelta(days=period_days)).isoformat()

        resp = await (
            client.table("scans")
            .select("id, status, created_at", count="exact")
            .eq("org_id", str(tenant.org_id))
            .gte("created_at", cutoff)
            .execute()
        )
        scans = resp.data or []

        by_status: dict[str, int] = {}
        for scan in scans:
            s = scan.get("status", "unknown")
            by_status[s] = by_status.get(s, 0) + 1

        return {
            "period_days": period_days,
            "total_scans": len(scans),
            "by_status": by_status,
        }
