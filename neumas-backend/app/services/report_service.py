from __future__ import annotations

"""
Report service — enqueues report generation and polls status.

Report generation is done in Celery workers (report_tasks.py).
This service is responsible for:
- Deduplicating report requests (same params_hash within REPORT_DEDUP_WINDOW_HOURS)
- Enqueuing the Celery task
- Returning the report status / result URL to the caller
"""

import hashlib
import json
from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.logging import get_logger, log_business_event
from app.db.repositories.reports import ReportsRepository

logger = get_logger(__name__)

_VALID_REPORT_TYPES = frozenset({
    "inventory_snapshot",
    "spend_by_vendor",
    "waste_summary",
    "forecast_accuracy",
    "low_stock_summary",
})


def _hash_params(params: dict) -> str:
    """Deterministic hash of report params for deduplication."""
    serialised = json.dumps(params, sort_keys=True, default=str)
    return hashlib.sha256(serialised.encode()).hexdigest()[:16]


class ReportService:
    """Service for report management."""

    def __init__(self) -> None:
        self._repo = ReportsRepository()

    async def request_report(
        self,
        tenant: TenantContext,
        report_type: str,
        params: dict,
    ) -> dict[str, Any]:
        """
        Request a new report (or return a pending one if params match).

        Returns the report record with status.
        """
        if report_type not in _VALID_REPORT_TYPES:
            raise ValueError(f"Unknown report type: {report_type}")

        params_hash = _hash_params({
            "org_id": str(tenant.org_id),
            "property_id": str(tenant.property_id) if tenant.property_id else None,
            "report_type": report_type,
            **params,
        })

        # Check for existing non-failed report with same params
        existing = await self._repo.find_existing(tenant, params_hash)
        if existing:
            logger.info(
                "Returning existing report",
                report_id=existing["id"],
                params_hash=params_hash,
            )
            return {**existing, "deduplicated": True}

        # Create new report record
        report = await self._repo.create(tenant, report_type, params, params_hash)
        if not report:
            raise RuntimeError("Failed to create report record")

        # Enqueue Celery task (import here to avoid circular dependency)
        try:
            from app.tasks.report_tasks import generate_report_task
            generate_report_task.apply_async(
                args=[report["id"]],
                queue="reports",
            )
            log_business_event(
                "report.exported",
                org_id=str(tenant.org_id),
                property_id=str(tenant.property_id) if tenant.property_id else None,
                user_id=str(tenant.user_id),
                report_id=report["id"],
                report_type=report_type,
            )
        except Exception as e:
            logger.error("Failed to enqueue report task", report_id=report["id"], error=str(e))

        return {**report, "deduplicated": False}

    async def get_report(
        self, tenant: TenantContext, report_id: UUID
    ) -> dict[str, Any] | None:
        return await self._repo.get_by_id(tenant, report_id)

    async def list_reports(
        self,
        tenant: TenantContext,
        report_type: str | None = None,
        status: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        return await self._repo.list(tenant, report_type=report_type, status=status, limit=limit, offset=offset)
