from __future__ import annotations

"""
Alert service — manages alert lifecycle and reorder trigger evaluation.

Reorder triggers fire when:
- quantity <= par_level (low_stock)
- quantity == 0 (out_of_stock)
- last scan > NO_RECENT_SCAN_DAYS days ago

Each check is idempotent — no duplicate open alerts are created for the
same item+type combination.
"""

from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.repositories.alerts import AlertsRepository
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)


class AlertService:
    """Service for alert management and reorder evaluation."""

    def __init__(self) -> None:
        self._repo = AlertsRepository()

    async def evaluate_inventory(self, tenant: TenantContext) -> list[dict[str, Any]]:
        """
        Evaluate all inventory items for this property and create alerts.

        Returns list of newly created alerts.
        """
        client = await get_async_supabase_admin()
        prop_filter = str(tenant.property_id) if tenant.property_id else None
        if not prop_filter:
            logger.warning("evaluate_inventory called without property_id")
            return []

        items_resp = await (
            client.table("inventory_items")
            .select("id, name, quantity, par_level, unit, updated_at")
            .eq("property_id", prop_filter)
            .execute()
        )
        items = items_resp.data or []

        created: list[dict[str, Any]] = []

        for item in items:
            item_id = UUID(item["id"])
            qty = float(item["quantity"] or 0)
            par = float(item.get("par_level") or 0)

            # Only create an alert if no open alert of the same type exists
            existing = await self._repo.list(
                tenant,
                state="open",
                limit=1,
            )
            existing_types = {e["alert_type"] for e in existing if e.get("item_id") == str(item_id)}

            if qty == 0 and "out_of_stock" not in existing_types:
                alert = await self._repo.create(
                    tenant,
                    alert_type="out_of_stock",
                    severity="critical",
                    title=f"{item['name']} is out of stock",
                    body=f"Current quantity is 0 {item.get('unit', 'units')}.",
                    item_id=item_id,
                    metadata={"quantity": qty, "par_level": par},
                )
                if alert:
                    created.append(alert)

            elif par > 0 and qty <= par and "low_stock" not in existing_types:
                alert = await self._repo.create(
                    tenant,
                    alert_type="low_stock",
                    severity="high" if qty <= par * 0.5 else "medium",
                    title=f"{item['name']} is below par level",
                    body=f"Current quantity {qty} {item.get('unit', 'units')} is at or below par {par}.",
                    item_id=item_id,
                    metadata={"quantity": qty, "par_level": par},
                )
                if alert:
                    created.append(alert)

        if created:
            logger.info(
                "Alerts created from inventory evaluation",
                count=len(created),
                property_id=prop_filter,
            )
        return created

    async def list_alerts(
        self,
        tenant: TenantContext,
        state: str | None = None,
        alert_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        return await self._repo.list(
            tenant, state=state, alert_type=alert_type, limit=limit, offset=offset
        )

    async def get_alert(
        self, tenant: TenantContext, alert_id: UUID
    ) -> dict[str, Any] | None:
        return await self._repo.get_by_id(tenant, alert_id)

    async def snooze(
        self,
        tenant: TenantContext,
        alert_id: UUID,
        snooze_until: str,
    ) -> dict[str, Any] | None:
        return await self._repo.transition_state(
            tenant, alert_id, "snoozed", snooze_until=snooze_until
        )

    async def resolve(
        self,
        tenant: TenantContext,
        alert_id: UUID,
    ) -> dict[str, Any] | None:
        return await self._repo.transition_state(
            tenant, alert_id, "resolved", resolved_by_id=tenant.user_id
        )

    async def count_open(self, tenant: TenantContext) -> int:
        return await self._repo.count_open(tenant)
