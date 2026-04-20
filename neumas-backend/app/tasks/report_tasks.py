"""
Report Celery tasks — async report generation.
"""

from uuid import UUID

from app.core.celery_app import celery_app
from app.core.logging import get_logger

logger = get_logger(__name__)


@celery_app.task(
    bind=True,
    name="tasks.generate_report",
    queue="reports",
    max_retries=2,
    default_retry_delay=30,
)
def generate_report_task(self, report_id: str) -> dict:
    """
    Generate a report asynchronously.

    1. Fetch report record from DB
    2. Run the appropriate report generator
    3. Upload result to Supabase Storage
    4. Update report.result_url and report.status = 'ready'
    """
    import asyncio

    from app.db.repositories.reports import ReportsRepository
    from app.db.supabase_client import get_async_supabase_admin

    logger.info("Generating report", report_id=report_id)

    async def _run() -> dict:
        repo = ReportsRepository()
        client = await get_async_supabase_admin()

        # Fetch report record (no tenant check needed — this is a system task)
        resp = await (
            client.table("reports")
            .select("*")
            .eq("id", report_id)
            .single()
            .execute()
        )
        if not resp.data:
            logger.error("Report not found", report_id=report_id)
            return {"error": "not_found"}

        report = resp.data
        await repo.update_status(UUID(report_id), "processing")

        try:
            result = await _generate(report, client)
            await repo.update_status(UUID(report_id), "ready", result_url=result.get("url"))
            return {"status": "ready", "report_id": report_id}
        except Exception as exc:
            await repo.update_status(UUID(report_id), "failed", error=str(exc))
            raise

    try:
        return asyncio.get_event_loop().run_until_complete(_run())
    except Exception as exc:
        logger.error("Report generation failed", report_id=report_id, error=str(exc))
        raise self.retry(exc=exc)


async def _generate(report: dict, client) -> dict:
    """
    Dispatch to the correct report generator based on report_type.

    Each generator returns {"url": "<supabase-storage-url>", "data": {...}}.
    Currently produces a placeholder JSON result; extend with real SQL queries.
    """
    report_type = report["report_type"]
    org_id = report["org_id"]
    property_id = report.get("property_id")
    params = report.get("params") or {}

    generators = {
        "inventory_snapshot": _gen_inventory_snapshot,
        "spend_by_vendor": _gen_spend_by_vendor,
        "waste_summary": _gen_waste_summary,
        "forecast_accuracy": _gen_forecast_accuracy,
        "low_stock_summary": _gen_low_stock_summary,
    }

    generator = generators.get(report_type)
    if not generator:
        raise ValueError(f"Unknown report type: {report_type}")

    return await generator(client, org_id, property_id, params)


async def _gen_inventory_snapshot(client, org_id: str, property_id: str | None, params: dict) -> dict:
    q = client.table("inventory_items").select("*").eq("org_id", org_id)
    if property_id:
        q = q.eq("property_id", property_id)
    resp = await q.execute()
    return {"data": resp.data, "url": None}


async def _gen_spend_by_vendor(client, org_id: str, property_id: str | None, params: dict) -> dict:
    q = (
        client.table("document_line_items")
        .select("raw_total, documents(vendor_id, vendors(name))")
        .eq("documents.org_id", org_id)
    )
    resp = await q.execute()
    return {"data": resp.data, "url": None}


async def _gen_waste_summary(client, org_id: str, property_id: str | None, params: dict) -> dict:
    q = (
        client.table("inventory_movements")
        .select("quantity_delta, unit, item_id, inventory_items(name)")
        .eq("movement_type", "waste")
        .eq("inventory_items.org_id", org_id)
    )
    resp = await q.execute()
    return {"data": resp.data, "url": None}


async def _gen_forecast_accuracy(client, org_id: str, property_id: str | None, params: dict) -> dict:
    q = (
        client.table("predictions")
        .select("predicted_value, actual_value, prediction_date, item_id")
        .eq("org_id", org_id)
        .not_.is_("actual_value", "null")
    )
    resp = await q.execute()
    return {"data": resp.data, "url": None}


async def _gen_low_stock_summary(client, org_id: str, property_id: str | None, params: dict) -> dict:
    (
        client.table("inventory_items")
        .select("id, name, quantity, par_level, unit")
        .eq("org_id", org_id)
        .filter("quantity", "lte", client.table("inventory_items").select("par_level"))
    )
    # Simple approach: fetch all and filter in Python
    all_resp = await (
        client.table("inventory_items")
        .select("id, name, quantity, par_level, unit")
        .eq("org_id", org_id)
        .execute()
    )
    low_stock = [
        item for item in (all_resp.data or [])
        if item.get("par_level") and float(item["quantity"] or 0) <= float(item["par_level"] or 0)
    ]
    return {"data": low_stock, "url": None}
