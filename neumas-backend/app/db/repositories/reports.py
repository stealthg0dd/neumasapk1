from __future__ import annotations
"""
Reports repository — CRUD for the reports table.
"""

from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)


class ReportsRepository:
    """Repository for the reports table."""

    async def create(
        self,
        tenant: TenantContext,
        report_type: str,
        params: dict,
        params_hash: str,
    ) -> dict[str, Any] | None:
        client = await get_async_supabase_admin()
        payload = {
            "org_id": str(tenant.org_id),
            "property_id": str(tenant.property_id) if tenant.property_id else None,
            "requested_by_id": str(tenant.user_id),
            "report_type": report_type,
            "params": params,
            "params_hash": params_hash,
            "status": "queued",
        }
        resp = await client.table("reports").insert(payload).execute()
        return resp.data[0] if resp.data else None

    async def get_by_id(
        self, tenant: TenantContext, report_id: UUID
    ) -> dict[str, Any] | None:
        client = await get_async_supabase_admin()
        resp = await (
            client.table("reports")
            .select("*")
            .eq("id", str(report_id))
            .eq("org_id", str(tenant.org_id))
            .single()
            .execute()
        )
        return resp.data

    async def find_existing(
        self, tenant: TenantContext, params_hash: str
    ) -> dict[str, Any] | None:
        """Find a recently completed report with the same params (deduplication)."""
        client = await get_async_supabase_admin()
        resp = await (
            client.table("reports")
            .select("*")
            .eq("org_id", str(tenant.org_id))
            .eq("params_hash", params_hash)
            .in_("status", ["queued", "processing", "ready"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        return resp.data[0] if resp.data else None

    async def list(
        self,
        tenant: TenantContext,
        report_type: str | None = None,
        status: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        client = await get_async_supabase_admin()
        q = (
            client.table("reports")
            .select("*")
            .eq("org_id", str(tenant.org_id))
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
        )
        if report_type:
            q = q.eq("report_type", report_type)
        if status:
            q = q.eq("status", status)
        resp = await q.execute()
        return resp.data or []

    async def update_status(
        self,
        report_id: UUID,
        status: str,
        result_url: str | None = None,
        error: str | None = None,
    ) -> dict[str, Any] | None:
        client = await get_async_supabase_admin()
        updates: dict[str, Any] = {"status": status}
        if status in ("ready", "failed"):
            updates["completed_at"] = "now()"
        if result_url:
            updates["result_url"] = result_url
        if error:
            updates["error_message"] = error
        resp = await (
            client.table("reports")
            .update(updates)
            .eq("id", str(report_id))
            .execute()
        )
        return resp.data[0] if resp.data else None
