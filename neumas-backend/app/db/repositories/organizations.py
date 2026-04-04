"""
Organizations repository for database operations.

Multi-tenant access: All queries filter by tenant.org_id to ensure
data isolation. This aligns with Supabase RLS policies:

    -- Example RLS policy on organizations
    CREATE POLICY "users_can_view_own_org"
    ON organizations FOR SELECT
    USING (
        id IN (
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


class OrganizationsRepository:
    """
    Repository for organization-related database operations.

    All methods require a TenantContext to ensure proper tenant isolation.
    Queries filter by org_id which aligns with RLS policies.
    """

    def __init__(self, client: AsyncClient) -> None:
        self.client = client
        self.table = "organizations"

    async def get_by_id(
        self,
        tenant: "TenantContext",
        org_id: UUID | None = None,
    ) -> dict[str, Any] | None:
        """
        Get organization by ID.

        If org_id is not provided, uses tenant's org_id.
        RLS: Users can only view their own organization.
        """
        target_org_id = org_id or tenant.org_id

        # Verify tenant has access to this org
        if target_org_id != tenant.org_id and tenant.role != "admin":
            logger.warning(
                "Unauthorized org access attempt",
                user_id=str(tenant.user_id),
                requested_org=str(target_org_id),
                user_org=str(tenant.org_id),
            )
            return None

        try:
            response = await (
                self.client.table(self.table)
                .select("*")
                .eq("id", str(target_org_id))
                .single()
                .execute()
            )
            return response.data
        except Exception as e:
            logger.error("Failed to get organization", org_id=str(target_org_id), error=str(e))
            return None

    async def get_by_slug(
        self,
        tenant: "TenantContext",
        slug: str,
    ) -> dict[str, Any] | None:
        """
        Get organization by slug.

        RLS: Only returns org if user has access.
        """
        try:
            response = await (
                self.client.table(self.table)
                .select("*")
                .eq("slug", slug)
                .eq("id", str(tenant.org_id))  # Only allow access to own org
                .single()
                .execute()
            )
            return response.data
        except Exception as e:
            logger.error("Failed to get organization by slug", slug=slug, error=str(e))
            return None

    async def create(
        self,
        tenant: "TenantContext",
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Create a new organization.

        Note: Typically only super-admins can create orgs.
        """
        if tenant.role != "admin":
            raise PermissionError("Only admins can create organizations")

        response = await (
            self.client.table(self.table).insert(data).execute()
        )
        logger.info(
            "Created organization",
            org_id=response.data[0]["id"],
            created_by=str(tenant.user_id),
        )
        return response.data[0]

    async def update(
        self,
        tenant: "TenantContext",
        data: dict[str, Any],
        org_id: UUID | None = None,
    ) -> dict[str, Any]:
        """
        Update an organization.

        RLS: Only admins can update their organization.
        """
        if tenant.role != "admin":
            raise PermissionError("Only admins can update organizations")

        target_org_id = org_id or tenant.org_id
        if target_org_id != tenant.org_id:
            raise PermissionError("Cannot update other organizations")

        response = await (
            self.client.table(self.table)
            .update(data)
            .eq("id", str(target_org_id))
            .execute()
        )
        logger.info(
            "Updated organization",
            org_id=str(target_org_id),
            updated_by=str(tenant.user_id),
        )
        return response.data[0]

    async def delete(
        self,
        tenant: "TenantContext",
        org_id: UUID | None = None,
    ) -> bool:
        """
        Delete an organization (soft delete by deactivating).

        RLS: Only admins can delete their organization.
        """
        if tenant.role != "admin":
            raise PermissionError("Only admins can delete organizations")

        target_org_id = org_id or tenant.org_id
        if target_org_id != tenant.org_id:
            raise PermissionError("Cannot delete other organizations")

        try:
            await (
                self.client.table(self.table)
                .update({"subscription_status": "cancelled"})
                .eq("id", str(target_org_id))
                .execute()
            )
            logger.info(
                "Deleted organization",
                org_id=str(target_org_id),
                deleted_by=str(tenant.user_id),
            )
            return True
        except Exception as e:
            logger.error("Failed to delete organization", org_id=str(target_org_id), error=str(e))
            return False

    async def list_all(
        self,
        tenant: "TenantContext",
        limit: int = 100,
        offset: int = 0,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        List organizations for tenant.

        RLS: Regular users only see their own organization.
        Super-admins could see all (if implemented with service role).
        """
        # Regular users can only see their own org
        query = (
            self.client.table(self.table)
            .select("*")
            .eq("id", str(tenant.org_id))
        )

        if status:
            query = query.eq("subscription_status", status)

        response = await (
            query
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        return response.data

    async def get_with_properties(
        self,
        tenant: "TenantContext",
        org_id: UUID | None = None,
    ) -> dict[str, Any] | None:
        """
        Get organization with its properties.

        RLS: Users can only view their organization with properties.
        """
        target_org_id = org_id or tenant.org_id
        if target_org_id != tenant.org_id:
            return None

        try:
            response = await (
                self.client.table(self.table)
                .select("*, properties(*)")
                .eq("id", str(target_org_id))
                .single()
                .execute()
            )
            return response.data
        except Exception as e:
            logger.error(
                "Failed to get organization with properties",
                org_id=str(target_org_id),
                error=str(e),
            )
            return None

    async def update_settings(
        self,
        tenant: "TenantContext",
        settings: dict[str, Any],
        org_id: UUID | None = None,
    ) -> dict[str, Any]:
        """
        Update organization settings (merge with existing).

        RLS: Only admins can update settings.
        """
        if tenant.role != "admin":
            raise PermissionError("Only admins can update organization settings")

        org = await self.get_by_id(tenant, org_id)
        if not org:
            raise ValueError("Organization not found or access denied")

        current_settings = org.get("settings", {})
        merged_settings = {**current_settings, **settings}

        return await self.update(tenant, {"settings": merged_settings}, org_id)


async def get_organizations_repository(
    tenant: "TenantContext | None" = None,
) -> OrganizationsRepository:
    """
    Get organizations repository instance.

    If tenant is provided with JWT, uses user-scoped client for RLS.
    Otherwise uses admin client (for background tasks).
    """
    client = None
    if tenant and hasattr(tenant, 'jwt'):
        client = await tenant.get_supabase_client()
    if client is None:
        client = await get_async_supabase_admin()
    return OrganizationsRepository(client)
