from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import TenantContext, get_tenant_context
from app.main import app


def _sample_item(*, property_id: str, item_id: str | None = None) -> dict:
    now = datetime.now(UTC).isoformat()
    return {
        "id": item_id or str(uuid4()),
        "property_id": property_id,
        "name": "Milk",
        "description": None,
        "sku": "MILK-1L",
        "barcode": None,
        "unit": "unit",
        "quantity": "5",
        "min_quantity": "1",
        "max_quantity": None,
        "reorder_point": "1",
        "cost_per_unit": "2.50",
        "supplier_info": {},
        "metadata": {},
        "is_active": True,
        "last_scanned_at": None,
        "created_at": now,
        "updated_at": now,
        "category": None,
        "vendor_id": None,
        "average_daily_usage": "0",
        "auto_reorder_enabled": False,
        "safety_buffer": "0",
    }


@pytest.fixture
async def client_with_tenant():
    tenant = TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="staff",
        jwt="test-token",
    )

    async def _tenant_override() -> TenantContext:
        return tenant

    app.dependency_overrides[get_tenant_context] = _tenant_override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client, tenant
    finally:
        app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_get_inventory_empty_returns_200_array(monkeypatch, client_with_tenant):
    client, _tenant = client_with_tenant
    monkeypatch.setattr("app.api.routes.inventory.inventory_service.list_items", AsyncMock(return_value=[]))

    response = await client.get("/api/inventory/")

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.anyio
async def test_get_inventory_with_items_returns_200(monkeypatch, client_with_tenant):
    client, tenant = client_with_tenant
    item = {
        "id": str(uuid4()),
        "name": "Milk",
        "sku": "MILK-1L",
        "quantity": "5",
        "unit": "unit",
        "stock_status": "normal",
        "reorder_point": "1",
        "updated_at": datetime.now(UTC).isoformat(),
        "category_name": None,
        "vendor_id": None,
        "average_daily_usage": "0",
    }
    monkeypatch.setattr("app.api.routes.inventory.inventory_service.list_items", AsyncMock(return_value=[item]))

    response = await client.get("/api/inventory/")

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert body[0]["name"] == "Milk"
    assert body[0]["stock_status"] in {"normal", "low_stock", "out_of_stock", "overstocked"}


@pytest.mark.anyio
async def test_create_inventory_item_returns_schema_valid_response(monkeypatch, client_with_tenant):
    client, tenant = client_with_tenant
    item = _sample_item(property_id=str(tenant.property_id))
    monkeypatch.setattr("app.api.routes.inventory.inventory_service.create_item", AsyncMock(return_value=item))

    payload = {
        "property_id": str(tenant.property_id),
        "name": "Milk",
        "unit": "unit",
        "quantity": 5,
        "min_quantity": 1,
    }
    response = await client.post("/api/inventory/", json=payload)

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Milk"
    assert body["property_id"] == str(tenant.property_id)


@pytest.mark.anyio
async def test_update_inventory_item_by_id_returns_schema_valid_response(monkeypatch, client_with_tenant):
    client, tenant = client_with_tenant
    item_id = str(uuid4())
    item = _sample_item(property_id=str(tenant.property_id), item_id=item_id)
    item["name"] = "Milk Updated"
    monkeypatch.setattr("app.api.routes.inventory.inventory_service.update_item", AsyncMock(return_value=item))

    response = await client.patch(f"/api/inventory/{item_id}", json={"name": "Milk Updated"})

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == item_id
    assert body["name"] == "Milk Updated"


@pytest.mark.anyio
async def test_category_missing_shape_does_not_500(monkeypatch):
    from app.services.inventory_service import InventoryService

    service = InventoryService()
    tenant = TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="staff",
        jwt="test-token",
    )

    repo = type("Repo", (), {
        "list_items": AsyncMock(return_value=[
            {
                "id": str(uuid4()),
                "name": "Coffee",
                "quantity": "3",
                "unit": "kg",
                "min_quantity": "1",
                "category": [],
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ])
    })()

    monkeypatch.setattr("app.services.inventory_service.get_inventory_repository", AsyncMock(return_value=repo))

    rows = await service.list_items(tenant=tenant)

    assert len(rows) == 1
    assert rows[0].category_name is None
    assert rows[0].name == "Coffee"
