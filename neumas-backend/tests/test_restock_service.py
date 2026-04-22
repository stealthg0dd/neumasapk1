from __future__ import annotations

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.api.deps import TenantContext
from app.services.restock_service import RestockService


@pytest.mark.anyio
async def test_restock_export_empty_when_vendor_not_found(monkeypatch):
    tenant = TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="staff",
        jwt="token",
    )

    svc = RestockService()
    monkeypatch.setattr(
        RestockService,
        "get_vendor_restock_preview",
        AsyncMock(return_value={"vendors": [], "runout_threshold_days": 7, "generated_at": "2026-01-01T00:00:00Z"}),
    )

    result = await svc.generate_vendor_order_export(tenant, vendor_id=str(uuid4()), runout_threshold_days=7)
    assert result["html"] == ""
    assert "No restock items" in result["email_body"]


@pytest.mark.anyio
async def test_restock_export_includes_vendor_email_subject(monkeypatch):
    tenant = TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="staff",
        jwt="token",
    )

    vendor_id = str(uuid4())
    svc = RestockService()
    monkeypatch.setattr(
        RestockService,
        "get_vendor_restock_preview",
        AsyncMock(
            return_value={
                "runout_threshold_days": 7,
                "generated_at": "2026-01-01T00:00:00Z",
                "vendors": [
                    {
                        "vendor": {
                            "id": vendor_id,
                            "name": "Acme Foods",
                            "contact_email": "orders@acme.test",
                            "contact_phone": None,
                            "address": None,
                            "website": None,
                        },
                        "items": [
                            {
                                "item_id": str(uuid4()),
                                "name": "Milk",
                                "unit": "unit",
                                "needed_quantity": 8,
                                "current_quantity": 1,
                                "average_daily_usage": 1.2,
                                "unit_cost": 2.5,
                                "estimated_cost": 20.0,
                                "runout_days": 1.0,
                                "reorder_point": 9,
                                "auto_reorder_enabled": True,
                            }
                        ],
                        "total_estimated_cost": 20.0,
                        "item_count": 1,
                    }
                ],
            }
        ),
    )

    result = await svc.generate_vendor_order_export(tenant, vendor_id=vendor_id, runout_threshold_days=7)
    assert "Purchase Order Preview" in result["html"]
    assert "Acme Foods" in result["email_subject"]
    assert "Milk" in result["email_body"]
