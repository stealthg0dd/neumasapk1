"""
vendor_analytics.py — Vendor Intelligence Engine endpoints.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.deps import TenantContext, get_tenant_context
from app.services.vendor_analytics_service import VendorAnalyticsService

router = APIRouter()
_service = VendorAnalyticsService()

@router.get("/spend", summary="Total spend per vendor")
async def vendor_spend(
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
    vendor_id: UUID | None = None,
    days: int = 90,
):
    return await _service.get_vendor_spend(tenant, vendor_id, days)

@router.get("/trends", summary="Spend trend per vendor")
async def vendor_trends(
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
    vendor_id: UUID,
    days: int = 90,
):
    return await _service.get_vendor_trends(tenant, vendor_id, days)

@router.get("/price-intel", summary="Price intelligence for items per vendor")
async def vendor_price_intel(
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
    vendor_id: UUID,
    item_id: UUID | None = None,
    days: int = 90,
):
    return await _service.get_vendor_price_intel(tenant, vendor_id, item_id, days)

@router.get("/compare", summary="Vendor comparison for an item")
async def vendor_compare(
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
    item_id: UUID,
    days: int = 90,
):
    return await _service.get_vendor_comparison(tenant, item_id, days)

@router.get("/alerts", summary="Vendor/price anomaly alerts")
async def vendor_alerts(
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
    days: int = 30,
):
    return await _service.get_vendor_alerts(tenant, days)
