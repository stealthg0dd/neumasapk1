"""
Admin routes — organisation/user/property management, audit log, feature flags,
system health summary, and usage metrics.

All endpoints require role == "admin" (enforced by require_admin_role dependency).
"""

import contextlib
from collections import defaultdict
from datetime import UTC, datetime, timedelta
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


def _safe_float(value: object, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


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
# Performance & health statistics
# ---------------------------------------------------------------------------


@router.get("/stats", summary="Performance and health statistics for admin dashboard")
async def get_stats(tenant: AdminTenant) -> dict:
    """
    Returns:
    - avg_processing_ms_24h: average scan processing time in the last 24 hours
    - success_count_24h / failure_count_24h: scan outcome counts
    - total_low_stock_items: inventory items at or below reorder_point for this org
    """
    require_admin_role(tenant)
    client = await get_async_supabase_admin()
    cutoff = (datetime.now(UTC) - timedelta(hours=24)).isoformat()

    # Collect all property IDs for this org
    props_resp = await (
        client.table("properties")
        .select("id")
        .eq("organization_id", str(tenant.org_id))
        .execute()
    )
    prop_ids = [p["id"] for p in (props_resp.data or [])]

    # Scan metrics in last 24 h
    if prop_ids:
        scans_resp = await (
            client.table("scans")
            .select("status, processing_time_ms")
            .in_("property_id", prop_ids)
            .gte("created_at", cutoff)
            .execute()
        )
        scans = scans_resp.data or []
    else:
        scans = []

    completed = [s for s in scans if s.get("status") == "completed"]
    failed    = [s for s in scans if s.get("status") == "failed"]
    ms_values = [s["processing_time_ms"] for s in completed if s.get("processing_time_ms") is not None]
    avg_ms    = int(sum(ms_values) / len(ms_values)) if ms_values else None

    # Low-stock items for this org
    items_resp = await (
        client.table("inventory_items")
        .select("quantity, reorder_point")
        .eq("organization_id", str(tenant.org_id))
        .eq("is_active", True)
        .execute()
    )
    low_stock_count = sum(
        1 for item in (items_resp.data or [])
        if item.get("quantity") is not None
        and item.get("reorder_point") is not None
        and float(item["quantity"]) <= float(item["reorder_point"])
    )

    return {
        "avg_processing_ms_24h": avg_ms,
        "success_count_24h":     len(completed),
        "failure_count_24h":     len(failed),
        "total_scans_24h":       len(scans),
        "total_low_stock_items": low_stock_count,
        "computed_at":           datetime.now(UTC).isoformat(),
    }


@router.get("/properties/stock-health", summary="Org-wide per-property stock health")
async def get_property_stock_health(tenant: AdminTenant) -> dict:
    """
    Returns a dense org overview for command-center rendering.

    Each property includes low/out-of-stock and predicted-stockout risk counts,
    plus a status bucket where "red" indicates high immediate risk.
    """
    require_admin_role(tenant)
    client = await get_async_supabase_admin()

    props_resp = await (
        client.table("properties")
        .select("id,name")
        .eq("organization_id", str(tenant.org_id))
        .order("name")
        .execute()
    )
    properties = props_resp.data or []
    if not properties:
        return {"properties": [], "red_count": 0, "organization_id": str(tenant.org_id)}

    prop_ids = [p["id"] for p in properties]

    items_resp = await (
        client.table("inventory_items")
        .select("property_id,quantity,reorder_point,par_level")
        .in_("property_id", prop_ids)
        .eq("is_active", True)
        .execute()
    )
    alerts_resp = await (
        client.table("alerts")
        .select("property_id,alert_type,state")
        .in_("property_id", prop_ids)
        .eq("state", "open")
        .execute()
    )

    low_by_property: dict[str, int] = defaultdict(int)
    out_by_property: dict[str, int] = defaultdict(int)
    for row in items_resp.data or []:
        pid = str(row.get("property_id") or "")
        if not pid:
            continue
        qty = _safe_float(row.get("quantity"), 0.0)
        reorder_point = _safe_float(row.get("reorder_point") or row.get("par_level"), 0.0)
        if qty <= 0:
            out_by_property[pid] += 1
        elif reorder_point > 0 and qty <= reorder_point:
            low_by_property[pid] += 1

    predicted_by_property: dict[str, int] = defaultdict(int)
    for row in alerts_resp.data or []:
        if row.get("alert_type") != "predicted_stockout":
            continue
        pid = str(row.get("property_id") or "")
        if pid:
            predicted_by_property[pid] += 1

    payload: list[dict] = []
    red_count = 0
    for prop in properties:
        pid = str(prop["id"])
        low_stock = low_by_property.get(pid, 0)
        out_of_stock = out_by_property.get(pid, 0)
        predicted_stockout = predicted_by_property.get(pid, 0)
        risk_score = (out_of_stock * 3) + (predicted_stockout * 2) + low_stock
        status = "red" if risk_score >= 6 or out_of_stock >= 2 else "amber" if risk_score > 0 else "green"
        if status == "red":
            red_count += 1

        payload.append(
            {
                "property_id": pid,
                "name": prop.get("name") or "Unknown",
                "region": None,
                "country": None,
                "low_stock": low_stock,
                "out_of_stock": out_of_stock,
                "predicted_stockout": predicted_stockout,
                "risk_score": risk_score,
                "status": status,
            }
        )

    return {
        "organization_id": str(tenant.org_id),
        "red_count": red_count,
        "properties": payload,
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
