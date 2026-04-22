from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


class RestockService:
    """Burn-rate analytics and predictive restock orchestration."""

    async def recompute_burn_rates(
        self,
        tenant: TenantContext,
        lookback_days: int = 30,
        auto_calculate_reorder_point: bool = False,
        safety_buffer: float = 0.0,
    ) -> dict[str, Any]:
        if not tenant.property_id:
            return {
                "items_updated": 0,
                "lookback_days": lookback_days,
                "detail": "property_id missing",
            }

        client = await get_async_supabase_admin()
        cutoff = (datetime.now(UTC) - timedelta(days=lookback_days)).isoformat()

        inv_resp = await (
            client.table("inventory_items")
            .select("id,name,quantity,average_daily_usage,reorder_point")
            .eq("organization_id", str(tenant.org_id))
            .eq("property_id", str(tenant.property_id))
            .eq("is_active", True)
            .execute()
        )
        items = inv_resp.data or []
        if not items:
            return {"items_updated": 0, "lookback_days": lookback_days}

        item_name_to_id: dict[str, str] = {}
        for row in items:
            name = (row.get("name") or "").strip().lower()
            if name and name not in item_name_to_id:
                item_name_to_id[name] = str(row["id"])

        manual_usage_by_item: dict[str, float] = defaultdict(float)
        audit_resp = await (
            client.table("audit_logs")
            .select("resource_id,metadata")
            .eq("organization_id", str(tenant.org_id))
            .eq("property_id", str(tenant.property_id))
            .eq("resource_type", "inventory_item")
            .eq("action", "inventory.quantity_adjusted")
            .gte("created_at", cutoff)
            .execute()
        )
        for row in (audit_resp.data or []):
            item_id = row.get("resource_id")
            if not item_id:
                continue
            adjustment = _to_float((row.get("metadata") or {}).get("adjustment"), 0.0)
            # Negative adjustment indicates consumption/depletion.
            if adjustment < 0:
                manual_usage_by_item[str(item_id)] += abs(adjustment)

        scan_restock_by_item: dict[str, float] = defaultdict(float)
        scans_resp = await (
            client.table("scans")
            .select("processed_results")
            .eq("organization_id", str(tenant.org_id))
            .eq("property_id", str(tenant.property_id))
            .in_("status", ["completed", "partial_failed"])
            .gte("created_at", cutoff)
            .execute()
        )
        for scan in (scans_resp.data or []):
            processed = scan.get("processed_results") or {}
            for extracted in (processed.get("items") or []):
                raw_name = (extracted.get("item_name") or extracted.get("name") or "").strip().lower()
                if not raw_name:
                    continue
                item_id = item_name_to_id.get(raw_name)
                if not item_id:
                    continue
                qty = max(0.0, _to_float(extracted.get("quantity"), 0.0))
                scan_restock_by_item[item_id] += qty

        updates = 0
        for row in items:
            item_id = str(row["id"])
            manual_usage = manual_usage_by_item.get(item_id, 0.0)
            scan_restock = scan_restock_by_item.get(item_id, 0.0)
            burn_rate = max(0.0, manual_usage - scan_restock) / max(lookback_days, 1)

            payload: dict[str, Any] = {
                "average_daily_usage": str(round(burn_rate, 4)),
            }
            if auto_calculate_reorder_point:
                reorder_point = max(0.0, burn_rate * 7.0 + safety_buffer)
                payload["reorder_point"] = str(round(reorder_point, 3))
                payload["auto_reorder_enabled"] = True
                payload["safety_buffer"] = str(round(safety_buffer, 3))

            await (
                client.table("inventory_items")
                .update(payload)
                .eq("id", item_id)
                .execute()
            )
            updates += 1

        return {
            "items_updated": updates,
            "lookback_days": lookback_days,
            "auto_calculate_reorder_point": auto_calculate_reorder_point,
            "safety_buffer": safety_buffer,
        }

    async def get_vendor_restock_preview(
        self,
        tenant: TenantContext,
        runout_threshold_days: int = 7,
    ) -> dict[str, Any]:
        if not tenant.property_id:
            return {"vendors": [], "runout_threshold_days": runout_threshold_days}

        client = await get_async_supabase_admin()
        inv_resp = await (
            client.table("inventory_items")
            .select(
                "id,name,vendor_id,quantity,average_daily_usage,cost_per_unit,"
                "unit,safety_buffer,auto_reorder_enabled,reorder_point"
            )
            .eq("organization_id", str(tenant.org_id))
            .eq("property_id", str(tenant.property_id))
            .eq("is_active", True)
            .not_.is_("vendor_id", "null")
            .execute()
        )
        items = inv_resp.data or []

        vendor_ids = {str(i["vendor_id"]) for i in items if i.get("vendor_id")}
        vendors_by_id: dict[str, dict[str, Any]] = {}
        if vendor_ids:
            vendor_resp = await (
                client.table("vendors")
                .select("id,name,contact_email,contact_phone,address,website")
                .eq("organization_id", str(tenant.org_id))
                .in_("id", list(vendor_ids))
                .execute()
            )
            vendors_by_id = {str(v["id"]): v for v in (vendor_resp.data or [])}

        grouped: dict[str, dict[str, Any]] = {}
        for item in items:
            avg_daily = _to_float(item.get("average_daily_usage"), 0.0)
            if avg_daily <= 0:
                continue
            qty = max(0.0, _to_float(item.get("quantity"), 0.0))
            runout_days = qty / avg_daily if avg_daily > 0 else 9999.0
            if runout_days >= runout_threshold_days:
                continue

            vendor_id = str(item["vendor_id"])
            vendor = vendors_by_id.get(vendor_id, {"id": vendor_id, "name": "Unknown vendor"})

            safety_buffer = _to_float(item.get("safety_buffer"), 0.0)
            target_qty = avg_daily * runout_threshold_days + safety_buffer
            needed_qty = max(0.0, target_qty - qty)
            unit_cost = _to_float(item.get("cost_per_unit"), 0.0)
            estimated_cost = needed_qty * unit_cost

            if vendor_id not in grouped:
                grouped[vendor_id] = {
                    "vendor": vendor,
                    "items": [],
                    "total_estimated_cost": 0.0,
                }

            grouped[vendor_id]["items"].append({
                "item_id": item["id"],
                "name": item.get("name"),
                "unit": item.get("unit") or "unit",
                "current_quantity": round(qty, 3),
                "average_daily_usage": round(avg_daily, 4),
                "runout_days": round(runout_days, 2),
                "needed_quantity": round(needed_qty, 3),
                "unit_cost": round(unit_cost, 4),
                "estimated_cost": round(estimated_cost, 2),
                "reorder_point": _to_float(item.get("reorder_point"), 0.0),
                "auto_reorder_enabled": bool(item.get("auto_reorder_enabled") or False),
            })
            grouped[vendor_id]["total_estimated_cost"] += estimated_cost

        vendors = sorted(
            [
                {
                    **data,
                    "total_estimated_cost": round(data["total_estimated_cost"], 2),
                    "item_count": len(data["items"]),
                }
                for data in grouped.values()
            ],
            key=lambda x: x["total_estimated_cost"],
            reverse=True,
        )

        return {
            "runout_threshold_days": runout_threshold_days,
            "vendors": vendors,
            "generated_at": datetime.now(UTC).isoformat(),
        }

    async def generate_vendor_order_export(
        self,
        tenant: TenantContext,
        vendor_id: str,
        runout_threshold_days: int = 7,
    ) -> dict[str, Any]:
        preview = await self.get_vendor_restock_preview(
            tenant=tenant,
            runout_threshold_days=runout_threshold_days,
        )
        vendor_group = next((v for v in preview["vendors"] if str(v["vendor"].get("id")) == vendor_id), None)
        if not vendor_group:
            return {
                "vendor_id": vendor_id,
                "html": "",
                "email_subject": "",
                "email_body": "No restock items currently required for this vendor.",
            }

        vendor = vendor_group["vendor"]
        rows = []
        for item in vendor_group["items"]:
            rows.append(
                f"<tr><td>{item['name']}</td><td>{item['needed_quantity']} {item['unit']}</td>"
                f"<td>{item['current_quantity']}</td><td>{item['average_daily_usage']}</td>"
                f"<td>${item['unit_cost']:.2f}</td><td>${item['estimated_cost']:.2f}</td></tr>"
            )
        html = (
            "<html><head><style>body{font-family:Arial,sans-serif;}"
            "table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ddd;padding:8px;text-align:left;}"
            "th{background:#f4f7fb;}</style></head><body>"
            f"<h2>Purchase Order Preview - {vendor.get('name', 'Vendor')}</h2>"
            f"<p>Contact: {vendor.get('contact_email') or '-'} | {vendor.get('contact_phone') or '-'}</p>"
            f"<p>Address: {vendor.get('address') or '-'}</p>"
            "<table><thead><tr><th>Item</th><th>Qty to Order</th><th>Current Qty</th>"
            "<th>Daily Usage</th><th>Unit Cost</th><th>Est. Cost</th></tr></thead><tbody>"
            + "".join(rows)
            + "</tbody></table>"
            f"<h3>Total Estimated Cost: ${vendor_group['total_estimated_cost']:.2f}</h3>"
            "</body></html>"
        )

        email_subject = f"Purchase Order Request - {vendor.get('name', 'Vendor')}"
        email_lines = [
            f"Hello {vendor.get('name', 'Vendor')},",
            "",
            "Please find our replenishment request below:",
        ]
        for item in vendor_group["items"]:
            email_lines.append(
                f"- {item['name']}: {item['needed_quantity']} {item['unit']} (est. ${item['estimated_cost']:.2f})"
            )
        email_lines.extend([
            "",
            f"Total estimated cost: ${vendor_group['total_estimated_cost']:.2f}",
            "",
            "Best regards,",
            "Neumas Procurement",
        ])

        return {
            "vendor_id": vendor_id,
            "vendor": vendor,
            "html": html,
            "email_subject": email_subject,
            "email_body": "\n".join(email_lines),
            "total_estimated_cost": vendor_group["total_estimated_cost"],
            "item_count": len(vendor_group["items"]),
        }