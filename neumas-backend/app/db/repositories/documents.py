from __future__ import annotations
"""
Documents repository — normalized document records.
"""

from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)


class DocumentsRepository:
    """Repository for document records."""

    async def create(
        self,
        tenant: TenantContext,
        scan_id: UUID | None,
        document_type: str,
        raw_extraction: dict[str, Any],
        raw_vendor_name: str | None = None,
        overall_confidence: float | None = None,
        review_needed: bool = False,
        review_reason: str | None = None,
    ) -> dict[str, Any] | None:
        """Create a document record from a scan extraction."""
        client = await get_async_supabase_admin()
        payload: dict[str, Any] = {
            "property_id": str(tenant.property_id) if tenant.property_id else None,
            "org_id": str(tenant.org_id),
            "document_type": document_type,
            "status": "review" if review_needed else "pending",
            "raw_extraction": raw_extraction,
            "raw_vendor_name": raw_vendor_name,
            "overall_confidence": overall_confidence,
            "review_needed": review_needed,
            "review_reason": review_reason,
            "created_by_id": str(tenant.user_id),
        }
        if scan_id:
            payload["scan_id"] = str(scan_id)

        response = await client.table("documents").insert(payload).execute()
        return response.data[0] if response.data else None

    async def get_by_id(self, tenant: TenantContext, document_id: UUID) -> dict[str, Any] | None:
        """Get a document by ID, scoped to tenant org."""
        client = await get_async_supabase_admin()
        response = await (
            client.table("documents")
            .select("*")
            .eq("id", str(document_id))
            .eq("org_id", str(tenant.org_id))
            .single()
            .execute()
        )
        return response.data

    async def list(
        self,
        tenant: TenantContext,
        status: str | None = None,
        review_needed: bool | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """List documents for a tenant with optional filters."""
        client = await get_async_supabase_admin()
        query = client.table("documents").select("*").eq("org_id", str(tenant.org_id))
        if tenant.property_id:
            query = query.eq("property_id", str(tenant.property_id))
        if status:
            query = query.eq("status", status)
        if review_needed is not None:
            query = query.eq("review_needed", review_needed)
        response = await (
            query.order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        return response.data or []

    async def update_status(
        self,
        tenant: TenantContext,
        document_id: UUID,
        status: str,
        reviewed_by_id: UUID | None = None,
        approved_by_id: UUID | None = None,
    ) -> dict[str, Any] | None:
        """Update document status."""
        client = await get_async_supabase_admin()
        payload: dict[str, Any] = {"status": status}
        if reviewed_by_id:
            payload["reviewed_by_id"] = str(reviewed_by_id)
        if approved_by_id:
            payload["approved_by_id"] = str(approved_by_id)

        response = await (
            client.table("documents")
            .update(payload)
            .eq("id", str(document_id))
            .eq("org_id", str(tenant.org_id))
            .execute()
        )
        return response.data[0] if response.data else None

    async def update_normalized(
        self,
        tenant: TenantContext,
        document_id: UUID,
        normalized_data: dict[str, Any],
        vendor_id: UUID | None = None,
    ) -> dict[str, Any] | None:
        """Store normalized extraction data and optional vendor link."""
        client = await get_async_supabase_admin()
        payload: dict[str, Any] = {"normalized_data": normalized_data}
        if vendor_id:
            payload["vendor_id"] = str(vendor_id)
        response = await (
            client.table("documents")
            .update(payload)
            .eq("id", str(document_id))
            .eq("org_id", str(tenant.org_id))
            .execute()
        )
        return response.data[0] if response.data else None

    async def get_review_queue(
        self,
        tenant: TenantContext,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Return documents needing human review."""
        return await self.list(tenant, review_needed=True, limit=limit)
