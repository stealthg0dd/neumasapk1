"""
Reports routes — report request and status polling.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import TenantContext, get_tenant_context
from app.core.logging import get_logger
from app.services.report_service import ReportService

logger = get_logger(__name__)
router = APIRouter()

_report_service = ReportService()


class ReportRequest(BaseModel):
    report_type: str
    params: dict = {}


@router.post("/", summary="Request a report", status_code=status.HTTP_202_ACCEPTED)
async def request_report(
    body: ReportRequest,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> dict:
    """Enqueue a new report or return a pending/completed one."""
    try:
        report = await _report_service.request_report(tenant, body.report_type, body.params)
        return report
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/", summary="List reports")
async def list_reports(
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
    report_type: str | None = None,
    status: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    offset = (page - 1) * page_size
    reports = await _report_service.list_reports(
        tenant, report_type=report_type, status=status, limit=page_size, offset=offset
    )
    return {"reports": reports, "page": page, "page_size": page_size}


@router.get("/{report_id}", summary="Get report status and result")
async def get_report(
    report_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> dict:
    report = await _report_service.get_report(tenant, report_id)
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return report
