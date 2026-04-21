from __future__ import annotations

"""
Alerts repository — CRUD for the alerts table.
"""

from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)


class AlertsRepository:
    """Repository for the alerts table."""

    async def create(
        self,
        tenant: TenantContext,
        alert_type: str,
        severity: str,
        title: str,
        body: str,
        item_id: UUID | None = None,
        metadata: dict | None = None,
    ) -> dict[str, Any] | None:
        client = await get_async_supabase_admin()
        payload: dict[str, Any] = {
            "organization_id": str(tenant.org_id),
            "property_id": str(tenant.property_id) if tenant.property_id else None,
            "alert_type": alert_type,
            "severity": severity,
            "state": "open",
            "title": title,
            "body": body,
        }
        if item_id:
            payload["item_id"] = str(item_id)
        if metadata:
            payload["metadata"] = metadata
        resp = await client.table("alerts").insert(payload).execute()
        return resp.data[0] if resp.data else None

    async def get_by_id(
        self, tenant: TenantContext, alert_id: UUID
    ) -> dict[str, Any] | None:
        client = await get_async_supabase_admin()
        resp = await (
            client.table("alerts")
            .select("*")
            .eq("id", str(alert_id))
            .eq("organization_id", str(tenant.org_id))
            .single()
            .execute()
        )
        return resp.data

    async def list(
        self,
        tenant: TenantContext,
        state: str | None = None,
        alert_type: str | None = None,
        severity: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        client = await get_async_supabase_admin()
        q = (
            client.table("alerts")
            .select("*")
            .eq("organization_id", str(tenant.org_id))
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
        )
        if tenant.property_id:
            q = q.eq("property_id", str(tenant.property_id))
        if state:
            q = q.eq("state", state)
        if alert_type:
            q = q.eq("alert_type", alert_type)
        if severity:
            q = q.eq("severity", severity)
        resp = await q.execute()
        return resp.data or []

    async def transition_state(
        self,
        tenant: TenantContext,
        alert_id: UUID,
        new_state: str,
        resolved_by_id: UUID | None = None,
        snooze_until: str | None = None,
    ) -> dict[str, Any] | None:
        """
        Apply a state transition on the alert.

        Valid transitions:
          open -> snoozed | resolved
          snoozed -> open | resolved
          resolved -> (terminal — no transitions)
        """
        client = await get_async_supabase_admin()
        updates: dict[str, Any] = {"state": new_state}
        if new_state == "resolved":
            updates["resolved_at"] = "now()"
            if resolved_by_id:
                updates["resolved_by_id"] = str(resolved_by_id)
        if new_state == "snoozed" and snooze_until:
            updates["snooze_until"] = snooze_until
        resp = await (
            client.table("alerts")
            .update(updates)
            .eq("id", str(alert_id))
            .eq("organization_id", str(tenant.org_id))
            .neq("state", "resolved")  # Can't transition out of terminal state
            .execute()
        )
        return resp.data[0] if resp.data else None

    async def count_open(self, tenant: TenantContext) -> int:
        """Count open alerts for the tenant."""
        client = await get_async_supabase_admin()
        query = (
            client.table("alerts")
            .select("id", count="exact")
            .eq("organization_id", str(tenant.org_id))
            .eq("state", "open")
        )
        if tenant.property_id:
            query = query.eq("property_id", str(tenant.property_id))
        resp = await query.execute()
        return resp.count or 0
