"""
Users repository for database operations.

Multi-tenant access: All queries filter by tenant.org_id to ensure
data isolation. This aligns with Supabase RLS policies:

    -- Example RLS policy on users
    CREATE POLICY "users_can_view_org_users"
    ON users FOR SELECT
    USING (
        org_id IN (
            SELECT org_id FROM users
            WHERE auth_id = auth.uid()
        )
    );
"""

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin
from supabase._async.client import AsyncClient

if TYPE_CHECKING:
    from app.api.deps import TenantContext

logger = get_logger(__name__)


class UsersRepository:
    """
    Repository for user-related database operations.

    All methods require a TenantContext to ensure proper tenant isolation.
    Queries filter by org_id which aligns with RLS policies.
    """

    def __init__(self, client: AsyncClient) -> None:
        self.client = client
        self.table = "users"

    async def get_by_id(
        self,
        tenant: "TenantContext",
        user_id: UUID | None = None,
    ) -> dict[str, Any] | None:
        """
        Get user by ID.

        If user_id not provided, returns current tenant's user.
        RLS: Users can only view users in their organization.
        """
        target_user_id = user_id or tenant.user_id

        try:
            response = await (
                self.client.table(self.table)
                .select("*")
                .eq("id", str(target_user_id))
                .eq("organization_id", str(tenant.org_id))
                .single()
                .execute()
            )
            return response.data
        except Exception as e:
            logger.error(
                "Failed to get user",
                user_id=str(target_user_id),
                tenant=str(tenant.user_id),
                error=str(e),
            )
            return None

    async def get_by_auth_id(
        self,
        tenant: "TenantContext",
        auth_id: UUID,
    ) -> dict[str, Any] | None:
        """
        Get user by Supabase auth ID.

        RLS: Filtered to tenant's organization.
        """
        try:
            response = await (
                self.client.table(self.table)
                .select("*")
                .eq("auth_id", str(auth_id))
                .eq("organization_id", str(tenant.org_id))
                .single()
                .execute()
            )
            return response.data
        except Exception as e:
            logger.error(
                "Failed to get user by auth_id",
                auth_id=str(auth_id),
                error=str(e),
            )
            return None

    async def get_by_email(
        self,
        tenant: "TenantContext",
        email: str,
    ) -> dict[str, Any] | None:
        """
        Get user by email within tenant's organization.

        RLS: Filtered to tenant's organization.
        """
        try:
            response = await (
                self.client.table(self.table)
                .select("*")
                .eq("email", email.lower())
                .eq("organization_id", str(tenant.org_id))
                .single()
                .execute()
            )
            return response.data
        except Exception as e:
            logger.error("Failed to get user by email", email=email, error=str(e))
            return None

    async def get_by_organization(
        self,
        tenant: "TenantContext",
        active_only: bool = True,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """
        Get all users for tenant's organization.

        RLS: Automatically filtered to user's organization.
        """
        query = (
            self.client.table(self.table)
            .select("*")
            .eq("organization_id", str(tenant.org_id))
        )

        if active_only:
            query = query.eq("is_active", True)

        response = await (
            query
            .order("full_name")
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
        Create a new user in tenant's organization.

        RLS: Insert policy requires matching org_id.
        """
        if tenant.role != "admin":
            raise PermissionError("Only admins can create users")

        # Normalize email and ensure org_id
        if "email" in data:
            data["email"] = data["email"].lower()
        data["organization_id"] = str(tenant.org_id)

        response = await self.client.table(self.table).insert(data).execute()
        logger.info(
            "Created user",
            user_id=response.data[0]["id"],
            org_id=str(tenant.org_id),
            created_by=str(tenant.user_id),
        )
        return response.data[0]

    async def update(
        self,
        tenant: "TenantContext",
        user_id: UUID,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Update a user in tenant's organization.

        RLS: Update policy ensures user can only update users in their org.
        Users can update themselves; admins can update anyone in org.
        """
        # Users can update themselves, admins can update anyone in org
        is_self = user_id == tenant.user_id
        if not is_self and tenant.role != "admin":
            raise PermissionError("Can only update own profile or requires admin")

        if "email" in data:
            data["email"] = data["email"].lower()

        response = await (
            self.client.table(self.table)
            .update(data)
            .eq("id", str(user_id))
            .eq("organization_id", str(tenant.org_id))
            .execute()
        )
        logger.info(
            "Updated user",
            user_id=str(user_id),
            updated_by=str(tenant.user_id),
        )
        return response.data[0]

    async def delete(
        self,
        tenant: "TenantContext",
        user_id: UUID,
    ) -> bool:
        """
        Soft delete a user.

        RLS: Only admins can delete users in their org.
        """
        if tenant.role != "admin":
            raise PermissionError("Only admins can delete users")

        # Prevent self-deletion
        if user_id == tenant.user_id:
            raise ValueError("Cannot delete yourself")

        try:
            await (
                self.client.table(self.table)
                .update({"is_active": False})
                .eq("id", str(user_id))
                .eq("organization_id", str(tenant.org_id))
                .execute()
            )
            logger.info(
                "Deleted user",
                user_id=str(user_id),
                deleted_by=str(tenant.user_id),
            )
            return True
        except Exception as e:
            logger.error("Failed to delete user", user_id=str(user_id), error=str(e))
            return False

    async def update_last_login(
        self,
        tenant: "TenantContext",
        user_id: UUID | None = None,
    ) -> None:
        """
        Update user's last login timestamp.

        If user_id not provided, updates current tenant's user.
        """
        target_user_id = user_id or tenant.user_id

        try:
            await (
                self.client.table(self.table)
                .update({"last_login_at": datetime.now(UTC).isoformat()})
                .eq("id", str(target_user_id))
                .eq("organization_id", str(tenant.org_id))
                .execute()
            )
        except Exception as e:
            logger.warning(
                "Failed to update last login",
                user_id=str(target_user_id),
                error=str(e),
            )

    async def get_with_organization(
        self,
        tenant: "TenantContext",
        user_id: UUID | None = None,
    ) -> dict[str, Any] | None:
        """
        Get user with organization details.

        If user_id not provided, returns current tenant's user.
        """
        target_user_id = user_id or tenant.user_id

        try:
            response = await (
                self.client.table(self.table)
                .select("*, organization:organizations(*)")
                .eq("id", str(target_user_id))
                .eq("organization_id", str(tenant.org_id))
                .single()
                .execute()
            )
            return response.data
        except Exception as e:
            logger.error(
                "Failed to get user with organization",
                user_id=str(target_user_id),
                error=str(e),
            )
            return None

    async def update_preferences(
        self,
        tenant: "TenantContext",
        preferences: dict[str, Any],
        user_id: UUID | None = None,
    ) -> dict[str, Any]:
        """
        Update user preferences (merge with existing).

        Users can only update their own preferences.
        """
        target_user_id = user_id or tenant.user_id

        # Users can only update their own preferences
        if target_user_id != tenant.user_id and tenant.role != "admin":
            raise PermissionError("Can only update own preferences")

        user = await self.get_by_id(tenant, target_user_id)
        if not user:
            raise ValueError("User not found or access denied")

        current_prefs = user.get("preferences", {})
        merged_prefs = {**current_prefs, **preferences}

        return await self.update(tenant, target_user_id, {"preferences": merged_prefs})

    async def has_permission(
        self,
        tenant: "TenantContext",
        permission: str,
        user_id: UUID | None = None,
    ) -> bool:
        """
        Check if user has a specific permission.

        If user_id not provided, checks current tenant's user.
        """
        target_user_id = user_id or tenant.user_id
        user = await self.get_by_id(tenant, target_user_id)
        if not user:
            return False

        # Admin role has all permissions
        if user.get("role") == "admin":
            return True

        permissions = user.get("permissions", {})
        return permissions.get(permission, False)


async def get_users_repository(
    tenant: "TenantContext | None" = None,
) -> UsersRepository:
    """
    Get users repository instance.

    If tenant is provided with JWT, uses user-scoped client for RLS.
    Otherwise uses admin client (for background tasks).
    """
    client = None
    if tenant and hasattr(tenant, 'jwt'):
        client = await tenant.get_supabase_client()
    if client is None:
        client = await get_async_supabase_admin()
    return UsersRepository(client)
