from __future__ import annotations

"""
Audit logs repository — write-only, immutable audit trail.
"""

from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)


class AuditLogsRepository:
    """Repository for the audit_logs table (append-only)."""

    async def log_admin(
        self,
        org_id: str,
        user_id: str,
        action: str,
        resource_type: str,
        resource_id: str | None = None,
        property_id: str | None = None,
        actor_role: str = "system",
        metadata: dict | None = None,
    ) -> dict[str, Any] | None:
        """
        Write an audit log entry without requiring a TenantContext.

        Used by background workers (Celery tasks, asyncio.create_task) that
        have no user JWT but still need to emit structured audit events.
        Failures are non-fatal.
        """
        client = await get_async_supabase_admin()
        payload: dict[str, Any] = {
            "organization_id": org_id,
            "actor_id": user_id,
            "actor_role": actor_role,
            "action": action,
            "resource_type": resource_type,
        }
        if resource_id:
            payload["resource_id"] = resource_id
        if property_id:
            payload["property_id"] = property_id
        if metadata:
            payload["metadata"] = metadata
        try:
            resp = await client.table("audit_logs").insert(payload).execute()
            return resp.data[0] if resp.data else None
        except Exception as exc:
            logger.warning(
                "audit log write failed (non-fatal)",
                action=action,
                resource_type=resource_type,
                error=str(exc),
            )
            return None

    async def log(
        self,
        tenant: TenantContext,
        action: str,
        resource_type: str,
        resource_id: str | None = None,
        before: dict | None = None,
        after: dict | None = None,
        metadata: dict | None = None,
    ) -> dict[str, Any] | None:
        """Write a single audit log entry. Failures are non-fatal and logged."""
        client = await get_async_supabase_admin()
        payload: dict[str, Any] = {
            "organization_id": str(tenant.org_id),
            "actor_id": str(tenant.user_id),
            "actor_role": tenant.role,
            "action": action,
            "resource_type": resource_type,
        }
        if resource_id:
            payload["resource_id"] = resource_id
        if tenant.property_id:
            payload["property_id"] = str(tenant.property_id)
        if before:
            payload["before_state"] = before
        if after:
            payload["after_state"] = after
        if metadata:
            payload["metadata"] = metadata
        resp = await client.table("audit_logs").insert(payload).execute()
        return resp.data[0] if resp.data else None

    async def list(
        self,
        tenant: TenantContext,
        resource_type: str | None = None,
        resource_id: str | None = None,
        actor_id: UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        client = await get_async_supabase_admin()
        q = (
            client.table("audit_logs")
            .select("*")
            .eq("organization_id", str(tenant.org_id))
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
        )
        if resource_type:
            q = q.eq("resource_type", resource_type)
        if resource_id:
            q = q.eq("resource_id", resource_id)
        if actor_id:
            q = q.eq("actor_id", str(actor_id))
        resp = await q.execute()
        return resp.data or []
