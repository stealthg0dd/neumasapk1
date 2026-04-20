from __future__ import annotations

"""
Canonical items repository — manages the canonical_items and item_aliases tables.
"""

from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)


class CanonicalItemsRepository:
    """Repository for canonical_items and item_aliases tables."""

    async def create(
        self,
        tenant: TenantContext,
        canonical_name: str,
        category: str | None = None,
        default_unit: str = "unit",
        **kwargs: Any,
    ) -> dict[str, Any] | None:
        client = await get_async_supabase_admin()
        payload = {
            "org_id": str(tenant.org_id),
            "canonical_name": canonical_name,
            "default_unit": default_unit,
            "category": category,
            **{k: v for k, v in kwargs.items() if v is not None},
        }
        resp = await client.table("canonical_items").insert(payload).execute()
        return resp.data[0] if resp.data else None

    async def get_by_id(
        self, tenant: TenantContext, item_id: UUID
    ) -> dict[str, Any] | None:
        client = await get_async_supabase_admin()
        resp = await (
            client.table("canonical_items")
            .select("*")
            .eq("id", str(item_id))
            .eq("org_id", str(tenant.org_id))
            .single()
            .execute()
        )
        return resp.data

    async def find_by_name(
        self, tenant: TenantContext, canonical_name: str
    ) -> dict[str, Any] | None:
        """Find by exact canonical name (case-insensitive)."""
        client = await get_async_supabase_admin()
        resp = await (
            client.table("canonical_items")
            .select("*")
            .eq("org_id", str(tenant.org_id))
            .ilike("canonical_name", canonical_name)
            .limit(1)
            .execute()
        )
        return resp.data[0] if resp.data else None

    async def find_by_alias(
        self, tenant: TenantContext, raw_name: str
    ) -> dict[str, Any] | None:
        """Look up a canonical item by a known alias."""
        client = await get_async_supabase_admin()
        resp = await (
            client.table("item_aliases")
            .select("canonical_item_id, canonical_items(*)")
            .eq("org_id", str(tenant.org_id))
            .ilike("alias_name", raw_name)
            .limit(1)
            .execute()
        )
        if resp.data:
            return resp.data[0].get("canonical_items")
        return None

    async def search(
        self,
        tenant: TenantContext,
        query: str,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Full-text search over canonical item names."""
        client = await get_async_supabase_admin()
        resp = await (
            client.table("canonical_items")
            .select("*")
            .eq("org_id", str(tenant.org_id))
            .text_search("canonical_name_tsv", query, config="english")
            .limit(limit)
            .execute()
        )
        return resp.data or []

    async def list(
        self,
        tenant: TenantContext,
        category: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        client = await get_async_supabase_admin()
        q = (
            client.table("canonical_items")
            .select("*")
            .eq("org_id", str(tenant.org_id))
            .order("canonical_name")
            .range(offset, offset + limit - 1)
        )
        if category:
            q = q.eq("category", category)
        resp = await q.execute()
        return resp.data or []

    async def add_alias(
        self,
        tenant: TenantContext,
        canonical_item_id: UUID,
        alias_name: str,
        source: str = "manual",
        confidence: float = 1.0,
    ) -> dict[str, Any] | None:
        client = await get_async_supabase_admin()
        payload = {
            "canonical_item_id": str(canonical_item_id),
            "org_id": str(tenant.org_id),
            "alias_name": alias_name,
            "source": source,
            "confidence": confidence,
        }
        resp = await (
            client.table("item_aliases")
            .upsert(payload, on_conflict="org_id,alias_name")
            .execute()
        )
        return resp.data[0] if resp.data else None
