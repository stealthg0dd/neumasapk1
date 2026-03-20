"""
Properties repository for database operations.

Multi-tenant access: All queries filter by tenant.org_id to ensure
data isolation. This aligns with Supabase RLS policies:

    -- Example RLS policy on properties
    CREATE POLICY "users_can_view_org_properties"
    ON properties FOR SELECT
    USING (
        org_id IN (
            SELECT org_id FROM users
            WHERE auth_id = auth.uid()
        )
    );
"""

from typing import TYPE_CHECKING, Any
from uuid import UUID

from supabase._async.client import AsyncClient

from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

if TYPE_CHECKING:
    from app.api.deps import TenantContext

logger = get_logger(__name__)


class PropertiesRepository:
    """
    Repository for property-related database operations.
    
    All methods require a TenantContext to ensure proper tenant isolation.
    Queries filter by org_id which aligns with RLS policies.
    """

    def __init__(self, client: AsyncClient) -> None:
        self.client = client
        self.table = "properties"

    async def get_by_id(
        self,
        tenant: "TenantContext",
        property_id: UUID,
    ) -> dict[str, Any] | None:
        """
        Get property by ID.
        
        RLS: Users can only view properties in their organization.
        """
        try:
            response = await (
                self.client.table(self.table)
                .select("*")
                .eq("id", str(property_id))
                .eq("org_id", str(tenant.org_id))
                .single()
                .execute()
            )
            return response.data
        except Exception as e:
            logger.error(
                "Failed to get property",
                property_id=str(property_id),
                tenant=str(tenant.user_id),
                error=str(e),
            )
            return None

    async def get_by_organization(
        self,
        tenant: "TenantContext",
        active_only: bool = True,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """
        Get all properties for tenant's organization.
        
        RLS: Automatically filtered to user's organization.
        """
        query = (
            self.client.table(self.table)
            .select("*")
            .eq("org_id", str(tenant.org_id))
        )

        if active_only:
            query = query.eq("is_active", True)

        response = await (
            query
            .order("name")
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
        Create a new property for tenant's organization.
        
        RLS: Insert policy requires org_id to match user's org.
        """
        if tenant.role != "admin":
            raise PermissionError("Only admins can create properties")
        
        # Ensure org_id is set from tenant context
        data["org_id"] = str(tenant.org_id)
        
        response = await self.client.table(self.table).insert(data).execute()
        logger.info(
            "Created property",
            property_id=response.data[0]["id"],
            org_id=str(tenant.org_id),
            created_by=str(tenant.user_id),
        )
        return response.data[0]

    async def update(
        self,
        tenant: "TenantContext",
        property_id: UUID,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Update a property.
        
        RLS: Update policy ensures user can only update properties in their org.
        """
        if tenant.role not in ("admin", "staff"):
            raise PermissionError("Insufficient permissions to update properties")
        
        response = await (
            self.client.table(self.table)
            .update(data)
            .eq("id", str(property_id))
            .eq("org_id", str(tenant.org_id))
            .execute()
        )
        logger.info(
            "Updated property",
            property_id=str(property_id),
            updated_by=str(tenant.user_id),
        )
        return response.data[0]

    async def delete(
        self,
        tenant: "TenantContext",
        property_id: UUID,
    ) -> bool:
        """
        Soft delete a property.
        
        RLS: Delete policy ensures user can only delete properties in their org.
        """
        if tenant.role != "admin":
            raise PermissionError("Only admins can delete properties")
        
        try:
            await (
                self.client.table(self.table)
                .update({"is_active": False})
                .eq("id", str(property_id))
                .eq("org_id", str(tenant.org_id))
                .execute()
            )
            logger.info(
                "Deleted property",
                property_id=str(property_id),
                deleted_by=str(tenant.user_id),
            )
            return True
        except Exception as e:
            logger.error(
                "Failed to delete property",
                property_id=str(property_id),
                error=str(e),
            )
            return False

    async def get_with_inventory_summary(
        self,
        tenant: "TenantContext",
        property_id: UUID | None = None,
    ) -> dict[str, Any] | None:
        """
        Get property with inventory summary stats.
        
        Uses tenant's current property_id if not specified.
        """
        target_property_id = property_id or tenant.property_id
        if not target_property_id:
            return None
        
        try:
            # Get property basic info
            property_data = await self.get_by_id(tenant, target_property_id)
            if not property_data:
                return None

            # Get inventory stats
            inventory_response = await (
                self.client.table("inventory_items")
                .select("id, quantity, min_quantity", count="exact")
                .eq("property_id", str(target_property_id))
                .eq("is_active", True)
                .execute()
            )

            items = inventory_response.data
            total_items = len(items)
            low_stock_count = sum(
                1
                for item in items
                if float(item.get("quantity", 0)) <= float(item.get("min_quantity", 0))
            )

            property_data["inventory_summary"] = {
                "total_items": total_items,
                "low_stock_count": low_stock_count,
            }

            return property_data
        except Exception as e:
            logger.error(
                "Failed to get property with inventory",
                property_id=str(target_property_id),
                error=str(e),
            )
            return None

    async def update_settings(
        self,
        tenant: "TenantContext",
        settings: dict[str, Any],
        property_id: UUID | None = None,
    ) -> dict[str, Any]:
        """
        Update property settings (merge with existing).
        
        RLS: Only admins/staff can update settings.
        """
        if tenant.role not in ("admin", "staff"):
            raise PermissionError("Insufficient permissions to update property settings")
        
        target_property_id = property_id or tenant.property_id
        if not target_property_id:
            raise ValueError("property_id required")
        
        prop = await self.get_by_id(tenant, target_property_id)
        if not prop:
            raise ValueError("Property not found or access denied")

        current_settings = prop.get("settings", {})
        merged_settings = {**current_settings, **settings}

        return await self.update(tenant, target_property_id, {"settings": merged_settings})

    async def verify_access(
        self,
        tenant: "TenantContext",
        property_id: UUID,
    ) -> bool:
        """
        Verify that tenant has access to a property.
        
        Checks that property belongs to tenant's organization.
        """
        prop = await self.get_by_id(tenant, property_id)
        return prop is not None


async def get_properties_repository(
    tenant: "TenantContext | None" = None,
) -> PropertiesRepository:
    """
    Get properties repository instance.
    
    If tenant is provided with JWT, uses user-scoped client for RLS.
    Otherwise uses admin client (for background tasks).
    """
    client = None
    if tenant and hasattr(tenant, 'jwt'):
        client = await tenant.get_supabase_client()
    if client is None:
        client = await get_async_supabase_admin()
    return PropertiesRepository(client)
