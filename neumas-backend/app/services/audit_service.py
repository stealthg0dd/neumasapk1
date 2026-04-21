"""
Audit service — structured audit log writes for all state-changing actions.

Every significant operation in the system should call AuditService.log() so
operators have a complete, queryable history of who did what and when.

Captured actions:
  auth:           login, logout, token_refresh
  item:           create, update, delete
  quantity:       adjustment
  document:       approve, reject, update_line_item
  reorder:        generate, dismiss
  export:         generate
  admin:          org_update, user_role_change, feature_flag_change
  scan:           submit, complete, fail
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.repositories.audit_logs import AuditLogsRepository

logger = get_logger(__name__)


class AuditService:
    """Thin service wrapper around the audit_logs repository."""

    def __init__(self) -> None:
        self._repo = AuditLogsRepository()

    async def log(
        self,
        tenant: TenantContext,
        action: str,
        resource_type: str,
        resource_id: str | UUID | None = None,
        before_state: dict[str, Any] | None = None,
        after_state: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
        ip_address: str | None = None,
    ) -> None:
        """
        Write an audit log entry (non-fatal — failures are logged, not raised).

        Args:
            tenant: Current tenant context.
            action: Dot-separated action string e.g. "document.approve".
            resource_type: Table or domain name e.g. "documents".
            resource_id: Primary key of the affected record.
            before_state: Snapshot of state before the change.
            after_state: Snapshot of state after the change.
            metadata: Free-form extra context.
            ip_address: Client IP, if available.
        """
        try:
            await self._repo.log(
                tenant=tenant,
                action=action,
                resource_type=resource_type,
                resource_id=str(resource_id) if resource_id else None,
                before=before_state,
                after=after_state,
                metadata=metadata,
            )
        except Exception:  # noqa: BLE001
            logger.warning(
                "audit log write failed (non-fatal)",
                action=action,
                resource_type=resource_type,
            )

    async def list_entries(
        self,
        tenant: TenantContext,
        resource_type: str | None = None,
        resource_id: str | None = None,
        actor_id: UUID | None = None,
        action_prefix: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int]:
        """
        Query audit log entries for the tenant.

        Returns (entries, total_count).
        """
        entries = await self._repo.list(
            tenant=tenant,
            resource_type=resource_type,
            resource_id=resource_id,
            actor_id=actor_id,
            limit=limit,
            offset=offset,
        )

        # Count query (best-effort — fall back to len if it fails)
        try:
            from app.db.supabase_client import get_async_supabase_admin
            client = await get_async_supabase_admin()
            q = (
                client.table("audit_logs")
                .select("id", count="exact")
                .eq("organization_id", str(tenant.org_id))
            )
            if resource_type:
                q = q.eq("resource_type", resource_type)
            if resource_id:
                q = q.eq("resource_id", resource_id)
            if actor_id:
                q = q.eq("actor_id", str(actor_id))
            if action_prefix:
                q = q.ilike("action", f"{action_prefix}%")
            count_resp = await q.execute()
            total = count_resp.count or len(entries)
        except Exception:
            total = len(entries)

        return entries, total
