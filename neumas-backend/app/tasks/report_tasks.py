"""
Report Celery tasks — async report generation plus weekly digest delivery.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from uuid import UUID

from app.core.celery_app import celery_app
from app.core.logging import get_logger
from app.db.repositories.email_logs import EmailLogsRepository

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
    3. Update report.result and report.status = 'ready'
    """
    from app.db.repositories.reports import ReportsRepository
    from app.db.supabase_client import get_async_supabase_admin

    logger.info("Generating report", report_id=report_id)

    async def _run() -> dict:
        repo = ReportsRepository()
        client = await get_async_supabase_admin()

        response = await (
            client.table("reports")
            .select("*")
            .eq("id", report_id)
            .single()
            .execute()
        )
        if not response.data:
            logger.error("Report not found", report_id=report_id)
            return {"error": "not_found"}

        report = response.data
        await repo.update_status(UUID(report_id), "processing")

        try:
            result = await _generate(report, client)
            await (
                client.table("reports")
                .update({
                    "status": "ready",
                    "result": result.get("data"),
                    "download_url": result.get("url"),
                })
                .eq("id", report_id)
                .execute()
            )
            return {"status": "ready", "report_id": report_id}
        except Exception as exc:
            await repo.update_status(UUID(report_id), "failed", error=str(exc))
            raise

    try:
        return asyncio.run(_run())
    except Exception as exc:
        logger.error("Report generation failed", report_id=report_id, error=str(exc))
        raise self.retry(exc=exc)


@celery_app.task(
    bind=True,
    name="reports.send_weekly_digest",
    queue="reports",
    max_retries=3,
    default_retry_delay=120,
)
def send_weekly_digest(
    self,
    property_id: str | None = None,
    week_start: str | None = None,
    week_end: str | None = None,
    force: bool = False,
    recipient_email: str | None = None,
) -> dict:
    """
    Send the weekly digest for one property or dispatch across all active properties.

    The task runs hourly and self-selects properties whose local timezone is Monday
    at 08:00, which is the only reliable way to respect per-property timezones from
    a single UTC-based beat schedule.
    """
    from app.db.repositories.properties import get_properties_repository
    from app.services.email_service import EmailService
    from app.services.report_service import (
        ReportService,
        get_last_completed_week_window,
        is_digest_due_for_timezone,
    )

    async def _run() -> dict:
        report_service = ReportService()
        email_service = EmailService()
        email_logs = EmailLogsRepository()
        now = datetime.now(UTC)

        if property_id:
            properties = [await report_service._get_property(UUID(property_id))]  # noqa: SLF001
        else:
            repo = await get_properties_repository()
            properties = await repo.get_all_active(limit=5000)

        total_properties = 0
        total_sent = 0
        skipped = 0
        bounced = 0

        for property_row in properties:
            timezone_name = property_row.get("timezone") or "UTC"
            if not force and not is_digest_due_for_timezone(timezone_name, now=now):
                skipped += 1
                continue

            start_date, end_date = (
                (datetime.fromisoformat(week_start).date(), datetime.fromisoformat(week_end).date())
                if week_start and week_end
                else get_last_completed_week_window(timezone_name, now=now)
            )

            recipients = await report_service.get_property_digest_recipients(
                UUID(property_row["id"]),
                recipient_email=recipient_email,
            )
            if not recipients:
                skipped += 1
                continue

            digest = await report_service.generate_weekly_digest(
                UUID(property_row["id"]),
                start_date,
                end_date,
                force_refresh=force,
            )
            total_properties += 1

            for recipient in recipients:
                recent_bounces = await email_logs.count_recent_bounces(email=recipient["email"])
                if recent_bounces >= 3:
                    bounced += 1
                    logger.warning(
                        "Skipping digest recipient with repeated bounces",
                        email=recipient["email"],
                        bounce_count=recent_bounces,
                    )
                    continue

                await email_service.send_weekly_digest_email(recipient=recipient, digest=digest)
                total_sent += 1

        return {
            "properties_processed": total_properties,
            "emails_sent": total_sent,
            "properties_skipped": skipped,
            "recipients_blocked_for_bounces": bounced,
        }

    try:
        return asyncio.run(_run())
    except Exception as exc:
        logger.error(
            "Weekly digest task failed",
            property_id=property_id,
            recipient_email=recipient_email,
            error=str(exc),
        )
        raise self.retry(exc=exc)


async def _generate(report: dict, client) -> dict:
    report_type = report["report_type"]
    org_id = report["organization_id"]
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
    query = client.table("inventory_items").select("*").eq("organization_id", org_id)
    if property_id:
        query = query.eq("property_id", property_id)
    response = await query.execute()
    return {"data": response.data, "url": None}


async def _gen_spend_by_vendor(client, org_id: str, property_id: str | None, params: dict) -> dict:
    query = client.table("document_line_items").select("raw_total, vendor_id").eq("organization_id", org_id)
    if property_id:
        query = query.eq("property_id", property_id)
    response = await query.execute()
    return {"data": response.data, "url": None}


async def _gen_waste_summary(client, org_id: str, property_id: str | None, params: dict) -> dict:
    query = (
        client.table("inventory_movements")
        .select("quantity_delta, unit, item_id")
        .eq("movement_type", "waste")
        .eq("organization_id", org_id)
    )
    if property_id:
        query = query.eq("property_id", property_id)
    response = await query.execute()
    return {"data": response.data, "url": None}


async def _gen_forecast_accuracy(client, org_id: str, property_id: str | None, params: dict) -> dict:
    query = (
        client.table("predictions")
        .select("predicted_value, actual_value, prediction_date, item_id")
        .eq("organization_id", org_id)
        .not_.is_("actual_value", "null")
    )
    if property_id:
        query = query.eq("property_id", property_id)
    response = await query.execute()
    return {"data": response.data, "url": None}


async def _gen_low_stock_summary(client, org_id: str, property_id: str | None, params: dict) -> dict:
    query = (
        client.table("inventory_items")
        .select("id, name, quantity, par_level, unit")
        .eq("organization_id", org_id)
    )
    if property_id:
        query = query.eq("property_id", property_id)
    response = await query.execute()
    low_stock = [
        item
        for item in (response.data or [])
        if item.get("par_level") and float(item.get("quantity") or 0) <= float(item.get("par_level") or 0)
    ]
    return {"data": low_stock, "url": None}
