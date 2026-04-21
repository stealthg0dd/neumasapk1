"""
Copilot tool service.

Implements the backend logic for each copilot tool method:
  - search_documents
  - explain_prediction
  - compare_vendors
  - summarize_outlet_risk
  - generate_reorder_plan

Each method accepts a TenantContext and returns a typed Pydantic schema.
All database access goes through the retrieval_service or direct Supabase
queries — never through a service class that modifies state.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin
from app.schemas.copilot import (
    CompareVendorsInput,
    CompareVendorsResult,
    ExplainPredictionInput,
    ExplainPredictionResult,
    GenerateReorderPlanInput,
    GenerateReorderPlanResult,
    OutletRiskSummary,
    ReorderLineItem,
    SearchDocumentsInput,
    SearchDocumentsResult,
    SummarizeOutletRiskInput,
    VendorPriceSummary,
)
from app.services.retrieval_service import (
    list_recent_vendor_prices,
)
from app.services.retrieval_service import (
    search_documents as _search_documents,
)

logger = get_logger(__name__)


class CopilotToolService:
    """Stateless service implementing copilot tool methods."""

    # ------------------------------------------------------------------
    # search_documents
    # ------------------------------------------------------------------

    async def search_documents(
        self,
        tenant: TenantContext,
        inp: SearchDocumentsInput,
    ) -> SearchDocumentsResult:
        """Search documents by vendor name or free-text query."""
        docs = await _search_documents(
            tenant=tenant,
            query=inp.query,
            document_type=inp.document_type,
            vendor_name=inp.vendor_name,
            limit=inp.limit,
        )
        return SearchDocumentsResult(
            documents=docs,
            total=len(docs),
            query=inp.query,
        )

    # ------------------------------------------------------------------
    # explain_prediction
    # ------------------------------------------------------------------

    async def explain_prediction(
        self,
        tenant: TenantContext,
        inp: ExplainPredictionInput,
    ) -> ExplainPredictionResult:
        """
        Return a human-readable explanation of a stockout prediction.

        Reads from the predictions table and derives a text explanation
        from the pattern data. No LLM call — deterministic.
        """
        supabase = await get_async_supabase_admin()
        if not supabase:
            raise RuntimeError("Database not configured")

        # Fetch prediction
        pred_resp = await (
            supabase.table("predictions")
            .select("*")
            .eq("item_id", str(inp.item_id))
            .eq("organization_id", str(tenant.org_id))
            .order("created_at", desc=True)
            .limit(1)
            .single()
            .execute()
        )
        if not pred_resp.data:
            raise ValueError(f"No prediction found for item {inp.item_id}")

        pred = pred_resp.data

        # Fetch item name
        item_resp = await (
            supabase.table("inventory_items")
            .select("name, unit")
            .eq("id", str(inp.item_id))
            .single()
            .execute()
        )
        item_name = (item_resp.data or {}).get("name", str(inp.item_id))

        days_to_stockout: float | None = pred.get("days_to_stockout")
        confidence: float = float(pred.get("confidence") or 0.0)

        # Build reasoning
        factors: list[str] = []
        if days_to_stockout is not None and days_to_stockout < inp.horizon_days:
            factors.append(
                f"Predicted stockout in {round(days_to_stockout, 1)} days based on consumption patterns"
            )
        if pred.get("consumption_rate"):
            factors.append(f"Average consumption rate: {pred['consumption_rate']} per day")
        if pred.get("current_quantity") is not None:
            factors.append(f"Current on-hand quantity: {pred['current_quantity']}")

        if not factors:
            factors.append("Insufficient pattern data for detailed explanation")

        reasoning = (
            f"{item_name} is projected to stock out in "
            f"{round(days_to_stockout, 1) if days_to_stockout is not None else 'an unknown number of'} days "
            f"(confidence: {round(confidence * 100)}%). "
            + " ".join(factors)
        )

        return ExplainPredictionResult(
            item_id=str(inp.item_id),
            item_name=item_name,
            predicted_stockout_days=days_to_stockout,
            confidence=confidence,
            reasoning=reasoning,
            contributing_factors=factors,
        )

    # ------------------------------------------------------------------
    # compare_vendors
    # ------------------------------------------------------------------

    async def compare_vendors(
        self,
        tenant: TenantContext,
        inp: CompareVendorsInput,
    ) -> CompareVendorsResult:
        """Compare vendor prices for a given item name."""
        price_rows = await list_recent_vendor_prices(
            tenant=tenant,
            item_name=inp.item_name,
            limit=50,
        )

        # Aggregate by vendor
        vendor_map: dict[str, dict[str, Any]] = {}
        for row in price_rows:
            doc = row.get("documents") or {}
            vid = str(doc.get("vendor_id") or "unknown")
            vname = str(doc.get("raw_vendor_name") or "Unknown")
            price = row.get("raw_price")
            if price is None:
                continue
            price = float(price)
            if vid not in vendor_map:
                vendor_map[vid] = {"name": vname, "prices": []}
            vendor_map[vid]["prices"].append(price)

        summaries: list[VendorPriceSummary] = []
        for vid, data in vendor_map.items():
            prices = data["prices"]
            last = prices[0] if prices else None
            avg = sum(prices) / len(prices) if prices else None
            change_pct: float | None = None
            if len(prices) >= 2:
                change_pct = (prices[0] - prices[-1]) / prices[-1] * 100

            summaries.append(
                VendorPriceSummary(
                    vendor_id=vid,
                    vendor_name=data["name"],
                    last_price=last,
                    avg_price_30d=round(avg, 4) if avg is not None else None,
                    price_change_pct=round(change_pct, 2) if change_pct is not None else None,
                )
            )

        cheapest: str | None = None
        if summaries:
            valid = [s for s in summaries if s.last_price is not None]
            if valid:
                cheapest = min(valid, key=lambda s: s.last_price or float("inf")).vendor_id

        rec = (
            f"Based on recent prices, {cheapest} offers the lowest price for {inp.item_name}."
            if cheapest
            else f"No recent vendor prices found for {inp.item_name}."
        )

        return CompareVendorsResult(
            item_name=inp.item_name,
            vendors=summaries,
            cheapest_vendor_id=cheapest,
            recommendation=rec,
        )

    # ------------------------------------------------------------------
    # summarize_outlet_risk
    # ------------------------------------------------------------------

    async def summarize_outlet_risk(
        self,
        tenant: TenantContext,
        inp: SummarizeOutletRiskInput,
    ) -> OutletRiskSummary:
        """Summarise the risk posture for a given property."""
        supabase = await get_async_supabase_admin()
        if not supabase:
            raise RuntimeError("Database not configured")

        # Count open alerts
        alert_query = (
            supabase.table("alerts")
            .select("id, severity", count="exact")
            .eq("organization_id", str(tenant.org_id))
            .eq("property_id", str(inp.property_id))
        )
        if not inp.include_snoozed:
            alert_query = alert_query.eq("state", "open")
        else:
            alert_query = alert_query.in_("state", ["open", "snoozed"])

        alert_resp = await alert_query.execute()
        alerts = alert_resp.data or []
        open_count = len(alerts)
        critical_count = sum(1 for a in alerts if a.get("severity") == "critical")

        # Count low stock items
        inv_resp = await (
            supabase.table("inventory_items")
            .select("id", count="exact")
            .eq("property_id", str(inp.property_id))
            .in_("stock_status", ["low_stock", "out_of_stock"])
            .execute()
        )
        low_stock = inv_resp.count or 0

        # Days since last scan
        scan_resp = await (
            supabase.table("scans")
            .select("completed_at")
            .eq("property_id", str(inp.property_id))
            .eq("status", "completed")
            .order("completed_at", desc=True)
            .limit(1)
            .execute()
        )
        days_since: int | None = None
        if scan_resp.data:
            last_completed = scan_resp.data[0].get("completed_at")
            if last_completed:
                from datetime import datetime as dt
                try:
                    last_dt = dt.fromisoformat(last_completed.replace("Z", "+00:00"))
                    days_since = (datetime.now(UTC) - last_dt).days
                except Exception:
                    pass

        # Determine overall risk level
        if critical_count > 0 or (days_since is not None and days_since > 14):
            risk = "critical"
        elif open_count >= 5 or low_stock >= 3:
            risk = "high"
        elif open_count >= 2 or low_stock >= 1:
            risk = "medium"
        else:
            risk = "low"

        concerns: list[str] = []
        if critical_count:
            concerns.append(f"{critical_count} critical alert(s)")
        if low_stock:
            concerns.append(f"{low_stock} low/out-of-stock item(s)")
        if days_since is not None and days_since > 7:
            concerns.append(f"Last scan {days_since} days ago")

        return OutletRiskSummary(
            property_id=str(inp.property_id),
            open_alerts=open_count,
            critical_alerts=critical_count,
            low_stock_items=low_stock,
            days_since_last_scan=days_since,
            overall_risk=risk,
            top_concerns=concerns,
        )

    # ------------------------------------------------------------------
    # generate_reorder_plan
    # ------------------------------------------------------------------

    async def generate_reorder_plan(
        self,
        tenant: TenantContext,
        inp: GenerateReorderPlanInput,
    ) -> GenerateReorderPlanResult:
        """
        Generate a reorder plan from stockout predictions.

        Reads predictions ordered by urgency and returns line items
        with estimated costs where vendor price data is available.
        """
        supabase = await get_async_supabase_admin()
        if not supabase:
            raise RuntimeError("Database not configured")

        # Fetch urgent predictions
        pred_resp = await (
            supabase.table("predictions")
            .select(
                "item_id, days_to_stockout, reorder_quantity, consumption_rate, "
                "inventory_items(name, unit, quantity)"
            )
            .eq("organization_id", str(tenant.org_id))
            .eq("property_id", str(inp.property_id))
            .lte("days_to_stockout", inp.days_ahead)
            .order("days_to_stockout")
            .limit(30)
            .execute()
        )
        rows = pred_resp.data or []

        items: list[ReorderLineItem] = []
        total_cost = 0.0

        for row in rows:
            inv = row.get("inventory_items") or {}
            item_name = inv.get("name", row.get("item_id", "Unknown"))
            unit = inv.get("unit", "unit")
            current_qty = float(inv.get("quantity") or 0)
            reorder_qty = float(row.get("reorder_quantity") or 1)

            items.append(
                ReorderLineItem(
                    item_id=str(row.get("item_id", "")),
                    item_name=item_name,
                    current_qty=current_qty,
                    reorder_qty=reorder_qty,
                    unit=unit,
                    estimated_cost=None,
                    vendor_name=None,
                )
            )

        within_budget: bool | None = None
        if inp.budget_limit is not None and total_cost > 0:
            within_budget = total_cost <= inp.budget_limit

        return GenerateReorderPlanResult(
            property_id=str(inp.property_id),
            items=items,
            total_estimated_cost=round(total_cost, 2) if total_cost else None,
            within_budget=within_budget,
            generated_at=datetime.now(UTC).isoformat(),
        )


async def get_copilot_tool_service() -> CopilotToolService:
    """Get a CopilotToolService instance."""
    return CopilotToolService()
