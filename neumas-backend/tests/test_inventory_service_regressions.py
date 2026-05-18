from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.api.deps import TenantContext
from app.schemas.inventory import InventoryItemUpdate, InventoryUpdateRequest
from app.services.inventory_service import InventoryService


@pytest.mark.anyio
async def test_upsert_item_by_name_returns_required_item_name(monkeypatch):
    service = InventoryService()
    tenant = TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="staff",
        jwt="test-token",
    )

    existing_id = uuid4()
    repo = SimpleNamespace(
        get_by_name=AsyncMock(return_value={"id": str(existing_id), "quantity": "2"}),
        update=AsyncMock(return_value={"id": str(existing_id)}),
        create=AsyncMock(),
    )
    monkeypatch.setattr(
        "app.services.inventory_service.get_inventory_repository",
        AsyncMock(return_value=repo),
    )
    monkeypatch.setattr(
        "app.services.inventory_service.celery_app.send_task",
        lambda *args, **kwargs: SimpleNamespace(id="task-123"),
    )

    req = InventoryUpdateRequest(
        property_id=tenant.property_id,
        item_name="Milk 1L",
        new_qty="5",
        unit="unit",
        trigger_prediction=True,
    )

    response = await service.upsert_item_by_name(req, tenant)

    assert response.item_name == "Milk 1L"
    assert response.item_id == existing_id
    assert str(response.new_qty) == "5"


@pytest.mark.anyio
async def test_update_item_by_id_uses_patch_shape_and_strips_uuid_fields(monkeypatch):
    service = InventoryService()
    tenant = TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="staff",
        jwt="test-token",
    )

    item_id = uuid4()
    vendor_id = uuid4()
    category_id = uuid4()

    repo = SimpleNamespace(
        get_by_id=AsyncMock(return_value={"id": str(item_id), "property_id": str(tenant.property_id), "name": "Coffee", "quantity": "1", "min_quantity": "0", "unit": "unit", "supplier_info": {}, "metadata": {}, "is_active": True, "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z"}),
        update=AsyncMock(return_value={"id": str(item_id)}),
    )
    monkeypatch.setattr(
        "app.services.inventory_service.get_inventory_repository",
        AsyncMock(return_value=repo),
    )

    sentinel = object()
    monkeypatch.setattr(service, "get_item", AsyncMock(return_value=sentinel))

    updates = InventoryItemUpdate(
        name="Coffee Beans",
        vendor_id=vendor_id,
        category_id=category_id,
    )

    result = await service.update_item(item_id=item_id, updates=updates, tenant=tenant)

    assert result is sentinel
    repo.update.assert_awaited_once()
    call = repo.update.await_args
    assert call.kwargs["item_id"] == item_id
    assert call.kwargs["data"]["vendor_id"] == str(vendor_id)
    assert call.kwargs["data"]["category_id"] == str(category_id)
