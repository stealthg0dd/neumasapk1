from __future__ import annotations
"""
Vendors repository — CRUD for vendors and vendor_aliases tables.
"""

from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)


class VendorsRepository:
    """Repository for vendors and vendor_aliases tables."""

    async def create(
        self,
        tenant: TenantContext,
        name: str,
        **kwargs: Any,
    ) -> dict[str, Any] | None:
        client = await get_async_supabase_admin()
        payload = {
            "org_id": str(tenant.org_id),
            "name": name,
            **{k: v for k, v in kwargs.items() if v is not None},
        }
        resp = await client.table("vendors").insert(payload).execute()
        return resp.data[0] if resp.data else None

    async def get_by_id(
        self, tenant: TenantContext, vendor_id: UUID
    ) -> dict[str, Any] | None:
        client = await get_async_supabase_admin()
        resp = await (
            client.table("vendors")
            .select("*")
            .eq("id", str(vendor_id))
            .eq("org_id", str(tenant.org_id))
            .single()
            .execute()
        )
        return resp.data

    async def list(
        self,
        tenant: TenantContext,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        client = await get_async_supabase_admin()
        resp = await (
            client.table("vendors")
            .select("*")
            .eq("org_id", str(tenant.org_id))
            .order("name")
            .range(offset, offset + limit - 1)
            .execute()
        )
        return resp.data or []

    async def find_by_name(
        self, tenant: TenantContext, name: str
    ) -> dict[str, Any] | None:
        """Find a vendor by exact canonical name (case-insensitive)."""
        client = await get_async_supabase_admin()
        resp = await (
            client.table("vendors")
            .select("*")
            .eq("org_id", str(tenant.org_id))
            .ilike("name", name)
            .limit(1)
            .execute()
        )
        return resp.data[0] if resp.data else None

    async def find_by_alias(
        self, tenant: TenantContext, raw_name: str
    ) -> dict[str, Any] | None:
        """Look up a vendor by a known alias string."""
        client = await get_async_supabase_admin()
        # Join through vendor_aliases
        resp = await (
            client.table("vendor_aliases")
            .select("vendor_id, vendors(*)")
            .eq("org_id", str(tenant.org_id))
            .ilike("alias_name", raw_name)
            .limit(1)
            .execute()
        )
        if resp.data:
            return resp.data[0].get("vendors")
        return None

    async def add_alias(
        self,
        tenant: TenantContext,
        vendor_id: UUID,
        alias_name: str,
        source: str = "manual",
    ) -> dict[str, Any] | None:
        client = await get_async_supabase_admin()
        payload = {
            "vendor_id": str(vendor_id),
            "org_id": str(tenant.org_id),
            "alias_name": alias_name,
            "source": source,
        }
        resp = await client.table("vendor_aliases").upsert(payload, on_conflict="org_id,alias_name").execute()
        return resp.data[0] if resp.data else None

    async def update(
        self,
        tenant: TenantContext,
        vendor_id: UUID,
        updates: dict[str, Any],
    ) -> dict[str, Any] | None:
        client = await get_async_supabase_admin()
        resp = await (
            client.table("vendors")
            .update(updates)
            .eq("id", str(vendor_id))
            .eq("org_id", str(tenant.org_id))
            .execute()
        )
        return resp.data[0] if resp.data else None
