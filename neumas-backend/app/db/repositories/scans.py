"""
Scans repository for scan session data.

Multi-tenant access: All queries filter by tenant.property_id to ensure
data isolation. This aligns with Supabase RLS policies:

    -- Example RLS policy on scans
    CREATE POLICY "users_can_view_own_property_scans"
    ON scans FOR SELECT
    USING (
        property_id IN (
            SELECT p.id FROM properties p
            JOIN users u ON u.org_id = p.org_id
            WHERE u.auth_id = auth.uid()
        )
    );
"""

from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin
from supabase._async.client import AsyncClient

if TYPE_CHECKING:
    from app.api.deps import TenantContext

logger = get_logger(__name__)


class ScansRepository:
    """
    Repository for scan database operations.

    All methods require a TenantContext to ensure proper tenant isolation.
    Queries filter by property_id which aligns with RLS policies.
    """

    def __init__(self, client: AsyncClient) -> None:
        self.client = client
        self.table = "scans"

    async def get_by_id(
        self,
        tenant: "TenantContext",
        scan_id: UUID,
    ) -> dict[str, Any] | None:
        """
        Get scan by ID.

        RLS: Users can only view scans for properties in their organization.
        """
        query = (
            self.client.table(self.table)
            .select("*")
            .eq("id", str(scan_id))
        )

        # Filter by property if set
        if tenant.property_id:
            query = query.eq("property_id", str(tenant.property_id))

        try:
            response = await query.single().execute()
            return response.data
        except Exception as e:
            logger.error(
                "Failed to get scan",
                scan_id=str(scan_id),
                tenant=str(tenant.user_id),
                error=str(e),
            )
            return None

    async def get_by_property(
        self,
        tenant: "TenantContext",
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """
        Get scans for tenant's property.

        RLS: Automatically filtered to user's accessible properties.
        """
        if not tenant.property_id:
            logger.warning("get_by_property called without property_id")
            return []

        query = (
            self.client.table(self.table)
            .select("*")
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
        Create a new scan for tenant's property.

        RLS: Insert policy requires property_id to be accessible.
        """
        if not tenant.property_id:
            raise ValueError("property_id required to create scan")

        if not getattr(tenant, "org_id", None):
            raise ValueError("User not associated with an organization.")

        # Ensure tenant fields are set
        data["property_id"] = str(tenant.property_id)
        org_id = str(tenant.org_id)
        # Support both legacy and canonical schema variants.
        data["organization_id"] = org_id
        data["org_id"] = org_id
        # Strip None values -- PostgREST rejects columns absent from schema cache
        data = {k: v for k, v in data.items() if v is not None}

        try:
            response = await self.client.table(self.table).insert(data).execute()
        except Exception as e:
            err_text = str(e)
            if "org_id" in err_text and "schema cache" in err_text:
                retry_data = {k: v for k, v in data.items() if k != "org_id"}
                response = await self.client.table(self.table).insert(retry_data).execute()
            elif "organization_id" in err_text and "schema cache" in err_text:
                retry_data = {k: v for k, v in data.items() if k != "organization_id"}
                response = await self.client.table(self.table).insert(retry_data).execute()
            else:
                raise
        if not response.data:
            raise RuntimeError(
                f"Scan insert returned no data for scan_id={data.get('id')}. "
                "Check PostgREST RLS INSERT policy on the scans table."
            )
        logger.info(
            "Created scan",
            scan_id=response.data[0]["id"],
            property_id=str(tenant.property_id),
            scan_type=data.get("scan_type"),
            user_id=str(tenant.user_id),
        )
        return response.data[0]

    async def update(
        self,
        tenant: "TenantContext",
        scan_id: UUID,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Update a scan.

        RLS: Update policy ensures user can only update accessible scans.
        """
        query = (
            self.client.table(self.table)
            .update(data)
            .eq("id", str(scan_id))
        )

        if tenant.property_id:
            query = query.eq("property_id", str(tenant.property_id))

        response = await query.execute()
        logger.info(
            "Updated scan",
            scan_id=str(scan_id),
            user_id=str(tenant.user_id),
        )
        # PostgREST may return empty data if the row wasn't found (RLS filtered it)
        if not response.data:
            logger.warning("Scan update returned no data", scan_id=str(scan_id))
            return {"id": str(scan_id)}
        return response.data[0]

    async def update_status(
        self,
        tenant: "TenantContext",
        scan_id: UUID,
        status: str,
        error_message: str | None = None,
    ) -> dict[str, Any]:
        """Update scan status."""
        from datetime import UTC

        data: dict[str, Any] = {"status": status}

        if status == "processing":
            data["started_at"] = datetime.now(UTC).isoformat()
        elif status in ("completed", "failed"):
            data["completed_at"] = datetime.now(UTC).isoformat()

        if error_message:
            data["error_message"] = error_message

        return await self.update(tenant, scan_id, data)

    async def save_results(
        self,
        tenant: "TenantContext",
        scan_id: UUID,
        raw_results: dict[str, Any],
        processed_results: dict[str, Any],
        items_detected: int,
        confidence_score: float,
        processing_time_ms: int,
    ) -> dict[str, Any]:
        """Save scan processing results."""
        return await self.update(
            tenant,
            scan_id,
            {
                "raw_results": raw_results,
                "processed_results": processed_results,
                "items_detected": items_detected,
                "confidence_score": confidence_score,
                "processing_time_ms": processing_time_ms,
                "status": "completed",
                "completed_at": datetime.now().isoformat(),
            },
        )

    async def get_recent_scans(
        self,
        tenant: "TenantContext",
        days: int = 7,
    ) -> list[dict[str, Any]]:
        """Get recent completed scans for tenant's property."""
        from datetime import UTC, timedelta

        if not tenant.property_id:
            return []

        cutoff = datetime.now(UTC) - timedelta(days=days)

        response = await (
            self.client.table(self.table)
            .select("*")
            .eq("property_id", str(tenant.property_id))
            .eq("status", "completed")
            .gte("created_at", cutoff.isoformat())
            .order("created_at", desc=True)
            .execute()
        )
        return response.data

    async def get_scan_history(
        self,
        tenant: "TenantContext",
        item_id: UUID | None = None,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
    ) -> list[dict[str, Any]]:
        """Get scan history for tenant's property with optional filters."""
        if not tenant.property_id:
            return []

        query = (
            self.client.table(self.table)
            .select("*")
            .eq("property_id", str(tenant.property_id))
            .eq("status", "completed")
        )

        if from_date:
            query = query.gte("created_at", from_date.isoformat())

        if to_date:
            query = query.lte("created_at", to_date.isoformat())

        response = await query.order("created_at", desc=True).execute()

        # If item_id specified, filter results that detected this item
        if item_id:
            filtered = []
            for scan in response.data:
                processed = scan.get("processed_results", {})
                detected_items = processed.get("items", [])
                if any(str(item.get("id")) == str(item_id) for item in detected_items):
                    filtered.append(scan)
            return filtered

        return response.data

    async def delete(
        self,
        tenant: "TenantContext",
        scan_id: UUID,
    ) -> bool:
        """
        Delete a scan.

        RLS: Delete policy ensures user can only delete accessible scans.
        """
        try:
            query = (
                self.client.table(self.table)
                .delete()
                .eq("id", str(scan_id))
            )

            if tenant.property_id:
                query = query.eq("property_id", str(tenant.property_id))

            await query.execute()
            logger.info(
                "Deleted scan",
                scan_id=str(scan_id),
                user_id=str(tenant.user_id),
            )
            return True
        except Exception as e:
            logger.error("Failed to delete scan", scan_id=str(scan_id), error=str(e))
            return False

    async def get_pending_scans(
        self,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """
        Get pending scans for processing (used by workers).

        Note: This is an admin/server-side operation, uses admin client.
        """
        response = await (
            self.client.table(self.table)
            .select("*")
            .eq("status", "pending")
            .order("created_at")
            .limit(limit)
            .execute()
        )
        return response.data


async def get_scans_repository(
    tenant: "TenantContext | None" = None,
) -> ScansRepository:
    """
    Get scans repository instance.

    If tenant is provided with JWT, uses user-scoped client for RLS.
    Otherwise uses admin client (for background tasks/workers).
    """
    client = None
    if tenant and hasattr(tenant, 'jwt'):
        client = await tenant.get_supabase_client()
    if client is None:
        client = await get_async_supabase_admin()
    return ScansRepository(client)
