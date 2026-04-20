"""
vendor_analytics_service.py — Vendor Intelligence Engine analytics logic.
"""

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.db.supabase_client import get_async_supabase_admin


class VendorAnalyticsService:
    async def get_vendor_spend(self, tenant: TenantContext, vendor_id: UUID | None, days: int = 90) -> dict[str, Any]:
        client = await get_async_supabase_admin()
        cutoff = (datetime.now(UTC) - timedelta(days=days)).isoformat()
        q = (
            client.table("item_price_history")
            .select("vendor_id, vendor_name, price, quantity, purchase_date")
            .eq("organization_id", str(tenant.org_id))
            .gte("purchase_date", cutoff)
        )
        if vendor_id:
            q = q.eq("vendor_id", str(vendor_id))
        resp = await q.execute()
        rows = resp.data or []
        spend = {}
        for row in rows:
            vid = row["vendor_id"]
            vname = row["vendor_name"]
            amt = float(row["price"] or 0) * float(row["quantity"] or 1)
            if vid not in spend:
                spend[vid] = {"vendor_name": vname, "total_spend": 0.0, "count": 0}
            spend[vid]["total_spend"] += amt
            spend[vid]["count"] += 1
        return {"vendors": list(spend.values())}

    async def get_vendor_trends(self, tenant: TenantContext, vendor_id: UUID, days: int = 90) -> dict[str, Any]:
        client = await get_async_supabase_admin()
        cutoff = (datetime.now(UTC) - timedelta(days=days)).isoformat()
        resp = await (
            client.table("item_price_history")
            .select("price, quantity, purchase_date")
            .eq("organization_id", str(tenant.org_id))
            .eq("vendor_id", str(vendor_id))
            .gte("purchase_date", cutoff)
            .order("purchase_date")
            .execute()
        )
        rows = resp.data or []
        daily = {}
        for row in rows:
            date = row["purchase_date"][:10]
            amt = float(row["price"] or 0) * float(row["quantity"] or 1)
            daily.setdefault(date, 0.0)
            daily[date] += amt
        trend = [{"date": d, "spend": round(a, 2)} for d, a in sorted(daily.items())]
        return {"trend": trend}

    async def get_vendor_price_intel(self, tenant: TenantContext, vendor_id: UUID, item_id: UUID | None, days: int = 90) -> dict[str, Any]:
        client = await get_async_supabase_admin()
        cutoff = (datetime.now(UTC) - timedelta(days=days)).isoformat()
        q = (
            client.table("item_price_history")
            .select("item_id, item_name, price, purchase_date")
            .eq("organization_id", str(tenant.org_id))
            .eq("vendor_id", str(vendor_id))
            .gte("purchase_date", cutoff)
        )
        if item_id:
            q = q.eq("item_id", str(item_id))
        resp = await q.order("purchase_date").execute()
        rows = resp.data or []
        price_history = {}
        for row in rows:
            iid = row["item_id"]
            iname = row["item_name"]
            price = float(row["price"] or 0)
            date = row["purchase_date"][:10]
            price_history.setdefault(iid, {"item_name": iname, "prices": []})
            price_history[iid]["prices"].append({"date": date, "price": price})
        # Detect price increases/spikes
        alerts = []
        for iid, data in price_history.items():
            prices = [p["price"] for p in data["prices"]]
            if len(prices) > 1:
                for i in range(1, len(prices)):
                    if prices[i] > prices[i-1] * 1.15:
                        alerts.append({"item_id": iid, "item_name": data["item_name"], "date": data["prices"][i]["date"], "old_price": prices[i-1], "new_price": prices[i], "type": "spike"})
        return {"price_history": price_history, "alerts": alerts}

    async def get_vendor_comparison(self, tenant: TenantContext, item_id: UUID, days: int = 90) -> dict[str, Any]:
        client = await get_async_supabase_admin()
        cutoff = (datetime.now(UTC) - timedelta(days=days)).isoformat()
        resp = await (
            client.table("item_price_history")
            .select("vendor_id, vendor_name, price, purchase_date")
            .eq("organization_id", str(tenant.org_id))
            .eq("item_id", str(item_id))
            .gte("purchase_date", cutoff)
            .order("price")
            .execute()
        )
        rows = resp.data or []
        by_vendor = {}
        for row in rows:
            vid = row["vendor_id"]
            vname = row["vendor_name"]
            price = float(row["price"] or 0)
            by_vendor.setdefault(vid, {"vendor_name": vname, "prices": []})
            by_vendor[vid]["prices"].append(price)
        comparison = []
        for vid, data in by_vendor.items():
            min_price = min(data["prices"])
            max_price = max(data["prices"])
            avg_price = sum(data["prices"]) / len(data["prices"])
            comparison.append({"vendor_id": vid, "vendor_name": data["vendor_name"], "min_price": min_price, "max_price": max_price, "avg_price": round(avg_price, 2)})
        comparison.sort(key=lambda x: x["min_price"])
        return {"comparison": comparison}

    async def get_vendor_alerts(self, tenant: TenantContext, days: int = 30) -> dict[str, Any]:
        # For demo: just return price spikes from price_intel for all vendors
        client = await get_async_supabase_admin()
        cutoff = (datetime.now(UTC) - timedelta(days=days)).isoformat()
        resp = await (
            client.table("item_price_history")
            .select("vendor_id, vendor_name, item_id, item_name, price, purchase_date")
            .eq("organization_id", str(tenant.org_id))
            .gte("purchase_date", cutoff)
            .order("purchase_date")
            .execute()
        )
        rows = resp.data or []
        alerts = []
        last_price = {}
        for row in rows:
            key = (row["vendor_id"], row["item_id"])
            price = float(row["price"] or 0)
            if key in last_price:
                prev = last_price[key]
                if price > prev * 1.15:
                    alerts.append({"vendor_id": row["vendor_id"], "vendor_name": row["vendor_name"], "item_id": row["item_id"], "item_name": row["item_name"], "date": row["purchase_date"][:10], "old_price": prev, "new_price": price, "type": "spike"})
            last_price[key] = price
        return {"alerts": alerts}
