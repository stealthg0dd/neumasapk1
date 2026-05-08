from __future__ import annotations

"""Admin repository for global admin panel metrics and listings."""

from collections import defaultdict
from typing import Any

from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)


class AdminRepository:
    """Repository for admin dashboard and listing queries."""

    @staticmethod
    def _page_bounds(page: int, page_size: int) -> tuple[int, int]:
        safe_page = max(1, page)
        safe_page_size = max(1, min(page_size, 200))
        start = (safe_page - 1) * safe_page_size
        end = start + safe_page_size - 1
        return start, end

    @staticmethod
    def _normalize_org_id(row: dict[str, Any]) -> str | None:
        return row.get("organization_id") or row.get("org_id")

    @staticmethod
    def _normalize_subscription_tier(row: dict[str, Any]) -> str | None:
        return row.get("subscription_tier") or row.get("plan")

    async def _count_table(self, table: str, filters: dict[str, Any] | None = None) -> int:
        client = await get_async_supabase_admin()
        if not client:
            return 0

        try:
            query = client.table(table).select("id", count="exact", head=True)
            for key, value in (filters or {}).items():
                query = query.eq(key, value)
            resp = await query.execute()
            return int(resp.count or 0)
        except Exception as exc:
            logger.warning("Admin count query failed", table=table, error=str(exc))
            return 0

    async def get_overview(self) -> dict[str, int]:
        """Return top-level counts for the admin dashboard."""
        return {
            "total_orgs": await self._count_table("organizations"),
            "total_users": await self._count_table("users"),
            "total_properties": await self._count_table("properties"),
            "total_scans": await self._count_table("scans"),
            "total_predictions": await self._count_table("predictions"),
            "active_subscriptions": await self._count_table(
                "organizations",
                {"subscription_status": "active"},
            ),
        }

    async def get_all_organizations(self, page: int = 1, page_size: int = 20) -> dict[str, Any]:
        """Paginated organizations with property counts."""
        client = await get_async_supabase_admin()
        if not client:
            return {"items": [], "page": page, "page_size": page_size, "total": 0}

        start, end = self._page_bounds(page, page_size)

        try:
            org_resp = await (
                client.table("organizations")
                .select("id,name,created_at,subscription_tier,plan", count="exact")
                .order("created_at", desc=True)
                .range(start, end)
                .execute()
            )
            org_rows = org_resp.data or []
            total = int(org_resp.count or 0)

            org_ids = [row["id"] for row in org_rows if row.get("id")]
            property_count_by_org: dict[str, int] = defaultdict(int)

            if org_ids:
                props_resp = await (
                    client.table("properties")
                    .select("organization_id,org_id")
                    .in_("organization_id", org_ids)
                    .execute()
                )
                for row in props_resp.data or []:
                    org_id = self._normalize_org_id(row)
                    if org_id:
                        property_count_by_org[org_id] += 1

            items = [
                {
                    "id": row.get("id"),
                    "name": row.get("name"),
                    "created_at": row.get("created_at"),
                    "subscription_tier": self._normalize_subscription_tier(row),
                    "property_count": property_count_by_org.get(row.get("id", ""), 0),
                }
                for row in org_rows
            ]

            return {
                "items": items,
                "page": page,
                "page_size": page_size,
                "total": total,
            }
        except Exception as exc:
            logger.warning("Failed to fetch organizations for admin panel", error=str(exc))
            return {"items": [], "page": page, "page_size": page_size, "total": 0}

    async def get_all_users(self, page: int = 1, page_size: int = 20) -> dict[str, Any]:
        """Paginated users with organization names."""
        client = await get_async_supabase_admin()
        if not client:
            return {"items": [], "page": page, "page_size": page_size, "total": 0}

        start, end = self._page_bounds(page, page_size)

        try:
            user_resp = await (
                client.table("users")
                .select("id,email,role,created_at,organization_id,org_id", count="exact")
                .order("created_at", desc=True)
                .range(start, end)
                .execute()
            )
            user_rows = user_resp.data or []
            total = int(user_resp.count or 0)

            org_ids = sorted(
                {
                    org_id
                    for org_id in (self._normalize_org_id(row) for row in user_rows)
                    if org_id
                }
            )

            org_name_by_id: dict[str, str] = {}
            if org_ids:
                org_resp = await (
                    client.table("organizations")
                    .select("id,name")
                    .in_("id", org_ids)
                    .execute()
                )
                org_name_by_id = {
                    row["id"]: row.get("name")
                    for row in (org_resp.data or [])
                    if row.get("id")
                }

            items = [
                {
                    "id": row.get("id"),
                    "email": row.get("email"),
                    "role": row.get("role"),
                    "created_at": row.get("created_at"),
                    "organization_id": self._normalize_org_id(row),
                    "organization_name": org_name_by_id.get(self._normalize_org_id(row) or ""),
                }
                for row in user_rows
            ]

            return {
                "items": items,
                "page": page,
                "page_size": page_size,
                "total": total,
            }
        except Exception as exc:
            logger.warning("Failed to fetch users for admin panel", error=str(exc))
            return {"items": [], "page": page, "page_size": page_size, "total": 0}

    async def get_all_properties(self, page: int = 1, page_size: int = 20) -> dict[str, Any]:
        """Paginated properties with organization names."""
        client = await get_async_supabase_admin()
        if not client:
            return {"items": [], "page": page, "page_size": page_size, "total": 0}

        start, end = self._page_bounds(page, page_size)

        try:
            prop_resp = await (
                client.table("properties")
                .select("id,name,created_at,organization_id,org_id", count="exact")
                .order("created_at", desc=True)
                .range(start, end)
                .execute()
            )
            prop_rows = prop_resp.data or []
            total = int(prop_resp.count or 0)

            org_ids = sorted(
                {
                    org_id
                    for org_id in (self._normalize_org_id(row) for row in prop_rows)
                    if org_id
                }
            )

            org_name_by_id: dict[str, str] = {}
            if org_ids:
                org_resp = await (
                    client.table("organizations")
                    .select("id,name")
                    .in_("id", org_ids)
                    .execute()
                )
                org_name_by_id = {
                    row["id"]: row.get("name")
                    for row in (org_resp.data or [])
                    if row.get("id")
                }

            items = [
                {
                    "id": row.get("id"),
                    "name": row.get("name"),
                    "created_at": row.get("created_at"),
                    "organization_id": self._normalize_org_id(row),
                    "organization_name": org_name_by_id.get(self._normalize_org_id(row) or ""),
                }
                for row in prop_rows
            ]

            return {
                "items": items,
                "page": page,
                "page_size": page_size,
                "total": total,
            }
        except Exception as exc:
            logger.warning("Failed to fetch properties for admin panel", error=str(exc))
            return {"items": [], "page": page, "page_size": page_size, "total": 0}

    async def get_audit_logs(
        self,
        page: int = 1,
        page_size: int = 50,
        filters: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Paginated audit logs ordered newest first."""
        client = await get_async_supabase_admin()
        if not client:
            return {"items": [], "page": page, "page_size": page_size, "total": 0}

        start, end = self._page_bounds(page, page_size)
        filters = filters or {}

        try:
            query = (
                client.table("audit_logs")
                .select("*", count="exact")
                .order("created_at", desc=True)
                .range(start, end)
            )

            for key in ("organization_id", "actor_id", "event_type"):
                if filters.get(key):
                    query = query.eq(key, filters[key])

            if filters.get("created_at_gte"):
                query = query.gte("created_at", filters["created_at_gte"])
            if filters.get("created_at_lte"):
                query = query.lte("created_at", filters["created_at_lte"])

            resp = await query.execute()
            return {
                "items": resp.data or [],
                "page": page,
                "page_size": page_size,
                "total": int(resp.count or 0),
            }
        except Exception as exc:
            logger.warning("Failed to fetch audit logs for admin panel", error=str(exc))
            return {"items": [], "page": page, "page_size": page_size, "total": 0}

    async def get_usage_metering(self, page: int = 1, page_size: int = 20) -> dict[str, Any]:
        """Aggregate scan/prediction usage by organization.

        Primary source is usage_metering table as requested.
        If unavailable, falls back to scans/predictions counts for graceful degradation.
        """
        client = await get_async_supabase_admin()
        if not client:
            return {"items": [], "page": page, "page_size": page_size, "total": 0}

        try:
            rows: list[dict[str, Any]] = []
            try:
                metering_resp = await client.table("usage_metering").select("*").execute()
                rows = metering_resp.data or []
            except Exception as metering_exc:
                logger.warning(
                    "usage_metering table unavailable; using scans/predictions fallback",
                    error=str(metering_exc),
                )

            usage_by_org: dict[str, dict[str, Any]] = defaultdict(
                lambda: {"organization_id": None, "scan_count": 0, "prediction_count": 0}
            )

            if rows:
                for row in rows:
                    org_id = self._normalize_org_id(row)
                    if not org_id:
                        continue
                    agg = usage_by_org[org_id]
                    agg["organization_id"] = org_id

                    if isinstance(row.get("scan_count"), int | float):
                        agg["scan_count"] += int(row["scan_count"])
                    if isinstance(row.get("prediction_count"), int | float):
                        agg["prediction_count"] += int(row["prediction_count"])

                    feature = (row.get("feature") or row.get("event_type") or "").lower()
                    count_value = row.get("count")
                    if isinstance(count_value, int | float):
                        if "scan" in feature:
                            agg["scan_count"] += int(count_value)
                        elif "prediction" in feature:
                            agg["prediction_count"] += int(count_value)
            else:
                org_resp = await client.table("organizations").select("id,name").execute()
                org_rows = org_resp.data or []
                for row in org_rows:
                    org_id = row.get("id")
                    if not org_id:
                        continue
                    scan_count = await self._count_table("scans", {"organization_id": org_id})
                    prediction_count = await self._count_table("predictions", {"organization_id": org_id})
                    usage_by_org[org_id] = {
                        "organization_id": org_id,
                        "organization_name": row.get("name"),
                        "scan_count": scan_count,
                        "prediction_count": prediction_count,
                    }

            org_ids = [org_id for org_id in usage_by_org if org_id]
            org_name_by_id: dict[str, str] = {}
            if org_ids:
                org_resp = await (
                    client.table("organizations")
                    .select("id,name")
                    .in_("id", org_ids)
                    .execute()
                )
                org_name_by_id = {
                    row["id"]: row.get("name")
                    for row in (org_resp.data or [])
                    if row.get("id")
                }

            items = []
            for org_id, data in usage_by_org.items():
                items.append(
                    {
                        "organization_id": org_id,
                        "organization_name": data.get("organization_name") or org_name_by_id.get(org_id),
                        "scan_count": int(data.get("scan_count") or 0),
                        "prediction_count": int(data.get("prediction_count") or 0),
                    }
                )

            items.sort(key=lambda item: item.get("organization_name") or "")
            total = len(items)
            start, end = self._page_bounds(page, page_size)
            paged_items = items[start : end + 1]

            return {
                "items": paged_items,
                "page": page,
                "page_size": page_size,
                "total": total,
            }
        except Exception as exc:
            logger.warning("Failed to fetch usage metering for admin panel", error=str(exc))
            return {"items": [], "page": page, "page_size": page_size, "total": 0}

    async def get_system_health(self) -> dict[str, Any]:
        """Return high-level health signals for admin panel."""
        return {
            "database": "ok",
            "metrics": {
                "organizations": await self._count_table("organizations"),
                "users": await self._count_table("users"),
            },
        }

    # ------------------------------------------------------------------
    # Backward-compatible wrappers used by app/api/admin/* routes.
    # ------------------------------------------------------------------

    async def list_organizations(self, q: str | None = None) -> list[dict[str, Any]]:
        payload = await self.get_all_organizations(page=1, page_size=100)
        items = payload.get("items", [])
        if q:
            needle = q.lower().strip()
            items = [item for item in items if (item.get("name") or "").lower().find(needle) >= 0]
        return items

    async def list_users(self, org_id: str | None = None) -> list[dict[str, Any]]:
        payload = await self.get_all_users(page=1, page_size=200)
        items = payload.get("items", [])
        if org_id:
            items = [item for item in items if item.get("organization_id") == org_id]
        return items

    async def list_properties(self, org_id: str | None = None) -> list[dict[str, Any]]:
        payload = await self.get_all_properties(page=1, page_size=200)
        items = payload.get("items", [])
        if org_id:
            items = [item for item in items if item.get("organization_id") == org_id]
        return items

    async def list_audit_logs(
        self,
        org_id: str | None = None,
        user_id: str | None = None,
        event_type: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
    ) -> list[dict[str, Any]]:
        filters: dict[str, Any] = {}
        if org_id:
            filters["organization_id"] = org_id
        if user_id:
            filters["actor_id"] = user_id
        if event_type:
            filters["event_type"] = event_type
        if date_from:
            filters["created_at_gte"] = date_from
        if date_to:
            filters["created_at_lte"] = date_to

        payload = await self.get_audit_logs(page=1, page_size=200, filters=filters)
        return payload.get("items", [])

    async def get_usage_metrics(self, org_id: str | None = None) -> dict[str, Any]:
        payload = await self.get_usage_metering(page=1, page_size=200)
        items = payload.get("items", [])
        if org_id:
            for item in items:
                if item.get("organization_id") == org_id:
                    return item
            return {"organization_id": org_id, "scan_count": 0, "prediction_count": 0}

        total_scans = sum(int(item.get("scan_count") or 0) for item in items)
        total_predictions = sum(int(item.get("prediction_count") or 0) for item in items)
        return {
            "scan_count": total_scans,
            "prediction_count": total_predictions,
            "organizations": len(items),
        }
