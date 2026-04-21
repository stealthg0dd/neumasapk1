from __future__ import annotations

"""
Inventory movements repository — append-only ledger.

Every quantity-changing action on inventory creates a movement row here.
The idempotency_key column prevents duplicate writes on Celery task retries.
"""

from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)


class InventoryMovementsRepository:
    """Repository for inventory movement ledger (append-only)."""

    async def create(
        self,
        tenant: TenantContext,
        item_id: UUID,
        movement_type: str,
        quantity_delta: float,
        quantity_before: float,
        quantity_after: float,
        unit: str = "unit",
        reference_id: UUID | None = None,
        reference_type: str | None = None,
        idempotency_key: str | None = None,
        notes: str | None = None,
    ) -> dict[str, Any] | None:
        """
        Append a movement row to the ledger.

        Returns the created row, or the existing row if idempotency_key matches.
        Returns None on error.
        """
        client = await get_async_supabase_admin()

        payload: dict[str, Any] = {
            "item_id": str(item_id),
            "property_id": str(tenant.property_id) if tenant.property_id else None,
            "organization_id": str(tenant.org_id),
            "movement_type": movement_type,
            "quantity_delta": float(quantity_delta),
            "quantity_before": float(quantity_before),
            "quantity_after": float(quantity_after),
            "unit": unit,
            "created_by_id": str(tenant.user_id),
        }
        if reference_id:
            payload["reference_id"] = str(reference_id)
        if reference_type:
            payload["reference_type"] = reference_type
        if idempotency_key:
            payload["idempotency_key"] = idempotency_key
        if notes:
            payload["notes"] = notes

        try:
            response = await (
                client.table("inventory_movements")
                .insert(payload, returning="representation")
                .execute()
            )
            if response.data:
                return response.data[0]
        except Exception as e:
            # Unique constraint on idempotency_key — return existing row
            if "idempotency_key" in str(e) and idempotency_key:
                logger.info(
                    "Movement already recorded (idempotency)",
                    idempotency_key=idempotency_key,
                    item_id=str(item_id),
                )
                existing = await self.get_by_idempotency_key(idempotency_key)
                return existing
            logger.error("Failed to create inventory movement", error=str(e), item_id=str(item_id))
        return None

    async def get_by_idempotency_key(self, key: str) -> dict[str, Any] | None:
        """Fetch an existing movement by idempotency key."""
        client = await get_async_supabase_admin()
        response = await (
            client.table("inventory_movements")
            .select("*")
            .eq("idempotency_key", key)
            .limit(1)
            .execute()
        )
        return response.data[0] if response.data else None

    async def list_for_item(
        self,
        tenant: TenantContext,
        item_id: UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """List movements for a specific item, newest first."""
        client = await get_async_supabase_admin()
        response = await (
            client.table("inventory_movements")
            .select("*")
            .eq("item_id", str(item_id))
            .eq("organization_id", str(tenant.org_id))
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        return response.data or []

    async def list_for_property(
        self,
        tenant: TenantContext,
        movement_type: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """List movements for a property, with optional type filter."""
        client = await get_async_supabase_admin()
        query = (
            client.table("inventory_movements")
            .select("*")
            .eq("organization_id", str(tenant.org_id))
        )
        if tenant.property_id:
            query = query.eq("property_id", str(tenant.property_id))
        if movement_type:
            query = query.eq("movement_type", movement_type)
        response = await (
            query.order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        return response.data or []
