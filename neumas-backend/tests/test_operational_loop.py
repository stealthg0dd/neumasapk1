from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.api.deps import TenantContext


@pytest.fixture
def tenant() -> TenantContext:
    return TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="admin",
        jwt="test-jwt",
    )


@pytest.mark.asyncio
async def test_predictions_route_normalizes_recommendation_fields(tenant: TenantContext):
    from app.api.routes.predictions import list_predictions

    prediction_date = (datetime.now(UTC) + timedelta(days=3)).isoformat()
    repo = AsyncMock()
    repo.get_by_property.return_value = [
        {
            "id": str(uuid4()),
            "item_id": str(uuid4()),
            "prediction_type": "stockout",
            "prediction_date": prediction_date,
            "confidence": 0.91,
            "stockout_risk_level": "critical",
            "inventory_item": {"id": str(uuid4()), "name": "Milk"},
        }
    ]

    with patch("app.api.routes.predictions.get_predictions_repository", new=AsyncMock(return_value=repo)):
        rows = await list_predictions(tenant=tenant, urgency=None, limit=10)

    assert rows[0]["item_name"] == "Milk"
    assert rows[0]["recommended_action"] == "Add to shopping list"
    assert rows[0]["days_until_runout"] is not None


@pytest.mark.asyncio
async def test_scan_service_rerun_with_hint_returns_queue_status(tenant: TenantContext):
    from app.services.scan_service import ScanService

    svc = ScanService()
    scan_id = uuid4()

    with (
        patch("app.services.scan_service.get_scans_repository", new=AsyncMock()) as repo_factory,
        patch("app.services.scan_service.asyncio.create_task") as create_task,
    ):
        repo = AsyncMock()
        repo.get_by_id.return_value = {"id": str(scan_id)}
        repo_factory.return_value = repo
        create_task.side_effect = lambda coro: (coro.close(), AsyncMock())[1]
        response = await svc.rerun_with_hint(scan_id, tenant, "Treat sprite as 24 cans")

    assert response["scan_id"] == str(scan_id)
    assert response["status"] == "queued"
    assert response["hint"] == "Treat sprite as 24 cans"
    create_task.assert_called_once()


class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, db, table: str):
        self.db = db
        self.table = table
        self.op = "select"
        self.payload = None
        self.filters = []
        self._single = False

    def select(self, *_args, **_kwargs):
        self.op = "select"
        return self

    def insert(self, payload):
        self.op = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.op = "update"
        self.payload = payload
        return self

    def eq(self, key, value):
        self.filters.append(("eq", key, value))
        return self

    def in_(self, key, values):
        self.filters.append(("in", key, list(values)))
        return self

    def gte(self, *_args):
        return self

    def lte(self, *_args):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args):
        return self

    def single(self):
        self._single = True
        return self

    async def execute(self):
        return self.db.execute(self)


class _FakeOperationalSupabase:
    def __init__(self, property_id: str, org_id: str):
        self.property_id = property_id
        self.org_id = org_id
        self.inventory_item_id: str | None = None
        self.shopping_lists: list[dict] = []
        self.shopping_list_items: list[dict] = []

    def table(self, name: str):
        return _Query(self, name)

    def execute(self, q: _Query):
        if q.table == "inventory_items" and q.op == "select":
            return _Resp([{"id": self.inventory_item_id or str(uuid4()), "name": "Milk"}])

        if q.table == "properties" and q.op == "select":
            return _Resp({"organization_id": self.org_id})

        if q.table == "shopping_lists":
            if q.op == "insert":
                payload = dict(q.payload or {})
                self.shopping_lists.append(payload)
                return _Resp([payload])
            if q.op == "update":
                target_id = next((value for op, key, value in q.filters if op == "eq" and key == "id"), None)
                for row in self.shopping_lists:
                    if row.get("id") == target_id:
                        row.update(q.payload or {})
                        return _Resp([row])
                return _Resp([])
            if q.op == "select":
                target_id = next((value for op, key, value in q.filters if op == "eq" and key == "id"), None)
                for row in self.shopping_lists:
                    if row.get("id") == target_id:
                        return _Resp({**row, "items": list(self.shopping_list_items)})
                return _Resp(None)

        if q.table == "shopping_list_items" and q.op == "insert":
            rows = list(q.payload or [])
            self.shopping_list_items.extend(rows)
            return _Resp(rows)

        return _Resp([])


