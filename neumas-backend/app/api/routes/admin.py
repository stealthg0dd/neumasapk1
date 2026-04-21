"""
Admin routes — organisation/user/property management, audit log, feature flags,
system health summary, and usage metrics.

All endpoints require role == "admin" (enforced by require_admin_role dependency).
"""

import contextlib
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

from app.api.deps import TenantContext, get_tenant_context
from app.core.logging import get_logger
from app.db.repositories.audit_logs import AuditLogsRepository
from app.db.repositories.email_logs import EmailLogsRepository
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)
router = APIRouter()

_audit_repo = AuditLogsRepository()
_email_logs_repo = EmailLogsRepository()


# ---------------------------------------------------------------------------
# Helper: ensure admin role
# ---------------------------------------------------------------------------


def require_admin_role(tenant: TenantContext) -> TenantContext:
    if tenant.role not in ("admin", "super_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )
    return tenant


AdminTenant = Annotated[TenantContext, Depends(get_tenant_context)]


# ---------------------------------------------------------------------------
# Organisation management
# ---------------------------------------------------------------------------


@router.get("/org", summary="Get current organisation")
async def get_org(tenant: AdminTenant) -> dict:
    require_admin_role(tenant)
    client = await get_async_supabase_admin()
    resp = await (
        client.table("organizations")
        .select("*")
        .eq("id", str(tenant.org_id))
        .single()
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organisation not found")
    return resp.data


@router.get("/users", summary="List users in organisation")
async def list_users(tenant: AdminTenant) -> list[dict]:
    require_admin_role(tenant)
    client = await get_async_supabase_admin()
    resp = await (
        client.table("users")
        .select("id, email, role, full_name, created_at, last_sign_in_at")
        .eq("organization_id", str(tenant.org_id))
        .order("created_at")
        .execute()
    )
    return resp.data or []


@router.get("/properties", summary="List properties in organisation")
async def list_properties(tenant: AdminTenant) -> list[dict]:
    require_admin_role(tenant)
    client = await get_async_supabase_admin()
    resp = await (
        client.table("properties")
        .select("*")
        .eq("organization_id", str(tenant.org_id))
        .order("name")
        .execute()
    )
    return resp.data or []


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------


@router.get("/audit-log", summary="Query audit log")
async def get_audit_log(
    tenant: AdminTenant,
    resource_type: str | None = None,
    resource_id: str | None = None,
    actor_id: UUID | None = None,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    require_admin_role(tenant)
    offset = (page - 1) * page_size
    logs = await _audit_repo.list(
        tenant,
        resource_type=resource_type,
        resource_id=resource_id,
        actor_id=actor_id,
        limit=page_size,
        offset=offset,
    )
    return {"logs": logs, "page": page, "page_size": page_size}


# ---------------------------------------------------------------------------
# Feature flags (simple DB-backed key/value)
# ---------------------------------------------------------------------------


class FeatureFlagUpdate(BaseModel):
    enabled: bool


@router.get("/feature-flags", summary="List feature flags")
async def list_feature_flags(tenant: AdminTenant) -> dict:
    require_admin_role(tenant)
    client = await get_async_supabase_admin()
    resp = await (
        client.table("feature_flags")
        .select("*")
        .or_(f"org_id.eq.{tenant.org_id},org_id.is.null")
        .execute()
    )
    return {"flags": resp.data or []}


@router.patch("/feature-flags/{flag_name}", summary="Update feature flag")
async def update_feature_flag(
    flag_name: str,
    body: FeatureFlagUpdate,
    tenant: AdminTenant,
) -> dict:
    require_admin_role(tenant)
    client = await get_async_supabase_admin()
    resp = await (
        client.table("feature_flags")
        .upsert(
            {
                "name": flag_name,
                "organization_id": str(tenant.org_id),
                "enabled": body.enabled,
            },
            on_conflict="name,org_id",
        )
        .execute()
    )
    await _audit_repo.log(
        tenant,
        action="feature_flag_updated",
        resource_type="feature_flag",
        resource_id=flag_name,
        after={"enabled": body.enabled},
    )
    return resp.data[0] if resp.data else {}


# ---------------------------------------------------------------------------
# System health summary
# ---------------------------------------------------------------------------


@router.get("/system-health", summary="System health summary for admin dashboard")
async def system_health(tenant: AdminTenant) -> dict:
    require_admin_role(tenant)
    from app.db.supabase_client import health_check as db_health

    db_ok = False
    with contextlib.suppress(Exception):
        db_ok = await db_health()

    return {
        "database": "ok" if db_ok else "degraded",
        "organization_id": str(tenant.org_id),
    }


# ---------------------------------------------------------------------------
# Usage metrics
# ---------------------------------------------------------------------------


@router.get("/usage", summary="Usage metrics for org")
async def usage_metrics(tenant: AdminTenant) -> dict:
    require_admin_role(tenant)
    client = await get_async_supabase_admin()

    items_resp = await (
        client.table("inventory_items")
        .select("id", count="exact")
        .eq("organization_id", str(tenant.org_id))
        .execute()
    )
    scans_resp = await (
        client.table("scans")
        .select("id", count="exact")
        .eq("organization_id", str(tenant.org_id))
        .execute()
    )
    alerts_resp = await (
        client.table("alerts")
        .select("id", count="exact")
        .eq("organization_id", str(tenant.org_id))
        .eq("state", "open")
        .execute()
    )

    return {
        "inventory_items": items_resp.count or 0,
        "scans": scans_resp.count or 0,
        "open_alerts": alerts_resp.count or 0,
    }


# ---------------------------------------------------------------------------
# Weekly digest reporting
# ---------------------------------------------------------------------------


class SendDigestRequest(BaseModel):
    property_id: UUID
    recipient_email: EmailStr | None = None
    week_start: str | None = None
    week_end: str | None = None
    force: bool = True


@router.post("/reports/send-digest", summary="Trigger weekly digest send for a property")
async def send_digest(
    body: SendDigestRequest,
    tenant: AdminTenant,
) -> dict:
    require_admin_role(tenant)

    try:
        from app.tasks.report_tasks import send_weekly_digest as send_weekly_digest_task

        task = send_weekly_digest_task.apply_async(
            kwargs={
                "property_id": str(body.property_id),
                "week_start": body.week_start,
                "week_end": body.week_end,
                "force": body.force,
                "recipient_email": body.recipient_email,
            },
            queue="reports",
        )
    except Exception as exc:
        logger.error("Failed to enqueue weekly digest task", error=str(exc), property_id=str(body.property_id))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to enqueue weekly digest")

    return {
        "queued": True,
        "task_id": task.id,
        "property_id": str(body.property_id),
        "recipient_email": body.recipient_email,
    }


@router.get("/reports/email-logs", summary="List weekly digest delivery logs")
async def list_email_logs(
    tenant: AdminTenant,
    property_id: UUID | None = None,
    delivery_status: str | None = None,
    email: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    require_admin_role(tenant)
    logs = await _email_logs_repo.list_logs(
        org_id=str(tenant.org_id),
        property_id=str(property_id) if property_id else None,
        delivery_status=delivery_status,
        email=email,
        template_name="weekly_digest",
        limit=limit,
        offset=offset,
    )
    return {"logs": logs, "count": len(logs), "limit": limit, "offset": offset}
