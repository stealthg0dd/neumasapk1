"""
Usage service — aggregate usage metering data into operator-facing summaries.

Provides org-level and property-level usage summaries for admin dashboards
and plan enforcement.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.repositories.usage_metering import UsageMeteringRepository
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)


class UsageService:
    """Aggregates usage metering data for admin and billing surfaces."""

    def __init__(self) -> None:
        self._repo = UsageMeteringRepository()

    async def get_org_summary(
        self,
        tenant: TenantContext,
        days: int = 30,
    ) -> dict[str, Any]:
        """
        Return aggregated usage summary for the whole organisation.

        Covers the last `days` calendar days.
        """
        now = datetime.now(UTC)
        since = now - timedelta(days=days)

        # LLM usage from usage_events table
        llm_summary = await self._repo.get_summary(tenant, since=since, until=now)

        client = await get_async_supabase_admin()
        org_id = str(tenant.org_id)

        # Documents scanned
        doc_resp = await (
            client.table("documents")
            .select("id", count="exact")
            .eq("org_id", org_id)
            .gte("created_at", since.isoformat())
            .execute()
        )
        documents_scanned = doc_resp.count or 0

        # Line items processed
        li_resp = await (
            client.table("document_line_items")
            .select("id", count="exact")
            .eq("org_id", org_id)
            .gte("created_at", since.isoformat())
            .execute()
        )
        line_items_processed = li_resp.count or 0

        # Exports (reports in "ready" state)
        exp_resp = await (
            client.table("reports")
            .select("id", count="exact")
            .eq("org_id", org_id)
            .eq("status", "ready")
            .gte("created_at", since.isoformat())
            .execute()
        )
        exports_generated = exp_resp.count or 0

        # Active users (distinct actor_ids in audit_logs)
        try:
            usr_resp = await (
                client.table("audit_logs")
                .select("actor_id")
                .eq("org_id", org_id)
                .gte("created_at", since.isoformat())
                .execute()
            )
            active_users = len({r["actor_id"] for r in (usr_resp.data or []) if r.get("actor_id")})
        except Exception:
            active_users = 0

        # Active properties
        try:
            prop_resp = await (
                client.table("scans")
                .select("property_id")
                .eq("org_id", org_id)
                .gte("created_at", since.isoformat())
                .execute()
            )
            active_properties = len({r["property_id"] for r in (prop_resp.data or []) if r.get("property_id")})
        except Exception:
            active_properties = 0

        llm_calls = llm_summary.get("total_calls", 0)
        llm_cost = llm_summary.get("total_cost_usd", 0.0)
        breakdown = llm_summary.get("by_feature", {})

        return {
            "org_id": org_id,
            "period_days": days,
            "period_start": since.isoformat(),
            "period_end": now.isoformat(),
            "documents_scanned": documents_scanned,
            "line_items_processed": line_items_processed,
            "exports_generated": exports_generated,
            "active_users": active_users,
            "active_properties": active_properties,
            "llm_calls": llm_calls,
            "llm_cost_usd": round(llm_cost, 6),
            "breakdown": breakdown,
        }

    async def get_property_summary(
        self,
        tenant: TenantContext,
        days: int = 30,
    ) -> dict[str, Any]:
        """Return usage summary scoped to the active property."""
        if not tenant.property_id:
            return {}

        now = datetime.now(UTC)
        since = now - timedelta(days=days)
        client = await get_async_supabase_admin()
        prop_id = str(tenant.property_id)
        org_id = str(tenant.org_id)

        doc_resp = await (
            client.table("documents")
            .select("id", count="exact")
            .eq("org_id", org_id)
            .eq("property_id", prop_id)
            .gte("created_at", since.isoformat())
            .execute()
        )

        scan_resp = await (
            client.table("scans")
            .select("id", count="exact")
            .eq("org_id", org_id)
            .eq("property_id", prop_id)
            .gte("created_at", since.isoformat())
            .execute()
        )

        alert_resp = await (
            client.table("alerts")
            .select("id", count="exact")
            .eq("org_id", org_id)
            .eq("property_id", prop_id)
            .gte("created_at", since.isoformat())
            .execute()
        )

        return {
            "property_id": prop_id,
            "period_days": days,
            "period_start": since.isoformat(),
            "period_end": now.isoformat(),
            "documents_scanned": doc_resp.count or 0,
            "scans_submitted": scan_resp.count or 0,
            "alerts_generated": alert_resp.count or 0,
        }