@pytest.mark.asyncio
async def test_alert_service_list_enriches_operational_fields(tenant: TenantContext):
    from app.services.alert_service import AlertService

    service = AlertService()
    service._repo = AsyncMock()
    item_id = str(uuid4())
    service._repo.list.return_value = [
        {
            "id": str(uuid4()),
            "organization_id": str(tenant.org_id),
            "property_id": str(tenant.property_id),
            "item_id": item_id,
            "alert_type": "predicted_stockout",
            "severity": "high",
            "state": "open",
            "title": "Milk predicted to stock out soon",
            "body": "Projected depletion in 2 days.",
            "metadata": {"days_until_stockout": 2, "last_scan_at": "2026-04-22T00:00:00Z"},
            "created_at": "2026-04-23T00:00:00Z",
        }
    ]

    fake_supabase = _FakeOperationalSupabase(str(tenant.property_id), str(tenant.org_id))
    fake_supabase.inventory_item_id = item_id

    with patch("app.services.alert_service.get_async_supabase_admin", new=AsyncMock(return_value=fake_supabase)):
        rows = await service.list_alerts(tenant, state="open", sort_by="severity")

    assert rows[0]["item_name"] == "Milk"
    assert rows[0]["recommended_action"]
    assert "Projected stockout" in str(rows[0]["baseline_context"])


@pytest.mark.asyncio
async def test_shopping_agent_generates_list_from_prediction_data(tenant: TenantContext):
    from app.services.shopping_agent import ShoppingAgent

    fake_supabase = _FakeOperationalSupabase(str(tenant.property_id), str(tenant.org_id))
    inventory_repo = AsyncMock()
    inventory_repo.get_low_stock_items_admin.return_value = [
        {
            "id": str(uuid4()),
            "name": "Coffee Beans",
            "quantity": "1",
            "min_quantity": "4",
            "unit": "bag",
            "cost_per_unit": "14.50",
        }
    ]
    predictions_repo = AsyncMock()
    predictions_repo.get_stockout_predictions_admin.return_value = [
        {
            "id": str(uuid4()),
            "prediction_type": "stockout",
            "prediction_date": "2026-04-25T00:00:00Z",
            "predicted_value": "6",
            "stockout_risk_level": "critical",
            "inventory_item": {
                "id": str(uuid4()),
                "name": "Milk",
                "quantity": "1",
                "min_quantity": "6",
                "unit": "unit",
                "cost_per_unit": "2.50",
                "category_id": None,
            },
        }
    ]

    with (
        patch("app.services.shopping_agent.get_async_supabase_admin", new=AsyncMock(return_value=fake_supabase)),
        patch("app.services.shopping_agent.get_inventory_repository", new=AsyncMock(return_value=inventory_repo)),
        patch("app.services.shopping_agent.get_predictions_repository", new=AsyncMock(return_value=predictions_repo)),
        patch("app.services.shopping_agent.call_agent", new=AsyncMock(return_value={"error": "skip"})),
    ):
        result = await ShoppingAgent().generate_shopping_list(
            property_id=tenant.property_id,
            user_id=tenant.user_id,
            include_low_stock=True,
            include_predictions=True,
            days_ahead=7,
            budget_limit=None,
            exclude_categories=None,
            group_by_store=False,
            include_critical_only=False,
        )

    assert result["generation_summary"]["low_stock_items_added"] == 1
    assert result["generation_summary"]["predicted_needs_added"] == 1
    assert len(fake_supabase.shopping_lists) == 1
    assert len(fake_supabase.shopping_list_items) == 2
    assert any(item.get("source") == "prediction" for item in fake_supabase.shopping_list_items)
    assert any(item.get("priority") == "critical" for item in fake_supabase.shopping_list_items)
