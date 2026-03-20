"""
Shopping lists repository for database operations.

Multi-tenant access: All queries filter by tenant.property_id to ensure
data isolation. This aligns with Supabase RLS policies:

    -- Example RLS policy on shopping_lists
    CREATE POLICY "users_can_view_own_property_lists"
    ON shopping_lists FOR SELECT
    USING (
        property_id IN (
            SELECT p.id FROM properties p
            JOIN users u ON u.org_id = p.org_id
            WHERE u.auth_id = auth.uid()
        )
    );
"""

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any
from uuid import UUID

from supabase._async.client import AsyncClient

from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

if TYPE_CHECKING:
    from app.api.deps import TenantContext

logger = get_logger(__name__)


class ShoppingListsRepository:
    """
    Repository for shopping list database operations.
    
    All methods require a TenantContext to ensure proper tenant isolation.
    Queries filter by property_id which aligns with RLS policies.
    """

    def __init__(self, client: AsyncClient) -> None:
        self.client = client
        self.table = "shopping_lists"
        self.items_table = "shopping_list_items"

    # =========================================================================
    # Shopping Lists
    # =========================================================================

    async def get_by_id(
        self,
        tenant: "TenantContext",
        list_id: UUID,
    ) -> dict[str, Any] | None:
        """
        Get shopping list by ID with items.
        
        RLS: Users can only view lists for their properties.
        """
        query = (
            self.client.table(self.table)
            .select("*, items:shopping_list_items(*)")
            .eq("id", str(list_id))
        )
        
        if tenant.property_id:
            query = query.eq("property_id", str(tenant.property_id))
        
        try:
            response = await query.single().execute()
            return response.data
        except Exception as e:
            logger.error(
                "Failed to get shopping list",
                list_id=str(list_id),
                error=str(e),
            )
            return None

    async def get_active_list(
        self,
        property_id: UUID,
        tenant: "TenantContext",
    ) -> dict[str, Any] | None:
        """Get the most recent active shopping list for a property."""
        try:
            response = await (
                self.client.table(self.table)
                .select("*")
                .eq("property_id", str(property_id))
                .eq("status", "active")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(
                "Failed to get active shopping list",
                property_id=str(property_id),
                error=str(e),
            )
            return None

    async def get_list_items(
        self,
        list_id: UUID,
        tenant: "TenantContext",
    ) -> list[dict[str, Any]]:
        """Get all items for a shopping list (alias matching service call order)."""
        return await self.get_items(tenant, list_id)

    async def get_by_property(
        self,
        tenant: "TenantContext",
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """
        Get shopping lists for tenant's property.
        
        RLS: Automatically filtered to accessible properties.
        """
        if not tenant.property_id:
            logger.warning("get_by_property called without property_id")
            return []
        
        query = (
            self.client.table(self.table)
            .select("*, items:shopping_list_items(count)")
            .eq("property_id", str(tenant.property_id))
        )

        if status:
            query = query.eq("status", status)

        response = await (
            query
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        return response.data

    async def create(
        self,
        tenant: "TenantContext",
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Create a new shopping list for tenant's property.
        
        RLS: Insert policy requires property_id to be accessible.
        """
        if not tenant.property_id:
            raise ValueError("property_id required to create shopping list")
        
        # Ensure property_id and created_by are set from tenant context
        data["property_id"] = str(tenant.property_id)
        data["created_by_id"] = str(tenant.user_id)
        
        response = await self.client.table(self.table).insert(data).execute()
        logger.info(
            "Created shopping list",
            list_id=response.data[0]["id"],
            property_id=str(tenant.property_id),
            user_id=str(tenant.user_id),
        )
        return response.data[0]

    async def update(
        self,
        tenant: "TenantContext",
        list_id: UUID,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Update a shopping list.
        
        RLS: Update policy ensures user can only update accessible lists.
        """
        query = (
            self.client.table(self.table)
            .update(data)
            .eq("id", str(list_id))
        )
        
        if tenant.property_id:
            query = query.eq("property_id", str(tenant.property_id))
        
        response = await query.execute()
        logger.info(
            "Updated shopping list",
            list_id=str(list_id),
            user_id=str(tenant.user_id),
        )
        return response.data[0]

    async def update_status(
        self,
        tenant: "TenantContext",
        list_id: UUID,
        status: str,
        approved_by_id: UUID | None = None,
    ) -> dict[str, Any]:
        """Update shopping list status."""
        from datetime import UTC

        data: dict[str, Any] = {"status": status}

        if status == "approved":
            data["approved_at"] = datetime.now(UTC).isoformat()
            data["approved_by_id"] = str(approved_by_id or tenant.user_id)

        return await self.update(tenant, list_id, data)

    async def delete(
        self,
        tenant: "TenantContext",
        list_id: UUID,
    ) -> bool:
        """
        Delete a shopping list and its items.
        
        RLS: Delete policy ensures user can only delete accessible lists.
        """
        try:
            # Delete items first (cascade should handle this, but being explicit)
            await (
                self.client.table(self.items_table)
                .delete()
                .eq("shopping_list_id", str(list_id))
                .execute()
            )

            query = (
                self.client.table(self.table)
                .delete()
                .eq("id", str(list_id))
            )
            
            if tenant.property_id:
                query = query.eq("property_id", str(tenant.property_id))
            
            await query.execute()
            logger.info(
                "Deleted shopping list",
                list_id=str(list_id),
                user_id=str(tenant.user_id),
            )
            return True
        except Exception as e:
            logger.error("Failed to delete shopping list", list_id=str(list_id), error=str(e))
            return False

    # =========================================================================
    # Shopping List Items
    # =========================================================================

    async def add_item(
        self,
        tenant: "TenantContext",
        list_id: UUID,
        item_data: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Add item to shopping list.
        
        Verifies list belongs to tenant's property before adding.
        """
        # Verify access to the list
        shopping_list = await self.get_by_id(tenant, list_id)
        if not shopping_list:
            raise ValueError("Shopping list not found or access denied")
        
        item_data["shopping_list_id"] = str(list_id)
        response = await self.client.table(self.items_table).insert(item_data).execute()
        return response.data[0]

    async def add_items_batch(
        self,
        tenant: "TenantContext",
        list_id: UUID,
        items: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Add multiple items to shopping list."""
        # Verify access to the list
        shopping_list = await self.get_by_id(tenant, list_id)
        if not shopping_list:
            raise ValueError("Shopping list not found or access denied")
        
        for item in items:
            item["shopping_list_id"] = str(list_id)

        response = await self.client.table(self.items_table).insert(items).execute()
        return response.data

    async def update_item(
        self,
        tenant: "TenantContext",
        list_id: UUID,
        item_id: UUID,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Update a shopping list item.
        
        Verifies list belongs to tenant's property.
        """
        # Verify access to the list
        shopping_list = await self.get_by_id(tenant, list_id)
        if not shopping_list:
            raise ValueError("Shopping list not found or access denied")
        
        response = await (
            self.client.table(self.items_table)
            .update(data)
            .eq("id", str(item_id))
            .eq("shopping_list_id", str(list_id))
            .execute()
        )
        return response.data[0]

    async def mark_item_purchased(
        self,
        tenant: "TenantContext",
        list_id: UUID,
        item_id: UUID,
        actual_price: Decimal | None = None,
    ) -> dict[str, Any]:
        """Mark an item as purchased."""
        from datetime import UTC

        data: dict[str, Any] = {
            "is_purchased": True,
            "purchased_at": datetime.now(UTC).isoformat(),
        }

        if actual_price is not None:
            data["actual_price"] = str(actual_price)

        return await self.update_item(tenant, list_id, item_id, data)

    async def remove_item(
        self,
        tenant: "TenantContext",
        list_id: UUID,
        item_id: UUID,
    ) -> bool:
        """
        Remove item from shopping list.
        
        Verifies list belongs to tenant's property.
        """
        # Verify access to the list
        shopping_list = await self.get_by_id(tenant, list_id)
        if not shopping_list:
            return False
        
        try:
            await (
                self.client.table(self.items_table)
                .delete()
                .eq("id", str(item_id))
                .eq("shopping_list_id", str(list_id))
                .execute()
            )
            return True
        except Exception as e:
            logger.error("Failed to remove item", item_id=str(item_id), error=str(e))
            return False

    async def get_items(
        self,
        tenant: "TenantContext",
        list_id: UUID,
    ) -> list[dict[str, Any]]:
        """
        Get all items in a shopping list.
        
        Verifies list belongs to tenant's property.
        """
        # Verify access to the list
        shopping_list = await self.get_by_id(tenant, list_id)
        if not shopping_list:
            return []
        
        response = await (
            self.client.table(self.items_table)
            .select("*, inventory_item:inventory_items(id, name)")
            .eq("shopping_list_id", str(list_id))
            .order("priority")
            .order("name")
            .execute()
        )
        return response.data

    # =========================================================================
    # Cost Calculations
    # =========================================================================

    async def calculate_totals(
        self,
        tenant: "TenantContext",
        list_id: UUID,
    ) -> dict[str, Any]:
        """Calculate total costs for a shopping list."""
        items = await self.get_items(tenant, list_id)

        estimated_total = Decimal("0")
        actual_total = Decimal("0")
        purchased_count = 0

        for item in items:
            qty = Decimal(str(item.get("quantity", 0)))

            if item.get("estimated_price"):
                estimated_total += qty * Decimal(str(item["estimated_price"]))

            if item.get("actual_price"):
                actual_total += qty * Decimal(str(item["actual_price"]))

            if item.get("is_purchased"):
                purchased_count += 1

        return {
            "total_items": len(items),
            "purchased_items": purchased_count,
            "estimated_total": float(estimated_total),
            "actual_total": float(actual_total),
            "completion_percentage": (
                round(purchased_count / len(items) * 100, 1) if items else 0
            ),
        }

    async def update_totals(
        self,
        tenant: "TenantContext",
        list_id: UUID,
    ) -> dict[str, Any]:
        """Update stored totals on the shopping list."""
        totals = await self.calculate_totals(tenant, list_id)

        return await self.update(
            tenant,
            list_id,
            {
                "total_estimated_cost": totals["estimated_total"],
                "total_actual_cost": totals["actual_total"],
            },
        )


async def get_shopping_lists_repository(
    tenant: "TenantContext | None" = None,
) -> ShoppingListsRepository:
    """
    Get shopping lists repository instance.
    
    If tenant is provided with JWT, uses user-scoped client for RLS.
    Otherwise uses admin client (for background tasks).
    """
    client = None
    if tenant and hasattr(tenant, 'jwt'):
        client = await tenant.get_supabase_client()
    if client is None:
        client = await get_async_supabase_admin()
    return ShoppingListsRepository(client)
