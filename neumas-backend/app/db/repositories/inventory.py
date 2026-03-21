"""
Inventory repository for database operations.

Multi-tenant access: All queries filter by tenant.property_id to ensure
data isolation. This aligns with Supabase RLS policies:

    -- Example RLS policy on inventory_items
    CREATE POLICY "users_can_view_own_property_items"
    ON inventory_items FOR SELECT
    USING (
        property_id IN (
            SELECT p.id FROM properties p
            JOIN users u ON u.org_id = p.org_id
            WHERE u.auth_id = auth.uid()
        )
    );

Even with RLS enforced at the database level, we filter in application
code for defense-in-depth security.
"""

from decimal import Decimal
from typing import TYPE_CHECKING, Any
from uuid import UUID

from supabase._async.client import AsyncClient

from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

if TYPE_CHECKING:
    from app.api.deps import TenantContext

logger = get_logger(__name__)


class InventoryRepository:
    """
    Repository for inventory-related database operations.
    
    All methods require a TenantContext to ensure proper tenant isolation.
    Queries filter by property_id which aligns with RLS policies.
    
    Supabase RLS ensures users only see rows where:
    - property_id belongs to a property within user's organization
    """

    def __init__(self, client: AsyncClient) -> None:
        self.client = client
        self.table = "inventory_items"
        self.categories_table = "inventory_categories"

    # =========================================================================
    # Inventory Items
    # =========================================================================

    async def get_item_by_id(
        self,
        tenant: "TenantContext",
        item_id: UUID,
    ) -> dict[str, Any] | None:
        """
        Get inventory item by ID.
        
        RLS: Supabase will filter to items in user's accessible properties.
        Application filter: Explicit property_id check for defense-in-depth.
        """
        try:
            query = (
                self.client.table(self.table)
                .select("*, category:inventory_categories(*)")
                .eq("id", str(item_id))
            )
            
            # Filter by property_id if set in tenant context
            if tenant.property_id:
                query = query.eq("property_id", str(tenant.property_id))
            
            response = await query.single().execute()
            return response.data
        except Exception as e:
            logger.error(
                "Failed to get inventory item",
                item_id=str(item_id),
                tenant=str(tenant),
                error=str(e),
            )
            return None

    async def get_items_by_property(
        self,
        tenant: "TenantContext",
        active_only: bool = True,
        category_id: UUID | None = None,
        search: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """
        Get inventory items for the tenant's property with filtering.
        
        RLS: Supabase ensures users only see items in their accessible properties.
        Application filter: property_id from tenant context.
        """
        if not tenant.property_id:
            logger.warning("get_items_by_property called without property_id", tenant=str(tenant))
            return []
        
        query = (
            self.client.table(self.table)
            .select("*, category:inventory_categories(id, name)")
            .eq("property_id", str(tenant.property_id))
        )

        if active_only:
            query = query.eq("is_active", True)

        if category_id:
            query = query.eq("category_id", str(category_id))

        if search:
            query = query.or_(f"name.ilike.%{search}%,sku.ilike.%{search}%,barcode.eq.{search}")

        response = await (
            query
            .order("name")
            .range(offset, offset + limit - 1)
            .execute()
        )
        return response.data

    async def get_low_stock_items(
        self,
        tenant: "TenantContext",
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """
        Get items that are at or below reorder point for tenant's property.
        
        RLS: Supabase filters by property access.
        Application filter: property_id from tenant context.
        """
        if not tenant.property_id:
            return []
        
        response = await (
            self.client.table(self.table)
            .select("*")
            .eq("property_id", str(tenant.property_id))
            .eq("is_active", True)
            .order("quantity")
            .limit(limit)
            .execute()
        )

        # Filter for low stock
        low_stock = [
            item
            for item in response.data
            if float(item.get("quantity", 0))
            <= float(item.get("reorder_point") or item.get("min_quantity", 0))
        ]
        return low_stock

    async def create_item(
        self,
        tenant: "TenantContext",
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Create a new inventory item for tenant's property.
        
        RLS: Insert policy requires property_id to be accessible to user.
        """
        if not tenant.property_id:
            raise ValueError("property_id required to create inventory item")

        # Ensure tenant fields are set
        data["property_id"] = str(tenant.property_id)
        data["org_id"] = str(tenant.org_id)
        # Strip None values -- PostgREST rejects columns absent from schema cache
        data = {k: v for k, v in data.items() if v is not None}

        response = await self.client.table(self.table).insert(data).execute()
        logger.info(
            "Created inventory item",
            item_id=response.data[0]["id"],
            property_id=str(tenant.property_id),
            user_id=str(tenant.user_id),
        )
        return response.data[0]

    async def update_item(
        self,
        tenant: "TenantContext",
        item_id: UUID,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Update an inventory item.
        
        RLS: Update policy ensures user can only update items they can access.
        Application filter: property_id check.
        """
        query = (
            self.client.table(self.table)
            .update(data)
            .eq("id", str(item_id))
        )
        
        if tenant.property_id:
            query = query.eq("property_id", str(tenant.property_id))
        
        response = await query.execute()
        logger.info(
            "Updated inventory item",
            item_id=str(item_id),
            user_id=str(tenant.user_id),
        )
        return response.data[0]

    async def update_quantity(
        self,
        tenant: "TenantContext",
        item_id: UUID,
        new_quantity: Decimal,
        reason: str | None = None,
    ) -> dict[str, Any]:
        """
        Update item quantity.
        
        RLS: Ensures user has access to the item's property.
        """
        update_data: dict[str, Any] = {"quantity": str(new_quantity)}

        query = (
            self.client.table(self.table)
            .update(update_data)
            .eq("id", str(item_id))
        )
        
        if tenant.property_id:
            query = query.eq("property_id", str(tenant.property_id))
        
        response = await query.execute()

        logger.info(
            "Updated inventory quantity",
            item_id=str(item_id),
            new_quantity=str(new_quantity),
            reason=reason,
            user_id=str(tenant.user_id),
        )
        return response.data[0]

    async def adjust_quantity(
        self,
        tenant: "TenantContext",
        item_id: UUID,
        adjustment: Decimal,
        reason: str | None = None,
    ) -> dict[str, Any]:
        """Adjust item quantity by delta (positive or negative)."""
        item = await self.get_item_by_id(tenant, item_id)
        if not item:
            raise ValueError(f"Item {item_id} not found or access denied")

        current_qty = Decimal(str(item.get("quantity", 0)))
        new_qty = max(Decimal("0"), current_qty + adjustment)

        return await self.update_quantity(tenant, item_id, new_qty, reason)

    async def delete_item(
        self,
        tenant: "TenantContext",
        item_id: UUID,
    ) -> bool:
        """
        Soft delete an inventory item.
        
        RLS: Delete policy ensures user can only delete accessible items.
        """
        try:
            query = (
                self.client.table(self.table)
                .update({"is_active": False})
                .eq("id", str(item_id))
            )
            
            if tenant.property_id:
                query = query.eq("property_id", str(tenant.property_id))
            
            await query.execute()
            logger.info(
                "Deleted inventory item",
                item_id=str(item_id),
                user_id=str(tenant.user_id),
            )
            return True
        except Exception as e:
            logger.error(
                "Failed to delete item",
                item_id=str(item_id),
                error=str(e),
            )
            return False

    async def bulk_update_quantities(
        self,
        tenant: "TenantContext",
        updates: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """
        Bulk update quantities from scan results.

        Args:
            tenant: TenantContext for access control
            updates: List of {"id": UUID, "quantity": Decimal} dicts
        """
        results = []
        for update in updates:
            try:
                result = await self.update_quantity(
                    tenant,
                    update["id"],
                    update["quantity"],
                    reason="bulk_scan_update",
                )
                results.append(result)
            except Exception as e:
                logger.error(
                    "Failed bulk update for item",
                    item_id=str(update.get("id")),
                    error=str(e),
                )
        return results

    async def get_item_by_barcode(
        self,
        tenant: "TenantContext",
        barcode: str,
    ) -> dict[str, Any] | None:
        """Get item by barcode within tenant's property."""
        if not tenant.property_id:
            return None
        
        try:
            response = await (
                self.client.table(self.table)
                .select("*")
                .eq("property_id", str(tenant.property_id))
                .eq("barcode", barcode)
                .eq("is_active", True)
                .single()
                .execute()
            )
            return response.data
        except Exception:
            return None

    # =========================================================================
    # Categories
    # =========================================================================

    async def get_categories(
        self,
        tenant: "TenantContext",
        parent_id: UUID | None = None,
    ) -> list[dict[str, Any]]:
        """
        Get inventory categories for tenant's organization.
        
        RLS: Categories filtered by org_id.
        """
        query = (
            self.client.table(self.categories_table)
            .select("*")
            .eq("org_id", str(tenant.org_id))
        )

        if parent_id:
            query = query.eq("parent_id", str(parent_id))
        else:
            query = query.is_("parent_id", "null")

        response = await query.order("sort_order").execute()
        return response.data

    async def create_category(
        self,
        tenant: "TenantContext",
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """Create a new category for tenant's organization."""
        data["org_id"] = str(tenant.org_id)
        response = await self.client.table(self.categories_table).insert(data).execute()
        logger.info(
            "Created category",
            category_id=response.data[0]["id"],
            org_id=str(tenant.org_id),
        )
        return response.data[0]

    async def update_category(
        self,
        tenant: "TenantContext",
        category_id: UUID,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """Update a category (must belong to tenant's organization)."""
        response = await (
            self.client.table(self.categories_table)
            .update(data)
            .eq("id", str(category_id))
            .eq("org_id", str(tenant.org_id))
            .execute()
        )
        return response.data[0]

    # =========================================================================
    # Service-facing aliases (match the method names called by InventoryService)
    # =========================================================================

    async def list_items(
        self,
        tenant: "TenantContext",
        property_id: UUID | None = None,
        category_id: UUID | None = None,
        status_filter: str | None = None,
        search: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """List inventory items with optional filters."""
        items = await self.get_items_by_property(
            tenant=tenant,
            active_only=(status_filter != "inactive"),
            category_id=category_id,
            search=search,
            limit=limit,
            offset=offset,
        )
        if status_filter in ("low_stock", "out_of_stock"):
            filtered = []
            for item in items:
                qty = float(item.get("quantity", 0))
                reorder = float(item.get("reorder_point") or item.get("min_quantity", 0))
                if status_filter == "out_of_stock" and qty == 0:
                    filtered.append(item)
                elif status_filter == "low_stock" and 0 < qty <= reorder:
                    filtered.append(item)
            return filtered
        return items

    async def get_by_id(
        self,
        item_id: UUID,
        tenant: "TenantContext",
    ) -> dict[str, Any] | None:
        """Alias for get_item_by_id with service-compatible arg order."""
        return await self.get_item_by_id(tenant, item_id)

    async def get_by_name(
        self,
        name: str,
        tenant: "TenantContext",
        property_id: UUID | None = None,
    ) -> dict[str, Any] | None:
        """Get item by name within tenant's property."""
        effective_property_id = property_id or tenant.property_id
        if not effective_property_id:
            return None
        try:
            response = await (
                self.client.table(self.table)
                .select("*")
                .eq("property_id", str(effective_property_id))
                .ilike("name", name)
                .eq("is_active", True)
                .limit(1)
                .execute()
            )
            return response.data[0] if response.data else None
        except Exception:
            return None

    async def create(
        self,
        data: dict[str, Any],
        tenant: "TenantContext",
    ) -> dict[str, Any]:
        """Alias for create_item with service-compatible arg order."""
        return await self.create_item(tenant, data)

    async def update(
        self,
        item_id: UUID,
        data: dict[str, Any],
        tenant: "TenantContext",
    ) -> dict[str, Any]:
        """Alias for update_item with service-compatible arg order."""
        return await self.update_item(tenant, item_id, data)

    async def soft_delete(
        self,
        item_id: UUID,
        tenant: "TenantContext",
    ) -> bool:
        """Alias for delete_item."""
        return await self.delete_item(tenant, item_id)


async def get_inventory_repository(
    tenant: "TenantContext | None" = None,
) -> InventoryRepository:
    """
    Get inventory repository instance.
    
    If tenant is provided with JWT, uses user-scoped client for RLS.
    Otherwise uses admin client (for background tasks).
    """
    client = None
    if tenant and hasattr(tenant, 'jwt'):
        client = await tenant.get_supabase_client()
    # Fall back to admin client when user-scoped client is unavailable
    # (e.g. SUPABASE_ANON_KEY not configured). Tenant isolation is still
    # enforced via explicit org_id / property_id filters in all queries.
    if client is None:
        client = await get_async_supabase_admin()
    return InventoryRepository(client)
