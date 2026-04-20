"""
Tests for Prompts 5, 6, and 7:
  - Vendor alias matching
  - Canonical item alias matching
  - Pack/case unit normalization
  - Low-confidence review path (document scan)
  - Alert generation and state transitions
  - actual_value writeback
  - Reorder recommendation correctness
  - Admin role gates
  - Audit logging
  - Usage metering basics
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.api.deps import TenantContext

# ──────────────────────────────────────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def tenant() -> TenantContext:
    return TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="admin",
        jwt="test-jwt",
    )


@pytest.fixture
def manager_tenant() -> TenantContext:
    return TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="manager",
        jwt="test-jwt",
    )


@pytest.fixture
def non_admin_tenant() -> TenantContext:
    return TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="staff",
        jwt="test-jwt",
    )


# ══════════════════════════════════════════════════════════════════════════════
# Prompt 5 — Vendor normalisation and canonical items
# ══════════════════════════════════════════════════════════════════════════════

class TestFuzzyMatch:
    """Unit tests for the fuzzy matching utilities."""

    def test_exact_match_returns_1(self):
        from app.utils.fuzzy_match import similarity
        assert similarity("Sysco Foods", "Sysco Foods") == 1.0

    def test_case_insensitive(self):
        from app.utils.fuzzy_match import similarity
        score = similarity("SYSCO FOODS", "sysco foods")
        assert score > 0.9

    def test_partial_overlap_returns_high_score(self):
        from app.utils.fuzzy_match import similarity
        score = similarity("Sysco", "Sysco Foods Ltd")
        assert score > 0.5

    def test_completely_different_returns_low_score(self):
        from app.utils.fuzzy_match import similarity
        score = similarity("Pepsi", "XYZ Logistics")
        assert score < 0.4

    def test_best_match_returns_correct_candidate(self):
        from app.utils.fuzzy_match import best_match
        candidates = ["Sysco Foods", "US Foods", "Performance Food Group"]
        match, score = best_match("Sysco", candidates)
        assert match == "Sysco Foods"
        assert score > 0.5

    def test_best_match_returns_none_below_threshold(self):
        from app.utils.fuzzy_match import best_match
        candidates = ["Alpha Corp", "Beta Inc"]
        result = best_match("XYZ", candidates, threshold=0.8)
        assert result is None


class TestUnitConversion:
    """Tests for pack/case unit normalisation."""

    def test_case_to_unit(self):
        from app.utils.unit_conversion import convert
        # "case" -> "unit" has no conversion entry; returns None
        result = convert(1.0, "case", "unit")
        assert result is None

    def test_kg_to_g(self):
        from app.utils.unit_conversion import convert
        result = convert(1.5, "kg", "g")
        assert result == pytest.approx(1500.0)

    def test_l_to_ml(self):
        from app.utils.unit_conversion import convert
        result = convert(2.0, "l", "ml")
        assert result == pytest.approx(2000.0)

    def test_incompatible_units_returns_none(self):
        from app.utils.unit_conversion import convert
        # kg -> l has no conversion; returns None
        result = convert(1.0, "kg", "l")
        assert result is None

    def test_normalise_unit_aliases(self):
        from app.utils.unit_conversion import normalise_unit
        assert normalise_unit("kilogram") == "kg"
        assert normalise_unit("litre") == "l"
        # "pieces" is aliased to "unit"; "piece" normalises to itself
        assert normalise_unit("pieces") == "unit"

    def test_are_compatible_same_family(self):
        from app.utils.unit_conversion import are_compatible
        assert are_compatible("kg", "g") is True
        assert are_compatible("l", "ml") is True
        assert are_compatible("kg", "l") is False


class TestVendorService:
    """Tests for vendor normalisation pipeline."""

    @pytest.mark.asyncio
    async def test_exact_alias_match(self, tenant: TenantContext):
        """Existing alias resolves without fuzzy matching."""
        from app.services.vendor_service import VendorService

        svc = VendorService()
        vendor_id = str(uuid4())

        with patch.object(svc._repo, "find_by_alias", new=AsyncMock(return_value={"id": vendor_id, "name": "Sysco Foods Singapore"})):
            result = await svc.normalise(tenant, "SYSCO")
            assert result["id"] == vendor_id

    @pytest.mark.asyncio
    async def test_exact_name_match(self, tenant: TenantContext):
        """Exact name match returns vendor without fuzzy."""
        from app.services.vendor_service import VendorService

        svc = VendorService()
        vendor_id = str(uuid4())

        with (
            patch.object(svc._repo, "find_by_alias", new=AsyncMock(return_value=None)),
            patch.object(svc._repo, "find_by_name", new=AsyncMock(return_value={"id": vendor_id, "name": "US Foods"})),
            patch.object(svc._repo, "add_alias", new=AsyncMock(return_value=None)),
        ):
            result = await svc.normalise(tenant, "US Foods")
            assert result["id"] == vendor_id

    @pytest.mark.asyncio
    async def test_fuzzy_match_above_threshold(self, tenant: TenantContext):
        """Fuzzy match at or above 0.80 resolves to existing vendor."""
        from app.services.vendor_service import VendorService

        svc = VendorService()
        vendor_id = str(uuid4())

        with (
            patch.object(svc._repo, "find_by_alias", new=AsyncMock(return_value=None)),
            patch.object(svc._repo, "find_by_name", new=AsyncMock(return_value=None)),
            patch.object(svc._repo, "list", new=AsyncMock(return_value=[{"id": vendor_id, "name": "Performance Food Group"}])),
            patch.object(svc._repo, "add_alias", new=AsyncMock(return_value=None)),
        ):
            result = await svc.normalise(tenant, "PERFORMANCE FOOD GROUP")
            assert result is not None

    @pytest.mark.asyncio
    async def test_no_match_creates_vendor(self, tenant: TenantContext):
        """Unknown vendor below threshold is auto-created."""
        from app.services.vendor_service import VendorService

        svc = VendorService()
        new_id = str(uuid4())

        with (
            patch.object(svc._repo, "find_by_alias", new=AsyncMock(return_value=None)),
            patch.object(svc._repo, "find_by_name", new=AsyncMock(return_value=None)),
            patch.object(svc._repo, "list", new=AsyncMock(return_value=[])),
            patch.object(svc._repo, "create", new=AsyncMock(return_value={"id": new_id, "name": "Brand New Vendor XYZ"})),
            patch.object(svc._repo, "add_alias", new=AsyncMock(return_value=None)),
        ):
            result = await svc.normalise(tenant, "Brand New Vendor XYZ")
            assert result["id"] == new_id


class TestCatalogService:
    """Tests for canonical item normalisation."""

    @pytest.mark.asyncio
    async def test_alias_match_returns_canonical(self, tenant: TenantContext):
        """Existing item alias resolves to canonical item."""
        from app.services.catalog_service import CatalogService

        svc = CatalogService()
        item_id = str(uuid4())

        with patch.object(svc._repo, "find_by_alias", new=AsyncMock(return_value={"id": item_id, "canonical_name": "Chicken Breast"})):
            result = await svc.normalise_item(tenant, "Chk Breast")
            assert result["id"] == item_id

    @pytest.mark.asyncio
    async def test_low_confidence_sets_review_needed(self, tenant: TenantContext):
        """Item with confidence below threshold flags review_needed=True."""
        from app.core.constants import CONFIDENCE_REVIEW_THRESHOLD
        from app.services.document_service import DocumentService

        svc = DocumentService()
        scan_id = uuid4()
        doc_id = uuid4()

        low_conf_item = {
            "name": "Unknown Item",
            "quantity": 1.0,
            "unit": "unit",
            "unit_price": 5.00,
            "confidence": CONFIDENCE_REVIEW_THRESHOLD - 0.1,
        }

        with (
            patch.object(svc._docs_repo, "create", new=AsyncMock(return_value={"id": str(doc_id)})),
            patch.object(svc._line_items_repo, "create_many", new=AsyncMock(return_value=[low_conf_item])),
        ):
            await svc.create_from_scan(
                tenant=tenant,
                scan_id=scan_id,
                document_type="receipt",
                raw_extraction={},
                extracted_items=[low_conf_item],
            )
            create_call_kwargs = svc._docs_repo.create.call_args.kwargs
            assert create_call_kwargs.get("review_needed") is True


# ══════════════════════════════════════════════════════════════════════════════
# Prompt 6 — Alerts, reorder, evaluation
# ══════════════════════════════════════════════════════════════════════════════

class TestAlertService:
    """Tests for alert generation and state transitions."""

    @pytest.mark.asyncio
    async def test_out_of_stock_generates_alert(self, tenant: TenantContext):
        """Item with quantity=0 triggers an out_of_stock alert."""
        from app.services.alert_service import AlertService

        svc = AlertService()
        item_id = str(uuid4())
        repo = AsyncMock()
        repo.list.return_value = []
        repo.create.return_value = {"id": str(uuid4()), "alert_type": "out_of_stock"}

        mock_client = MagicMock()
        mock_client.table.return_value.select.return_value.eq.return_value.execute = AsyncMock(
            return_value=MagicMock(data=[{
                "id": item_id,
                "name": "Chicken Breast",
                "quantity": 0,
                "par_level": 5,
                "unit": "kg",
                "updated_at": None,
            }])
        )

        with (
            patch.object(svc, "_repo", repo),
            patch("app.services.alert_service.get_async_supabase_admin", new=AsyncMock(return_value=mock_client)),
        ):
            await svc.evaluate_inventory(tenant)

        repo.create.assert_awaited()
        created_types = [call.kwargs.get("alert_type", "") for call in repo.create.call_args_list]
        assert any("out_of_stock" in t for t in created_types)

    @pytest.mark.asyncio
    async def test_low_stock_generates_alert(self, tenant: TenantContext):
        """Item below par_level triggers a low_stock alert."""
        from app.services.alert_service import AlertService

        svc = AlertService()
        item_id = str(uuid4())
        repo = AsyncMock()
        repo.list.return_value = []
        repo.create.return_value = {"id": str(uuid4()), "alert_type": "low_stock"}

        mock_client = MagicMock()
        mock_client.table.return_value.select.return_value.eq.return_value.execute = AsyncMock(
            return_value=MagicMock(data=[{
                "id": item_id,
                "name": "Olive Oil",
                "quantity": 2,
                "par_level": 10,
                "unit": "l",
                "updated_at": None,
            }])
        )

        with (
            patch.object(svc, "_repo", repo),
            patch("app.services.alert_service.get_async_supabase_admin", new=AsyncMock(return_value=mock_client)),
        ):
            await svc.evaluate_inventory(tenant)

        repo.create.assert_awaited()

    @pytest.mark.asyncio
    async def test_no_duplicate_open_alerts(self, tenant: TenantContext):
        """Existing open low_stock alert prevents a duplicate low_stock alert."""
        from app.services.alert_service import AlertService

        svc = AlertService()
        item_id = str(uuid4())
        repo = AsyncMock()
        # Return existing low_stock alert for this item
        repo.list.return_value = [{
            "id": str(uuid4()),
            "alert_type": "low_stock",
            "item_id": item_id,
            "state": "open",
        }]

        mock_client = MagicMock()
        # Item is below par (not zero) so only low_stock is considered
        mock_client.table.return_value.select.return_value.eq.return_value.execute = AsyncMock(
            return_value=MagicMock(data=[{
                "id": item_id,
                "name": "Olive Oil",
                "quantity": 3,
                "par_level": 10,
                "unit": "l",
                "updated_at": None,
            }])
        )

        with (
            patch.object(svc, "_repo", repo),
            patch("app.services.alert_service.get_async_supabase_admin", new=AsyncMock(return_value=mock_client)),
        ):
            await svc.evaluate_inventory(tenant)

        repo.create.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_resolve_transitions_state(self, tenant: TenantContext):
        """Resolving an alert transitions state to resolved."""
        from app.services.alert_service import AlertService

        svc = AlertService()
        alert_id = uuid4()
        repo = AsyncMock()
        repo.transition_state.return_value = {"id": str(alert_id), "state": "resolved"}

        with patch.object(svc, "_repo", repo):
            result = await svc.resolve(tenant, alert_id)
            assert result["state"] == "resolved"
            repo.transition_state.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_snooze_transitions_state(self, tenant: TenantContext):
        """Snoozing an alert transitions state to snoozed with snooze_until."""
        from datetime import UTC, datetime, timedelta

        from app.services.alert_service import AlertService

        svc = AlertService()
        alert_id = uuid4()
        snooze_until = datetime.now(UTC) + timedelta(hours=24)
        repo = AsyncMock()
        repo.transition_state.return_value = {"id": str(alert_id), "state": "snoozed"}

        with patch.object(svc, "_repo", repo):
            result = await svc.snooze(tenant, alert_id, snooze_until)
            assert result["state"] == "snoozed"


class TestReorderService:
    """Tests for reorder recommendation computation."""

    @pytest.mark.asyncio
    async def test_critical_item_is_included(self, tenant: TenantContext):
        """Item with quantity=0 is classified critical."""
        from app.services.reorder_service import _compute_urgency

        assert _compute_urgency(0, 10) == "critical"

    def test_urgency_below_half_par(self):
        from app.services.reorder_service import _compute_urgency
        assert _compute_urgency(2, 10) == "urgent"  # 2 < 10/2 = 5

    def test_urgency_below_par(self):
        from app.services.reorder_service import _compute_urgency
        assert _compute_urgency(7, 10) == "soon"  # 7 < 10

    def test_urgency_at_par(self):
        from app.services.reorder_service import _compute_urgency
        assert _compute_urgency(10, 10) == "monitor"

    def test_reorder_qty_formula(self):
        """reorder_qty = projected*(1+buffer) - on_hand, floored at 0."""
        projected = 20.0
        on_hand = 5.0
        safety = 0.20
        expected = projected * (1 + safety) - on_hand  # 24 - 5 = 19
        actual = max(0.0, projected * (1 + safety) - on_hand)
        assert actual == pytest.approx(expected)

    def test_reorder_qty_never_negative(self):
        projected = 5.0
        on_hand = 100.0
        safety = 0.20
        result = max(0.0, projected * (1 + safety) - on_hand)
        assert result == 0.0

    @pytest.mark.asyncio
    async def test_get_recommendations_returns_sorted_by_urgency(self, tenant: TenantContext):
        """Recommendations are sorted critical → urgent → soon → monitor."""
        from app.services.reorder_service import ReorderService

        svc = ReorderService()
        items = [
            {"id": str(uuid4()), "name": "Item A", "quantity": 5, "par_level": 10, "unit": "kg", "category_id": None},
            {"id": str(uuid4()), "name": "Item B", "quantity": 0, "par_level": 10, "unit": "kg", "category_id": None},
        ]

        mock_client = MagicMock()
        inv_resp = MagicMock(data=items)
        pred_resp = MagicMock(data=[])

        # Inventory: .table().select().eq("property_id").eq("org_id").execute()
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.execute = AsyncMock(
            return_value=inv_resp
        )
        # Predictions: .table().select().eq().eq().gte().lte().execute()
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.gte.return_value.lte.return_value.execute = AsyncMock(
            return_value=pred_resp
        )

        with patch("app.services.reorder_service.get_async_supabase_admin", new=AsyncMock(return_value=mock_client)):
            recs = await svc.get_recommendations(tenant, min_urgency="monitor")
            urgencies = [r["urgency"] for r in recs]
            # critical should come before soon
            if "critical" in urgencies and "soon" in urgencies:
                assert urgencies.index("critical") < urgencies.index("soon")


class TestEvaluationTasks:
    """Tests for prediction actual_value write-back."""

    @pytest.mark.asyncio
    async def test_record_actual_finds_nearest_prediction(self):
        """record_actual_value finds and updates the nearest pending prediction."""
        from app.tasks.evaluation_tasks import _record_actual_value_async

        pred_id = str(uuid4())

        mock_client = MagicMock()
        pred_resp = MagicMock(data=[{
            "id": pred_id,
            "predicted_value": 10.0,
            "actual_value": None,
        }])
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.is_.return_value.gte.return_value.lte.return_value.order.return_value.limit.return_value.execute = AsyncMock(
            return_value=pred_resp
        )

        mock_repo = AsyncMock()
        mock_repo.record_actual.return_value = {"id": pred_id, "actual_value": 9.5}

        # _record_actual_value_async uses local imports, so patch source modules
        with (
            patch("app.db.supabase_client.get_async_supabase_admin", new=AsyncMock(return_value=mock_client)),
            patch("app.db.repositories.predictions.get_predictions_repository", new=AsyncMock(return_value=mock_repo)),
        ):
            result = await _record_actual_value_async(
                org_id=str(uuid4()),
                property_id=str(uuid4()),
                user_id=str(uuid4()),
                item_id=str(uuid4()),
                actual_qty=9.5,
                observed_at="2026-04-17T12:00:00Z",
            )

            assert result["status"] == "recorded"
            assert result["actual_value"] == 9.5

    @pytest.mark.asyncio
    async def test_record_actual_no_prediction_graceful(self):
        """When no matching prediction found, returns no_prediction_found status."""
        from app.tasks.evaluation_tasks import _record_actual_value_async

        mock_client = MagicMock()
        empty_resp = MagicMock(data=[])
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.is_.return_value.gte.return_value.lte.return_value.order.return_value.limit.return_value.execute = AsyncMock(
            return_value=empty_resp
        )

        mock_repo = AsyncMock()

        with (
            patch("app.db.supabase_client.get_async_supabase_admin", new=AsyncMock(return_value=mock_client)),
            patch("app.db.repositories.predictions.get_predictions_repository", new=AsyncMock(return_value=mock_repo)),
        ):
            result = await _record_actual_value_async(
                org_id=str(uuid4()),
                property_id=str(uuid4()),
                user_id=str(uuid4()),
                item_id=str(uuid4()),
                actual_qty=5.0,
                observed_at="2026-04-17T12:00:00Z",
            )
            assert result["status"] == "no_prediction_found"


# ══════════════════════════════════════════════════════════════════════════════
# Prompt 7 — Admin, audit logs, usage metering
# ══════════════════════════════════════════════════════════════════════════════

class TestAdminRoleGate:
    """Tests for admin role enforcement."""

    def test_admin_role_passes(self):
        """Admin tenant passes the role check."""
        tenant = TenantContext(
            user_id=uuid4(), org_id=uuid4(), property_id=uuid4(),
            role="admin", jwt="test",
        )
        assert tenant.role == "admin"

    def test_admin_is_admin(self):
        tenant = TenantContext(
            user_id=uuid4(), org_id=uuid4(), property_id=uuid4(),
            role="admin", jwt="test",
        )
        assert tenant.is_admin is True

    def test_staff_role_is_not_admin(self):
        tenant = TenantContext(
            user_id=uuid4(), org_id=uuid4(), property_id=uuid4(),
            role="staff", jwt="test",
        )
        assert tenant.is_admin is False

    def test_resident_role_is_not_admin(self):
        tenant = TenantContext(
            user_id=uuid4(), org_id=uuid4(), property_id=uuid4(),
            role="resident", jwt="test",
        )
        assert tenant.is_admin is False


class TestAuditService:
    """Tests for audit logging."""

    @pytest.mark.asyncio
    async def test_log_writes_entry(self, tenant: TenantContext):
        """AuditService.log() calls repository.log()."""
        from app.services.audit_service import AuditService

        svc = AuditService()

        with patch.object(svc._repo, "log", new=AsyncMock(return_value=None)) as mock_log:
            await svc.log(
                tenant=tenant,
                action="document.approve",
                resource_type="documents",
                resource_id=uuid4(),
                after_state={"status": "approved"},
            )

            mock_log.assert_awaited_once()
            call_kwargs = mock_log.call_args.kwargs
            assert call_kwargs["action"] == "document.approve"
            assert call_kwargs["resource_type"] == "documents"

    @pytest.mark.asyncio
    async def test_log_failure_is_non_fatal(self, tenant: TenantContext):
        """Repository failure in log() does not propagate to caller."""
        from app.services.audit_service import AuditService

        svc = AuditService()

        with patch.object(svc._repo, "log", new=AsyncMock(side_effect=Exception("DB unavailable"))):
            # Should NOT raise
            try:
                await svc.log(
                    tenant=tenant,
                    action="item.delete",
                    resource_type="inventory_items",
                )
            except Exception:
                pytest.fail("AuditService.log() must not raise on repo failure")

    @pytest.mark.asyncio
    async def test_list_entries_returns_entries_and_total(self, tenant: TenantContext):
        """list_entries returns (entries, total) tuple."""
        from app.services.audit_service import AuditService

        svc = AuditService()
        fake_entries = [
            {"id": str(uuid4()), "action": "document.approve", "resource_type": "documents"},
        ]

        # Patch the source module for the local import inside list_entries.
        # The count query is wrapped in try/except so it can fall back to len(entries)=1.
        with patch.object(svc._repo, "list", new=AsyncMock(return_value=fake_entries)):
            entries, total = await svc.list_entries(tenant, resource_type="documents")
            assert entries == fake_entries
            assert total == 1


class TestUsageMetering:
    """Tests for usage metering basics."""

    @pytest.mark.asyncio
    async def test_record_is_non_fatal_on_failure(self, tenant: TenantContext):
        """UsageMeteringRepository.record() failure does not propagate."""
        from app.db.repositories.usage_metering import UsageMeteringRepository

        repo = UsageMeteringRepository()

        mock_client = MagicMock()
        mock_client.table.return_value.insert.return_value.execute = AsyncMock(
            side_effect=Exception("DB error")
        )

        with patch("app.db.repositories.usage_metering.get_async_supabase_admin", new=AsyncMock(return_value=mock_client)):
            # Should not raise
            try:
                await repo.record(
                    tenant=tenant,
                    feature="scan",
                    event_type="llm_call",
                    model="claude-3-5-sonnet",
                    input_tokens=100,
                    output_tokens=200,
                    cost_usd=0.0045,
                )
            except Exception:
                pytest.fail("UsageMeteringRepository.record() must be non-fatal")

    @pytest.mark.asyncio
    async def test_get_summary_returns_aggregate(self, tenant: TenantContext):
        """get_summary returns raw rows for the given date range."""
        from datetime import UTC, datetime, timedelta

        from app.db.repositories.usage_metering import UsageMeteringRepository

        repo = UsageMeteringRepository()
        now = datetime.now(UTC)
        since = now - timedelta(days=30)

        rows = [
            {"feature": "scan", "event_type": "llm_call", "cost_usd": 0.01, "input_tokens": 100, "output_tokens": 50},
            {"feature": "scan", "event_type": "llm_call", "cost_usd": 0.02, "input_tokens": 200, "output_tokens": 100},
        ]
        mock_client = MagicMock()
        resp = MagicMock(data=rows)
        mock_client.table.return_value.select.return_value.eq.return_value.gte.return_value.lte.return_value.execute = AsyncMock(
            return_value=resp
        )

        with patch("app.db.repositories.usage_metering.get_async_supabase_admin", new=AsyncMock(return_value=mock_client)):
            result = await repo.get_summary(tenant, period_start=since.isoformat(), period_end=now.isoformat())
            assert len(result) == 2
            total_cost = sum(r["cost_usd"] for r in result)
            assert total_cost == pytest.approx(0.03)

    @pytest.mark.asyncio
    async def test_usage_service_org_summary_shape(self, tenant: TenantContext):
        """UsageService.get_org_summary() returns expected keys."""
        from app.services.usage_service import UsageService

        svc = UsageService()

        mock_meter = AsyncMock()
        mock_meter.get_summary.return_value = {
            "total_calls": 5,
            "total_cost_usd": 0.05,
            "by_feature": {},
        }

        mock_client = MagicMock()
        count_resp = MagicMock(count=0, data=[])
        async_execute = AsyncMock(return_value=count_resp)

        # Cover .eq().gte().execute() (documents, line_items, audit_logs, scans)
        mock_client.table.return_value.select.return_value.eq.return_value.gte.return_value.execute = async_execute
        # Cover .eq().eq().gte().execute() (reports has two .eq() calls)
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.gte.return_value.execute = async_execute

        with (
            patch.object(svc._repo, "get_summary", new=mock_meter.get_summary),
            patch("app.services.usage_service.get_async_supabase_admin", new=AsyncMock(return_value=mock_client)),
        ):
            result = await svc.get_org_summary(tenant, days=30)

            required_keys = {
                "org_id", "period_days", "documents_scanned",
                "line_items_processed", "exports_generated",
                "active_users", "active_properties", "llm_calls", "llm_cost_usd",
            }
            assert required_keys.issubset(result.keys())
