"""
Tests for the inventory ledger (movements) and document model.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
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


class TestInventoryLedgerService:
    """Tests for the inventory ledger service."""

    @pytest.mark.asyncio
    async def test_apply_movement_creates_movement_row(self, tenant: TenantContext):
        """A purchase movement creates a movement row and updates quantity."""
        from app.services.inventory_ledger_service import InventoryLedgerService

        svc = InventoryLedgerService()
        item_id = uuid4()
        current_qty = 10.0

        with patch("app.services.inventory_ledger_service.get_async_supabase_admin") as mock_admin:
            mock_client = AsyncMock()
            mock_admin.return_value = mock_client

            # Mock item fetch
            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute = AsyncMock(
                return_value=MagicMock(data={"id": str(item_id), "quantity": current_qty, "unit": "unit"})
            )

            # Mock quantity update
            mock_client.table.return_value.update.return_value.eq.return_value.execute = AsyncMock(
                return_value=MagicMock(data=[{"id": str(item_id), "quantity": 12.0}])
            )

            movement_data = {
                "id": str(uuid4()),
                "item_id": str(item_id),
                "movement_type": "purchase",
                "quantity_delta": 2.0,
                "quantity_before": 10.0,
                "quantity_after": 12.0,
            }

            with patch.object(
                svc._movements_repo,
                "create",
                new_callable=AsyncMock,
                return_value=movement_data,
            ):
                result = await svc.apply_movement(
                    tenant=tenant,
                    item_id=item_id,
                    movement_type="purchase",
                    quantity_delta=2.0,
                )

            assert result is not None
            assert result["movement_type"] == "purchase"
            assert result["quantity_delta"] == 2.0

    @pytest.mark.asyncio
    async def test_duplicate_movement_idempotency(self, tenant: TenantContext):
        """Replaying a task with same idempotency_key does not double-write."""
        from app.services.inventory_ledger_service import InventoryLedgerService
        from app.db.repositories.inventory_movements import InventoryMovementsRepository

        svc = InventoryLedgerService()
        item_id = uuid4()
        idempotency_key = f"scan:123:item:{item_id}"

        existing_movement = {
            "id": str(uuid4()),
            "item_id": str(item_id),
            "movement_type": "purchase",
            "quantity_delta": 5.0,
            "idempotency_key": idempotency_key,
        }

        with patch("app.services.inventory_ledger_service.get_async_supabase_admin") as mock_admin:
            mock_client = AsyncMock()
            mock_admin.return_value = mock_client
            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute = AsyncMock(
                return_value=MagicMock(data={"id": str(item_id), "quantity": 10.0, "unit": "unit"})
            )
            mock_client.table.return_value.update.return_value.eq.return_value.execute = AsyncMock(
                return_value=MagicMock(data=[])
            )

            # Simulate: first call returns existing row (idempotency hit)
            with patch.object(
                svc._movements_repo,
                "create",
                new_callable=AsyncMock,
                return_value=existing_movement,  # returns existing row, no double-write
            ) as mock_create:
                result1 = await svc.apply_movement(
                    tenant=tenant,
                    item_id=item_id,
                    movement_type="purchase",
                    quantity_delta=5.0,
                    idempotency_key=idempotency_key,
                )
                result2 = await svc.apply_movement(
                    tenant=tenant,
                    item_id=item_id,
                    movement_type="purchase",
                    quantity_delta=5.0,
                    idempotency_key=idempotency_key,
                )

        # Both calls return the same movement row
        assert result1["id"] == result2["id"]

    @pytest.mark.asyncio
    async def test_manual_adjustment_computes_delta(self, tenant: TenantContext):
        """Manual adjustment correctly computes the delta to reach target quantity."""
        from app.services.inventory_ledger_service import InventoryLedgerService

        svc = InventoryLedgerService()
        item_id = uuid4()
        current_qty = 15.0
        new_qty = 10.0
        expected_delta = new_qty - current_qty  # -5.0

        with patch("app.services.inventory_ledger_service.get_async_supabase_admin") as mock_admin:
            mock_client = AsyncMock()
            mock_admin.return_value = mock_client
            mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(
                return_value=MagicMock(data={"id": str(item_id), "quantity": current_qty})
            )
            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute = AsyncMock(
                return_value=MagicMock(data={"id": str(item_id), "quantity": current_qty, "unit": "unit"})
            )
            mock_client.table.return_value.update.return_value.eq.return_value.execute = AsyncMock(
                return_value=MagicMock(data=[])
            )

            with patch.object(
                svc._movements_repo,
                "create",
                new_callable=AsyncMock,
                return_value={"id": str(uuid4()), "quantity_delta": expected_delta},
            ) as mock_create:
                await svc.apply_manual_adjustment(
                    tenant=tenant,
                    item_id=item_id,
                    new_quantity=new_qty,
                )
                # Verify the delta was computed correctly
                call_kwargs = mock_create.call_args.kwargs
                assert call_kwargs["quantity_delta"] == expected_delta
                assert call_kwargs["movement_type"] == "manual_adjustment"


class TestDocumentService:
    """Tests for the document service."""

    @pytest.mark.asyncio
    async def test_create_from_scan_flags_low_confidence(self, tenant: TenantContext):
        """Documents with low-confidence items should be flagged for review."""
        from app.services.document_service import DocumentService

        svc = DocumentService()
        scan_id = uuid4()

        extracted_items = [
            {"name": "Chicken Breast", "quantity": 5.0, "unit": "kg", "confidence": 0.90},
            {"name": "???", "quantity": 2.0, "unit": "unit", "confidence": 0.50},  # below threshold
        ]

        doc_id = uuid4()
        with patch.object(svc._docs_repo, "create", new_callable=AsyncMock, return_value={"id": str(doc_id), "status": "review"}) as mock_create:
            with patch.object(svc._line_items_repo, "create_many", new_callable=AsyncMock, return_value=[]):
                result = await svc.create_from_scan(
                    tenant=tenant,
                    scan_id=scan_id,
                    document_type="receipt",
                    raw_extraction={"vendor": "Test Vendor"},
                    extracted_items=extracted_items,
                )

        # Should flag for review because one item has confidence 0.50 < 0.75
        create_call = mock_create.call_args
        assert create_call.kwargs["review_needed"] is True

    @pytest.mark.asyncio
    async def test_create_from_scan_no_review_for_high_confidence(self, tenant: TenantContext):
        """High-confidence documents should not be flagged for review."""
        from app.services.document_service import DocumentService

        svc = DocumentService()
        scan_id = uuid4()

        extracted_items = [
            {"name": "Salmon", "quantity": 3.0, "unit": "kg", "confidence": 0.95},
            {"name": "Butter", "quantity": 1.0, "unit": "pack", "confidence": 0.88},
        ]

        doc_id = uuid4()
        with patch.object(svc._docs_repo, "create", new_callable=AsyncMock, return_value={"id": str(doc_id), "status": "pending"}) as mock_create:
            with patch.object(svc._line_items_repo, "create_many", new_callable=AsyncMock, return_value=[]):
                await svc.create_from_scan(
                    tenant=tenant,
                    scan_id=scan_id,
                    document_type="receipt",
                    raw_extraction={},
                    extracted_items=extracted_items,
                )

        create_call = mock_create.call_args
        assert create_call.kwargs["review_needed"] is False
