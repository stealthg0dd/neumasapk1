"""
Usage metering repository — records AI and feature usage for cost attribution.
"""

from typing import Any

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)


class UsageMeteringRepository:
    """Repository for the usage_events table."""

    async def record(
        self,
        tenant: TenantContext,
        feature: str,
        event_type: str,
        model: str | None = None,
        input_tokens: int = 0,
        output_tokens: int = 0,
        cost_usd: float = 0.0,
        reference_id: str | None = None,
        reference_type: str | None = None,
        metadata: dict | None = None,
    ) -> dict[str, Any] | None:
        """Record a usage event. Failures are non-fatal."""
        client = await get_async_supabase_admin()
        payload: dict[str, Any] = {
            "organization_id": str(tenant.org_id),
            "user_id": str(tenant.user_id) if tenant.user_id else None,
            "property_id": str(tenant.property_id) if tenant.property_id else None,
            "feature": feature,
            "event_type": event_type,
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": cost_usd,
        }
        if reference_id:
            payload["reference_id"] = reference_id
        if reference_type:
            payload["reference_type"] = reference_type
        if metadata:
            payload["metadata"] = metadata
        try:
            resp = await client.table("usage_events").insert(payload).execute()
            return resp.data[0] if resp.data else None
        except Exception as e:
            logger.warning("Failed to record usage event", error=str(e))
            return None

    async def get_summary(
        self,
        tenant: TenantContext,
        period_start: str,
        period_end: str,
    ) -> list[dict[str, Any]]:
        """Get aggregated cost summary for a date range."""
        client = await get_async_supabase_admin()
        resp = await (
            client.table("usage_events")
            .select("feature, model, input_tokens, output_tokens, cost_usd")
            .eq("organization_id", str(tenant.org_id))
            .gte("created_at", period_start)
            .lte("created_at", period_end)
            .execute()
        )
        return resp.data or []
