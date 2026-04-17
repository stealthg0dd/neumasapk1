"""
Alert Celery tasks — periodic inventory evaluation to fire alerts.
"""

from app.core.celery_app import celery_app
from app.core.logging import get_logger

logger = get_logger(__name__)


@celery_app.task(
    bind=True,
    name="tasks.evaluate_inventory_alerts",
    queue="alerts",
    max_retries=3,
    default_retry_delay=60,
)
def evaluate_inventory_alerts(self, org_id: str, property_id: str) -> dict:
    """
    Evaluate inventory for a single property and create any required alerts.

    Called by Celerybeat on a schedule or triggered after a scan completes.
    """
    import asyncio

    from app.api.deps import TenantContext
    from app.services.alert_service import AlertService

    logger.info("Evaluating inventory alerts", org_id=org_id, property_id=property_id)

    tenant = TenantContext(
        user_id=None,  # type: ignore[arg-type]
        org_id=org_id,  # type: ignore[arg-type]
        property_id=property_id,  # type: ignore[arg-type]
        role="system",
        jwt="",
    )

    try:
        svc = AlertService()
        created = asyncio.get_event_loop().run_until_complete(svc.evaluate_inventory(tenant))
        return {"alerts_created": len(created)}
    except Exception as exc:
        logger.error("Alert evaluation failed", exc=str(exc))
        raise self.retry(exc=exc)
