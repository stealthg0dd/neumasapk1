"""
Alerts routes — alert lifecycle management.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import TenantContext, get_tenant_context
from app.core.logging import get_logger
from app.services.alert_service import AlertService

logger = get_logger(__name__)
router = APIRouter()

_alert_service = AlertService()


class SnoozeRequest(BaseModel):
    snooze_until: str  # ISO 8601 datetime string


@router.get("", summary="List alerts")
@router.get("/", summary="List alerts")
async def list_alerts(
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
    state: str | None = None,
    alert_type: str | None = None,
    severity: str | None = None,
    sort_by: str = "created_at_desc",
    page: int = 1,
    page_size: int = 20,
) -> dict:
    offset = (page - 1) * page_size
    if tenant.property_id and state in (None, "open"):
        try:
            await _alert_service.evaluate_inventory(tenant)
        except Exception as e:
            logger.warning("Failed to refresh alerts before list", error=str(e))
    alerts = await _alert_service.list_alerts(
        tenant,
        state=state,
        alert_type=alert_type,
        severity=severity,
        sort_by=sort_by,
        limit=page_size,
        offset=offset,
    )
    count = await _alert_service.count_open(tenant)
    return {"alerts": alerts, "open_count": count, "page": page, "page_size": page_size}


@router.get("/{alert_id}", summary="Get alert")
async def get_alert(
    alert_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> dict:
    alert = await _alert_service.get_alert(tenant, alert_id)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    return alert


@router.post("/{alert_id}/snooze", summary="Snooze an alert")
async def snooze_alert(
    alert_id: UUID,
    body: SnoozeRequest,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> dict:
    result = await _alert_service.snooze(tenant, alert_id, body.snooze_until)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found or already resolved",
        )
    return result


@router.post("/{alert_id}/resolve", summary="Resolve an alert")
async def resolve_alert(
    alert_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> dict:
    result = await _alert_service.resolve(tenant, alert_id)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found or already resolved",
        )
    return result
