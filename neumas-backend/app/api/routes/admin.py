"""
Admin routes — organisation/user/property management, audit log, feature flags,
system health summary, and usage metrics.

All endpoints require role == "admin" (enforced by require_admin_role dependency).
"""

import contextlib
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import TenantContext, get_tenant_context
from app.core.logging import get_logger
from app.db.repositories.audit_logs import AuditLogsRepository
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)
router = APIRouter()

_audit_repo = AuditLogsRepository()


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
        .eq("org_id", str(tenant.org_id))
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
        .eq("org_id", str(tenant.org_id))
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
                "org_id": str(tenant.org_id),
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
        "org_id": str(tenant.org_id),
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
        .eq("org_id", str(tenant.org_id))
        .execute()
    )
    scans_resp = await (
        client.table("scans")
        .select("id", count="exact")
        .eq("org_id", str(tenant.org_id))
        .execute()
    )
    alerts_resp = await (
        client.table("alerts")
        .select("id", count="exact")
        .eq("org_id", str(tenant.org_id))
        .eq("state", "open")
        .execute()
    )

    return {
        "inventory_items": items_resp.count or 0,
        "scans": scans_resp.count or 0,
        "open_alerts": alerts_resp.count or 0,
    }

