"""
Predictions routes.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.api.deps import TenantContext, get_tenant_context, require_property
from app.core.celery_app import celery_app
from app.core.logging import get_logger
from app.db.repositories.predictions import get_predictions_repository

logger = get_logger(__name__)
router = APIRouter()

# Urgency ordering for sorting (lower = more urgent)
_URGENCY_ORDER = {"critical": 0, "urgent": 1, "soon": 2, "later": 3}


class ForecastRequest(BaseModel):
    property_id: UUID | None = None
    forecast_days: int = 7


class ForecastQueuedResponse(BaseModel):
    job_id: str
    status: str = "queued"
    message: str = "Forecast job queued"


@router.post(
    "/forecast",
    response_model=ForecastQueuedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger demand forecast",
    description="Enqueue pattern recomputation then stockout prediction for a property.",
)
async def forecast(
    body: ForecastRequest,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> ForecastQueuedResponse:
    """
    Enqueues two Celery tasks in order:
    1. agents.recompute_patterns_for_property
    2. agents.recompute_predictions_for_property
    Returns the task ID of the prediction task.
    """
    property_id = str(body.property_id or tenant.property_id)

    # Step 1 — recompute consumption patterns
    celery_app.send_task(
        "agents.recompute_patterns_for_property",
        args=[property_id],
        queue="neumas.predictions",
    )

    # Step 2 — recompute stockout predictions
    pred_task = celery_app.send_task(
        "agents.recompute_predictions_for_property",
        args=[property_id],
        queue="neumas.predictions",
    )

    logger.info(
        "Forecast queued",
        property_id=property_id,
        task_id=pred_task.id,
        user_id=str(tenant.user_id),
    )
    return ForecastQueuedResponse(job_id=pred_task.id)


@router.get(
    "/",
    summary="List predictions",
    description="Get stockout predictions for the current property, sorted by urgency.",
)
async def list_predictions(
    tenant: TenantContext = require_property(),
    urgency: Annotated[str | None, Query(description="Filter by urgency: critical, urgent, soon, later")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[dict]:
    """
    Returns stockout predictions sorted by urgency (critical first) then
    predicted runout date.  Pass ?urgency=critical to restrict to one bucket.
    """
    try:
        repo = await get_predictions_repository(tenant)
        rows = await repo.get_by_property(tenant, prediction_type="stockout", limit=limit)
    except Exception as e:
        logger.error("Failed to list predictions", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve predictions",
        )

    # Optional urgency filter (stored in stockout_risk_level column)
    if urgency:
        rows = [r for r in rows if r.get("stockout_risk_level") == urgency]

    # Sort: critical → urgent → soon → later, then by prediction_date asc
    rows.sort(key=lambda r: (
        _URGENCY_ORDER.get(r.get("stockout_risk_level", "later"), 99),
        r.get("prediction_date", ""),
    ))

    return rows
