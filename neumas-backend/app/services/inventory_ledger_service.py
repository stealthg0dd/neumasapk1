from __future__ import annotations

"""
Inventory ledger service — manages the append-only movement ledger
and keeps inventory_items.quantity in sync.

Every quantity change must go through this service to ensure:
- An inventory_movement row is created
- inventory_items.quantity is updated atomically
- Idempotency key prevents duplicate writes on Celery retries
"""

from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.repositories.inventory_movements import InventoryMovementsRepository
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)


class InventoryLedgerService:
    """Service for append-only inventory ledger operations."""

    def __init__(self) -> None:
        self._movements_repo = InventoryMovementsRepository()

    async def apply_movement(
        self,
        tenant: TenantContext,
        item_id: UUID,
        movement_type: str,
        quantity_delta: float,
        unit: str = "unit",
        reference_id: UUID | None = None,
        reference_type: str | None = None,
        idempotency_key: str | None = None,
        notes: str | None = None,
    ) -> dict[str, Any] | None:
        """
        Apply a quantity change to an inventory item.

        1. Fetch current quantity from inventory_items
        2. Write movement row (with idempotency check)
        3. Update inventory_items.quantity

        Returns the movement row, or None on failure.
        The operation is safe to retry — idempotency_key prevents double-writes.
        """
        client = await get_async_supabase_admin()

        # Get current quantity
        item_resp = await (
            client.table("inventory_items")
            .select("id, quantity, unit")
            .eq("id", str(item_id))
            .eq("property_id", str(tenant.property_id) if tenant.property_id else "")
            .single()
            .execute()
        )
        if not item_resp.data:
            logger.warning("Item not found for movement", item_id=str(item_id))
            return None

        quantity_before = float(item_resp.data["quantity"] or 0)
        quantity_after = quantity_before + quantity_delta

        # Create movement record
        movement = await self._movements_repo.create(
            tenant=tenant,
            item_id=item_id,
            movement_type=movement_type,
            quantity_delta=quantity_delta,
            quantity_before=quantity_before,
            quantity_after=quantity_after,
            unit=unit,
            reference_id=reference_id,
            reference_type=reference_type,
            idempotency_key=idempotency_key,
            notes=notes,
        )

        if movement is None:
            logger.error("Failed to create movement", item_id=str(item_id))
            return None

        # Update snapshot quantity
        await (
            client.table("inventory_items")
            .update({"quantity": quantity_after})
            .eq("id", str(item_id))
            .execute()
        )

        logger.info(
            "Inventory movement applied",
            item_id=str(item_id),
            movement_type=movement_type,
            delta=quantity_delta,
            before=quantity_before,
            after=quantity_after,
        )

        return movement

    async def apply_purchase(
        self,
        tenant: TenantContext,
        item_id: UUID,
        quantity: float,
        unit: str = "unit",
        document_id: UUID | None = None,
        idempotency_key: str | None = None,
    ) -> dict[str, Any] | None:
        """Record a purchase movement (positive delta)."""
        return await self.apply_movement(
            tenant=tenant,
            item_id=item_id,
            movement_type="purchase",
            quantity_delta=abs(quantity),
            unit=unit,
            reference_id=document_id,
            reference_type="document" if document_id else None,
            idempotency_key=idempotency_key,
        )

    async def apply_manual_adjustment(
        self,
        tenant: TenantContext,
        item_id: UUID,
        new_quantity: float,
        unit: str = "unit",
        notes: str | None = None,
        idempotency_key: str | None = None,
    ) -> dict[str, Any] | None:
        """Record a manual adjustment to an absolute quantity target."""
        client = await get_async_supabase_admin()

        item_resp = await (
            client.table("inventory_items")
            .select("quantity")
            .eq("id", str(item_id))
            .single()
            .execute()
        )
        if not item_resp.data:
            return None

        current = float(item_resp.data["quantity"] or 0)
        delta = new_quantity - current

        return await self.apply_movement(
            tenant=tenant,
            item_id=item_id,
            movement_type="manual_adjustment",
            quantity_delta=delta,
            unit=unit,
            notes=notes,
            idempotency_key=idempotency_key,
        )

    async def list_movements(
        self,
        tenant: TenantContext,
        item_id: UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """List movements for a property or specific item."""
        if item_id:
            return await self._movements_repo.list_for_item(tenant, item_id, limit, offset)
        return await self._movements_repo.list_for_property(tenant, limit=limit, offset=offset)
