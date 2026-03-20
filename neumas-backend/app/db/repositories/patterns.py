"""
Patterns repository for consumption pattern data.

Multi-tenant access: All queries filter by tenant.property_id (via inventory items)
to ensure data isolation. This aligns with Supabase RLS policies:

    -- Example RLS policy on consumption_patterns
    CREATE POLICY "users_can_view_own_property_patterns"
    ON consumption_patterns FOR SELECT
    USING (
        item_id IN (
            SELECT id FROM inventory_items
            WHERE property_id IN (
                SELECT p.id FROM properties p
                JOIN users u ON u.org_id = p.org_id
                WHERE u.auth_id = auth.uid()
            )
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


class PatternsRepository:
    """
    Repository for consumption pattern database operations.
    
    All methods require a TenantContext to ensure proper tenant isolation.
    Patterns are linked to items, which are filtered by property_id.
    """

    def __init__(self, client: AsyncClient) -> None:
        self.client = client
        self.table = "consumption_patterns"

    async def get_by_id(
        self,
        tenant: "TenantContext",
        pattern_id: UUID,
    ) -> dict[str, Any] | None:
        """
        Get pattern by ID.
        
        RLS: Filters through item -> property relationship.
        """
        try:
            # Join with inventory item to verify access
            response = await (
                self.client.table(self.table)
                .select("*, inventory_item:inventory_items!inner(id, property_id)")
                .eq("id", str(pattern_id))
                .execute()
            )
            
            if not response.data:
                return None
            
            pattern = response.data[0]
            
            # Verify property access
            if tenant.property_id:
                item_property = pattern.get("inventory_item", {}).get("property_id")
                if item_property != str(tenant.property_id):
                    return None
            
            return pattern
        except Exception as e:
            logger.error(
                "Failed to get pattern",
                pattern_id=str(pattern_id),
                error=str(e),
            )
            return None

    async def get_by_item_id(
        self,
        tenant: "TenantContext",
        item_id: UUID,
        pattern_type: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Get patterns for an inventory item.
        
        RLS: Item must belong to tenant's property.
        """
        query = (
            self.client.table(self.table)
            .select("*, inventory_item:inventory_items!inner(id, property_id)")
            .eq("item_id", str(item_id))
        )

        if pattern_type:
            query = query.eq("pattern_type", pattern_type)

        response = await query.order("confidence", desc=True).execute()
        
        # Filter by property if set
        if tenant.property_id:
            return [
                p for p in response.data
                if p.get("inventory_item", {}).get("property_id") == str(tenant.property_id)
            ]
        
        return response.data

    async def get_active_patterns(
        self,
        tenant: "TenantContext",
        item_id: UUID,
    ) -> list[dict[str, Any]]:
        """
        Get currently valid patterns for an item.
        
        RLS: Item must belong to tenant's property.
        """
        from datetime import UTC, datetime

        now = datetime.now(UTC).isoformat()

        response = await (
            self.client.table(self.table)
            .select("*, inventory_item:inventory_items!inner(id, property_id)")
            .eq("item_id", str(item_id))
            .or_(f"valid_from.is.null,valid_from.lte.{now}")
            .or_(f"valid_until.is.null,valid_until.gte.{now}")
            .order("confidence", desc=True)
            .execute()
        )
        
        # Filter by property if set
        if tenant.property_id:
            return [
                p for p in response.data
                if p.get("inventory_item", {}).get("property_id") == str(tenant.property_id)
            ]
        
        return response.data

    async def create(
        self,
        tenant: "TenantContext",
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Create a new consumption pattern.
        
        RLS: Insert policy requires item to be accessible.
        """
        response = await self.client.table(self.table).insert(data).execute()
        logger.info(
            "Created consumption pattern",
            pattern_id=response.data[0]["id"],
            item_id=data.get("item_id"),
            pattern_type=data.get("pattern_type"),
            user_id=str(tenant.user_id),
        )
        return response.data[0]

    async def update(
        self,
        tenant: "TenantContext",
        pattern_id: UUID,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Update a pattern.
        
        RLS: Update policy ensures user can only update accessible patterns.
        """
        # Verify access first
        pattern = await self.get_by_id(tenant, pattern_id)
        if not pattern:
            raise ValueError("Pattern not found or access denied")
        
        response = await (
            self.client.table(self.table)
            .update(data)
            .eq("id", str(pattern_id))
            .execute()
        )
        logger.info(
            "Updated pattern",
            pattern_id=str(pattern_id),
            user_id=str(tenant.user_id),
        )
        return response.data[0]

    async def upsert_pattern(
        self,
        tenant: "TenantContext",
        item_id: UUID,
        pattern_type: str,
        pattern_data: dict[str, Any],
        confidence: float,
        sample_size: int,
    ) -> dict[str, Any]:
        """
        Upsert a pattern - update if exists, create if not.
        """
        # Check for existing pattern of same type
        existing = await (
            self.client.table(self.table)
            .select("id")
            .eq("item_id", str(item_id))
            .eq("pattern_type", pattern_type)
            .execute()
        )

        data = {
            "item_id": str(item_id),
            "pattern_type": pattern_type,
            "pattern_data": pattern_data,
            "confidence": confidence,
            "sample_size": sample_size,
        }

        if existing.data:
            return await self.update(tenant, UUID(existing.data[0]["id"]), data)
        return await self.create(tenant, data)

    async def delete(
        self,
        tenant: "TenantContext",
        pattern_id: UUID,
    ) -> bool:
        """
        Delete a pattern.
        
        RLS: Delete policy ensures user can only delete accessible patterns.
        """
        # Verify access first
        pattern = await self.get_by_id(tenant, pattern_id)
        if not pattern:
            return False
        
        try:
            await (
                self.client.table(self.table)
                .delete()
                .eq("id", str(pattern_id))
                .execute()
            )
            logger.info(
                "Deleted pattern",
                pattern_id=str(pattern_id),
                user_id=str(tenant.user_id),
            )
            return True
        except Exception as e:
            logger.error("Failed to delete pattern", pattern_id=str(pattern_id), error=str(e))
            return False

    async def get_patterns_for_property(
        self,
        tenant: "TenantContext",
        pattern_type: str | None = None,
        min_confidence: float = 0.0,
    ) -> list[dict[str, Any]]:
        """
        Get all patterns for items in tenant's property.
        
        RLS: Filtered by property_id from tenant context.
        """
        if not tenant.property_id:
            logger.warning("get_patterns_for_property called without property_id")
            return []
        
        # Join with inventory_items to filter by property
        query = (
            self.client.table(self.table)
            .select("*, inventory_item:inventory_items!inner(id, name, property_id)")
            .eq("inventory_items.property_id", str(tenant.property_id))
            .gte("confidence", min_confidence)
        )

        if pattern_type:
            query = query.eq("pattern_type", pattern_type)

        response = await query.order("confidence", desc=True).execute()
        return response.data


async def get_patterns_repository(
    tenant: "TenantContext | None" = None,
) -> PatternsRepository:
    """
    Get patterns repository instance.
    
    If tenant is provided with JWT, uses user-scoped client for RLS.
    Otherwise uses admin client (for background tasks).
    """
    client = None
    if tenant and hasattr(tenant, 'jwt'):
        client = await tenant.get_supabase_client()
    if client is None:
        client = await get_async_supabase_admin()
    return PatternsRepository(client)
