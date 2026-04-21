from __future__ import annotations

"""
Report service — report exports plus weekly digest generation/caching.
"""

import hashlib
import json
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.api.deps import TenantContext
from app.core.config import settings
from app.core.logging import get_logger, log_business_event
from app.db.repositories.properties import get_properties_repository
from app.db.repositories.reports import ReportsRepository
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)

_VALID_REPORT_TYPES = frozenset({
    "inventory_snapshot",
    "spend_by_vendor",
    "waste_summary",
    "forecast_accuracy",
    "low_stock_summary",
})
_WEEKLY_DIGEST_REPORT_TYPE = "weekly_digest_email"
_WEEKLY_DIGEST_CACHE_HOURS = 24


def _hash_params(params: dict[str, Any]) -> str:
    serialised = json.dumps(params, sort_keys=True, default=str)
    return hashlib.sha256(serialised.encode()).hexdigest()[:16]


def _to_decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value or 0))
    except Exception:
        return Decimal("0")


def _coerce_date(value: date | datetime | str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)


def _zoneinfo(timezone_name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(timezone_name or "UTC")
    except ZoneInfoNotFoundError:
        logger.warning("Unknown timezone on property/user preferences", timezone=timezone_name)
        return ZoneInfo("UTC")


def resolve_digest_preferences(user_row: dict[str, Any], property_timezone: str | None) -> dict[str, Any]:
    preferences = user_row.get("preferences") or {}
    digest_enabled = bool(preferences.get("email_digest_enabled", True))
    timezone_name = preferences.get("timezone") or property_timezone or "UTC"
    return {
        "email_digest_enabled": digest_enabled,
        "timezone": timezone_name,
    }


def is_digest_due_for_timezone(
    timezone_name: str,
    *,
    now: datetime | None = None,
) -> bool:
    current = now or datetime.now(UTC)
    local_now = current.astimezone(_zoneinfo(timezone_name))
    return local_now.weekday() == 0 and local_now.hour == 8


def get_last_completed_week_window(
    timezone_name: str,
    *,
    now: datetime | None = None,
) -> tuple[date, date]:
    current = now or datetime.now(UTC)
    local_now = current.astimezone(_zoneinfo(timezone_name))
    local_today = local_now.date()
    end_date = local_today - timedelta(days=1)
    start_date = end_date - timedelta(days=6)
    return start_date, end_date


class ReportService:
    """Service for report exports and weekly digest generation."""

    def __init__(self) -> None:
        self._repo = ReportsRepository()

    async def request_report(
        self,
        tenant: TenantContext,
        report_type: str,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        if report_type not in _VALID_REPORT_TYPES:
            raise ValueError(f"Unknown report type: {report_type}")

        params_hash = _hash_params({
            "organization_id": str(tenant.org_id),
            "property_id": str(tenant.property_id) if tenant.property_id else None,
            "report_type": report_type,
            **params,
        })

        existing = await self._repo.find_existing(tenant, params_hash)
        if existing:
            logger.info("Returning existing report", report_id=existing["id"], params_hash=params_hash)
            return {**existing, "deduplicated": True}

        report = await self._repo.create(tenant, report_type, params, params_hash)
        if not report:
            raise RuntimeError("Failed to create report record")

        try:
            from app.tasks.report_tasks import generate_report_task

            generate_report_task.apply_async(args=[report["id"]], queue="reports")
            log_business_event(
                "report.exported",
                org_id=str(tenant.org_id),
                property_id=str(tenant.property_id) if tenant.property_id else None,
                user_id=str(tenant.user_id),
                report_id=report["id"],
                report_type=report_type,
            )
        except Exception as exc:
            logger.error("Failed to enqueue report task", report_id=report["id"], error=str(exc))

        return {**report, "deduplicated": False}

    async def get_report(self, tenant: TenantContext, report_id: UUID) -> dict[str, Any] | None:
        return await self._repo.get_by_id(tenant, report_id)

    async def list_reports(
        self,
        tenant: TenantContext,
        report_type: str | None = None,
        status: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        return await self._repo.list(
            tenant,
            report_type=report_type,
            status=status,
            limit=limit,
            offset=offset,
        )

    async def get_property_digest_recipients(
        self,
        property_id: UUID,
        *,
        recipient_email: str | None = None,
    ) -> list[dict[str, Any]]:
        property_row = await self._get_property(property_id)
        client = await get_async_supabase_admin()
        users_resp = await (
            client.table("users")
            .select("*")
            .eq("organization_id", property_row["organization_id"])
            .eq("is_active", True)
            .execute()
        )
        users = users_resp.data or []
        if recipient_email:
            users = [user for user in users if str(user.get("email", "")).lower() == recipient_email.lower()]

        recipients: list[dict[str, Any]] = []
        active_properties = await (
            client.table("properties")
            .select("id")
            .eq("organization_id", property_row["organization_id"])
            .eq("is_active", True)
            .execute()
        )
        org_property_count = len(active_properties.data or [])

        for user in users:
            prefs = resolve_digest_preferences(user, property_row.get("timezone"))
            if not prefs["email_digest_enabled"]:
                continue

            raw_default_property = user.get("default_property_id") or user.get("default_property")
            include_user = False
            if raw_default_property:
                include_user = str(raw_default_property) == str(property_id)
            elif org_property_count == 1:
                include_user = True

            if not include_user:
                continue

            recipients.append({
                "id": str(user["id"]),
                "email": user["email"].lower(),
                "full_name": user.get("full_name"),
                "timezone": prefs["timezone"],
                "preferences": user.get("preferences") or {},
            })
        return recipients

    async def generate_weekly_digest(
        self,
        property_id: UUID,
        start_date: date | datetime | str,
        end_date: date | datetime | str,
        *,
        force_refresh: bool = False,
    ) -> dict[str, Any]:
        start_day = _coerce_date(start_date)
        end_day = _coerce_date(end_date)
        property_row = await self._get_property(property_id)

        cache_params = {
            "property_id": str(property_id),
            "start_date": start_day.isoformat(),
            "end_date": end_day.isoformat(),
            "report_type": _WEEKLY_DIGEST_REPORT_TYPE,
        }
        params_hash = _hash_params(cache_params)

        if not force_refresh:
            cached = await self._get_cached_weekly_digest(property_row, params_hash)
            if cached:
                return cached

        digest = await self._build_weekly_digest(property_row, start_day, end_day)
        await self._store_weekly_digest_cache(property_row, cache_params, params_hash, digest)
        return digest

    async def _get_property(self, property_id: UUID) -> dict[str, Any]:
        repo = await get_properties_repository()
        rows = await repo.get_all_active(limit=5000)
        for row in rows:
            if str(row["id"]) == str(property_id):
                property_row = dict(row)
                property_row.setdefault("timezone", "UTC")
                property_row.setdefault("currency", "USD")
                return property_row

        client = await get_async_supabase_admin()
        response = await (
            client.table("properties")
            .select("*")
            .eq("id", str(property_id))
            .single()
            .execute()
        )
        if not response.data:
            raise ValueError("Property not found")
        property_row = response.data
        property_row.setdefault("timezone", "UTC")
        property_row.setdefault("currency", "USD")
        return property_row

    async def _get_cached_weekly_digest(
        self,
        property_row: dict[str, Any],
        params_hash: str,
    ) -> dict[str, Any] | None:
        client = await get_async_supabase_admin()
        response = await (
            client.table("reports")
            .select("id, result, created_at")
            .eq("organization_id", property_row["organization_id"])
            .eq("property_id", str(property_row["id"]))
            .eq("report_type", _WEEKLY_DIGEST_REPORT_TYPE)
            .eq("params_hash", params_hash)
            .eq("status", "ready")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if not response.data:
            return None

        cached = response.data[0]
        created_at = datetime.fromisoformat(str(cached["created_at"]).replace("Z", "+00:00"))
        if created_at < datetime.now(UTC) - timedelta(hours=_WEEKLY_DIGEST_CACHE_HOURS):
            return None
        return cached.get("result")

    async def _store_weekly_digest_cache(
        self,
        property_row: dict[str, Any],
        params: dict[str, Any],
        params_hash: str,
        digest: dict[str, Any],
    ) -> None:
        client = await get_async_supabase_admin()
        payload = {
            "organization_id": property_row["organization_id"],
            "property_id": str(property_row["id"]),
            "report_type": _WEEKLY_DIGEST_REPORT_TYPE,
            "status": "ready",
            "params": params,
            "params_hash": params_hash,
            "result": digest,
        }
        await client.table("reports").insert(payload).execute()

    async def _build_weekly_digest(
        self,
        property_row: dict[str, Any],
        start_day: date,
        end_day: date,
    ) -> dict[str, Any]:
        client = await get_async_supabase_admin()
        start_dt = datetime.combine(start_day, time.min, tzinfo=UTC).isoformat()
        end_dt = datetime.combine(end_day, time.max, tzinfo=UTC).isoformat()
        prediction_end_dt = datetime.combine(end_day + timedelta(days=7), time.max, tzinfo=UTC).isoformat()

        inventory_resp = await (
            client.table("inventory_items")
            .select("id, name, quantity, unit, par_level, min_quantity, reorder_point, cost_per_unit")
            .eq("property_id", str(property_row["id"]))
            .eq("is_active", True)
            .execute()
        )
        document_resp = await (
            client.table("documents")
            .select("id, total_amount, raw_vendor_name, vendor_id, created_at, status")
            .eq("property_id", str(property_row["id"]))
            .gte("created_at", start_dt)
            .lte("created_at", end_dt)
            .neq("status", "rejected")
            .execute()
        )
        vendors_resp = await (
            client.table("vendors")
            .select("id, name")
            .eq("organization_id", property_row["organization_id"])
            .execute()
        )
        line_items_resp = await (
            client.table("document_line_items")
            .select("raw_total, raw_name, normalized_name, canonical_item_id, created_at")
            .eq("property_id", str(property_row["id"]))
            .gte("created_at", start_dt)
            .lte("created_at", end_dt)
            .execute()
        )
        canonical_items_resp = await (
            client.table("canonical_items")
            .select("id, canonical_name, category")
            .eq("organization_id", property_row["organization_id"])
            .execute()
        )
        movements_resp = await (
            client.table("inventory_movements")
            .select("item_id, movement_type, quantity_delta, quantity_after, notes, created_at")
            .eq("property_id", str(property_row["id"]))
            .gte("created_at", start_dt)
            .lte("created_at", end_dt)
            .execute()
        )
        predictions_resp = await (
            client.table("predictions")
            .select("item_id, prediction_date, predicted_value, confidence, days_until_stockout, stockout_risk_level")
            .eq("property_id", str(property_row["id"]))
            .eq("prediction_type", "stockout")
            .gte("prediction_date", start_dt)
            .lte("prediction_date", prediction_end_dt)
            .execute()
        )
        alerts_resp = await (
            client.table("alerts")
            .select("alert_type, title, body, created_at, item_id")
            .eq("property_id", str(property_row["id"]))
            .gte("created_at", start_dt)
            .lte("created_at", end_dt)
            .in_("alert_type", ["expiry", "out_of_stock", "stockout", "low_stock"])
            .execute()
        )

        inventory_items = inventory_resp.data or []
        inventory_map = {str(item["id"]): item for item in inventory_items}
        vendor_map = {str(vendor["id"]): vendor["name"] for vendor in (vendors_resp.data or [])}
        canonical_map = {str(item["id"]): item for item in (canonical_items_resp.data or [])}
        documents = document_resp.data or []
        line_items = line_items_resp.data or []
        movements = movements_resp.data or []
        predictions = predictions_resp.data or []
        alerts = alerts_resp.data or []

        total_spend = float(sum(_to_decimal(doc.get("total_amount")) for doc in documents))
        vendor_totals: dict[str, dict[str, Any]] = {}
        for doc in documents:
            vendor_name = (
                vendor_map.get(str(doc.get("vendor_id")))
                or doc.get("raw_vendor_name")
                or "Unknown vendor"
            )
            bucket = vendor_totals.setdefault(vendor_name, {"name": vendor_name, "spend": Decimal("0"), "documents": 0})
            bucket["spend"] += _to_decimal(doc.get("total_amount"))
            bucket["documents"] += 1

        category_totals: dict[str, dict[str, Any]] = {}
        for item in line_items:
            canonical = canonical_map.get(str(item.get("canonical_item_id")))
            category_name = canonical.get("category") if canonical else None
            if not category_name:
                category_name = "Uncategorized"
            bucket = category_totals.setdefault(category_name, {"name": category_name, "spend": Decimal("0"), "items": 0})
            bucket["spend"] += _to_decimal(item.get("raw_total"))
            bucket["items"] += 1

        stocked_out: dict[str, dict[str, Any]] = {}
        for movement in movements:
            if movement.get("movement_type") == "waste":
                continue
            if _to_decimal(movement.get("quantity_after")) != Decimal("0"):
                continue
            item_id = str(movement.get("item_id") or "")
            item_name = inventory_map.get(item_id, {}).get("name", "Unknown item")
            stocked_out[item_name] = {
                "name": item_name,
                "label": "Stockout",
                "detail": "Quantity hit 0 during the reporting window.",
            }
        for alert in alerts:
            if alert.get("alert_type") not in {"out_of_stock", "stockout"}:
                continue
            item_id = str(alert.get("item_id") or "")
            item_name = inventory_map.get(item_id, {}).get("name", "Unknown item")
            stocked_out.setdefault(
                item_name,
                {
                    "name": item_name,
                    "label": "Stockout",
                    "detail": alert.get("body") or "Quantity hit 0 during the reporting window.",
                },
            )

        predicted_stockouts: list[dict[str, Any]] = []
        for prediction in predictions:
            days_until = prediction.get("days_until_stockout")
            if days_until is not None and int(days_until) > 7:
                continue
            risk_level = str(prediction.get("stockout_risk_level") or "warning").lower()
            if days_until is None and risk_level not in {"high", "critical"}:
                continue
            item_id = str(prediction.get("item_id") or "")
            item_name = inventory_map.get(item_id, {}).get("name", "Unknown item")
            predicted_stockouts.append({
                "name": item_name,
                "label": risk_level,
                "detail": (
                    f"Predicted stockout in {days_until} day(s). Confidence {float(prediction.get('confidence') or 0):.0%}."
                    if days_until is not None
                    else f"Risk level {risk_level}. Confidence {float(prediction.get('confidence') or 0):.0%}."
                ),
            })
        predicted_stockouts.sort(key=lambda item: item["detail"])

        waste_incidents: list[dict[str, Any]] = []
        waste_value = Decimal("0")
        for movement in movements:
            if movement.get("movement_type") != "waste":
                continue
            item_id = str(movement.get("item_id") or "")
            inventory_item = inventory_map.get(item_id, {})
            qty = abs(_to_decimal(movement.get("quantity_delta")))
            unit_cost = _to_decimal(inventory_item.get("cost_per_unit"))
            estimated_value = qty * unit_cost
            waste_value += estimated_value
            waste_incidents.append({
                "name": inventory_item.get("name", "Unknown item"),
                "estimated_value": float(estimated_value),
                "detail": f"{qty:.1f} {inventory_item.get('unit', 'units')} discarded.",
            })

        suggested_reorders: list[dict[str, Any]] = []
        seen_reorders: set[str] = set()
        for item in inventory_items:
            qty = _to_decimal(item.get("quantity"))
            threshold = max(
                _to_decimal(item.get("reorder_point")),
                _to_decimal(item.get("min_quantity")),
                _to_decimal(item.get("par_level")),
            )
            if threshold <= 0 or qty > threshold:
                continue
            recommended_qty = max(threshold * 2 - qty, Decimal("1"))
            item_name = str(item.get("name") or "Unknown item")
            suggested_reorders.append({
                "name": item_name,
                "unit": item.get("unit") or "unit",
                "recommended_qty": float(recommended_qty),
                "reason": f"Current quantity {qty:.1f} is at or below threshold {threshold:.1f}.",
            })
            seen_reorders.add(item_name)

        for item in predicted_stockouts:
            if item["name"] in seen_reorders:
                continue
            inventory_item = next((row for row in inventory_items if row.get("name") == item["name"]), None)
            if not inventory_item:
                continue
            threshold = max(
                _to_decimal(inventory_item.get("reorder_point")),
                _to_decimal(inventory_item.get("min_quantity")),
                _to_decimal(inventory_item.get("par_level")),
                Decimal("1"),
            )
            suggested_reorders.append({
                "name": item["name"],
                "unit": inventory_item.get("unit") or "unit",
                "recommended_qty": float(threshold),
                "reason": "Forecast indicates a likely stockout within the next 7 days.",
            })

        potential_savings = waste_value + Decimal(str(len(predicted_stockouts) * 5))
        has_activity = any([
            documents,
            line_items,
            movements,
            alerts,
            predictions,
        ])

        digest = {
            "property": {
                "id": str(property_row["id"]),
                "organization_id": str(property_row["organization_id"]),
                "name": property_row.get("name", "Property"),
                "timezone": property_row.get("timezone") or "UTC",
                "currency": property_row.get("currency") or "USD",
            },
            "period": {
                "start_date": start_day.isoformat(),
                "end_date": end_day.isoformat(),
                "label": f"{start_day.strftime('%b %d')} – {end_day.strftime('%b %d, %Y')}",
            },
            "summary": {
                "total_spend": float(total_spend),
                "potential_savings": float(potential_savings),
                "waste_value": float(waste_value),
                "document_count": len(documents),
                "stockout_count": len(stocked_out),
                "predicted_stockout_count": len(predicted_stockouts),
            },
            "top_vendors": [
                {
                    "name": row["name"],
                    "spend": float(row["spend"]),
                    "documents": row["documents"],
                }
                for row in sorted(vendor_totals.values(), key=lambda value: value["spend"], reverse=True)[:5]
            ],
            "top_categories": [
                {
                    "name": row["name"],
                    "spend": float(row["spend"]),
                    "items": row["items"],
                }
                for row in sorted(category_totals.values(), key=lambda value: value["spend"], reverse=True)[:5]
            ],
            "stocked_out_items": list(stocked_out.values())[:5],
            "predicted_stockouts": predicted_stockouts[:5],
            "waste_incidents": waste_incidents[:8],
            "suggested_reorders": suggested_reorders[:8],
            "dashboard_url": f"{settings.BASE_URL.rstrip('/')}/dashboard",
            "has_activity": has_activity,
        }
        return digest
