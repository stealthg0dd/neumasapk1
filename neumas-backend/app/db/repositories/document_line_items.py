from __future__ import annotations

"""
Document line items repository.
"""

from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)


class DocumentLineItemsRepository:
    """Repository for document line items."""

    async def create_many(
        self,
        tenant: TenantContext,
        document_id: UUID,
        items: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Bulk insert line items for a document."""
        client = await get_async_supabase_admin()
        rows = []
        for item in items:
            rows.append({
                "document_id": str(document_id),
                "property_id": str(tenant.property_id) if tenant.property_id else None,
                "organization_id": str(tenant.org_id),
                "raw_name": item.get("raw_name", ""),
                "raw_quantity": item.get("raw_quantity"),
                "raw_unit": item.get("raw_unit"),
                "raw_price": item.get("raw_price"),
                "raw_total": item.get("raw_total"),
                "normalized_name": item.get("normalized_name"),
                "normalized_quantity": item.get("normalized_quantity"),
                "normalized_unit": item.get("normalized_unit"),
                "unit_price": item.get("unit_price"),
                "confidence": item.get("confidence"),
                "review_needed": item.get("review_needed", False),
                "review_reason": item.get("review_reason"),
                "canonical_item_id": str(item["canonical_item_id"]) if item.get("canonical_item_id") else None,
                "vendor_id": str(item["vendor_id"]) if item.get("vendor_id") else None,
            })
        if not rows:
            return []
        response = await client.table("document_line_items").insert(rows).execute()
        return response.data or []

    async def list_for_document(
        self,
        tenant: TenantContext,
        document_id: UUID,
    ) -> list[dict[str, Any]]:
        """Get all line items for a document."""
        client = await get_async_supabase_admin()
        response = await (
            client.table("document_line_items")
            .select("*")
            .eq("document_id", str(document_id))
            .eq("organization_id", str(tenant.org_id))
            .execute()
        )
        return response.data or []

    async def update_line_item(
        self,
        tenant: TenantContext,
        line_item_id: UUID,
        updates: dict[str, Any],
    ) -> dict[str, Any] | None:
        """Update a single line item (e.g., operator correction)."""
        client = await get_async_supabase_admin()
        safe_updates = {k: v for k, v in updates.items() if k in {
            "normalized_name", "normalized_quantity", "normalized_unit",
            "unit_price", "review_needed", "review_reason",
            "canonical_item_id", "corrected_by_id", "corrected_at",
        }}
        if not safe_updates:
            return None
        response = await (
            client.table("document_line_items")
            .update(safe_updates)
            .eq("id", str(line_item_id))
            .eq("organization_id", str(tenant.org_id))
            .execute()
        )
        return response.data[0] if response.data else None

    async def link_movement(
        self,
        tenant: TenantContext,
        line_item_id: UUID,
        movement_id: UUID,
    ) -> None:
        """Link a created inventory movement back to the line item."""
        client = await get_async_supabase_admin()
        await (
            client.table("document_line_items")
            .update({"inventory_movement_id": str(movement_id)})
            .eq("id", str(line_item_id))
            .eq("organization_id", str(tenant.org_id))
            .execute()
        )

    async def get_review_items(
        self,
        tenant: TenantContext,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Return line items flagged for review across all documents."""
        client = await get_async_supabase_admin()
        response = await (
            client.table("document_line_items")
            .select("*, documents(id, status, document_type, created_at)")
            .eq("organization_id", str(tenant.org_id))
            .eq("review_needed", True)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return response.data or []
