"""
Tests for reliability, idempotency and upload deduplication.

Covers:
- test_duplicate_upload_does_not_double_write
- test_retried_task_skips_completed_scan
- test_report_retry_deduplication
- test_file_hash_computation
- test_dedup_check_fail_open_on_redis_error
"""

from __future__ import annotations

import os
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

os.environ.setdefault("ENV", "test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-testing-only")


# ---------------------------------------------------------------------------
# file_hash helpers
# ---------------------------------------------------------------------------

class TestComputeHash:
    def test_sha256_default(self):
        from app.utils.file_hash import compute_hash

        result = compute_hash(b"hello world")
        assert len(result) == 64  # sha256 hex digest

    def test_same_bytes_same_hash(self):
        from app.utils.file_hash import compute_hash

        data = b"receipt bytes"
        assert compute_hash(data) == compute_hash(data)

    def test_different_bytes_different_hash(self):
        from app.utils.file_hash import compute_hash

        assert compute_hash(b"file_a") != compute_hash(b"file_b")

    def test_unsupported_algo_raises(self):
        from app.utils.file_hash import compute_hash

        with pytest.raises(ValueError, match="Unsupported"):
            compute_hash(b"data", algo="blake2b")


class TestIsDuplicateUpload:
    def _make_redis(self, *, nx_returns: bool):
        """Build a mock Redis client where SET NX returns *nx_returns*."""
        r = MagicMock()
        # redis.set(key, val, nx=True, ex=ttl) returns True when key set, None/False when key existed
        r.set.return_value = True if nx_returns else None
        return r

    def test_first_upload_not_duplicate(self):
        from app.utils.file_hash import is_duplicate_upload

        redis = self._make_redis(nx_returns=True)
        result = is_duplicate_upload("aabbcc", "org1", "prop1", redis)
        assert result is False

    def test_second_upload_is_duplicate(self):
        from app.utils.file_hash import is_duplicate_upload

        redis = self._make_redis(nx_returns=False)
        result = is_duplicate_upload("aabbcc", "org1", "prop1", redis)
        assert result is True

    def test_different_property_not_duplicate(self):
        """Same hash, different property → separate dedup key → not a dupe."""
        from app.utils.file_hash import dedup_key

        key_a = dedup_key("deadbeef", "org1", "prop_a")
        key_b = dedup_key("deadbeef", "org1", "prop_b")
        assert key_a != key_b

    def test_fail_open_on_redis_error(self):
        """If Redis raises, the upload should be allowed (fail open)."""
        from app.utils.file_hash import is_duplicate_upload

        redis = MagicMock()
        redis.set.side_effect = ConnectionError("Redis down")
        result = is_duplicate_upload("aabbcc", "org1", "prop1", redis)
        assert result is False  # fail open


# ---------------------------------------------------------------------------
# Idempotency middleware cache key stability
# ---------------------------------------------------------------------------

class TestIdempotencyCacheKey:
    def test_same_inputs_same_key(self):
        from app.core.idempotency import _cache_key

        k1 = _cache_key("POST", "/api/v1/scans", "idem-key-123")
        k2 = _cache_key("POST", "/api/v1/scans", "idem-key-123")
        assert k1 == k2

    def test_different_key_different_cache_entry(self):
        from app.core.idempotency import _cache_key

        k1 = _cache_key("POST", "/api/v1/scans", "idem-key-aaa")
        k2 = _cache_key("POST", "/api/v1/scans", "idem-key-bbb")
        assert k1 != k2


# ---------------------------------------------------------------------------
# scan_tasks: retried task skips completed scan
# ---------------------------------------------------------------------------

@pytest.mark.anyio
class TestScanTaskIdempotency:
    async def test_retried_task_skips_completed_scan(self):
        """
        If the scan is already 'completed', _process_scan_async must return
        without re-running the AI pipeline or writing inventory twice.
        """
        from app.tasks.scan_tasks import _process_scan_async

        scan_id = str(uuid4())
        property_id = str(uuid4())
        user_id = str(uuid4())

        # Supabase admin mock: scans table single() returns completed scan
        fake_scan = {"status": "completed", "items_detected": 3, "processing_time_ms": 500}
        supabase = MagicMock()
        supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(
            return_value=MagicMock(data=fake_scan)
        )
        supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute = AsyncMock(
            return_value=MagicMock(data={"org_id": str(uuid4())})
        )

        with (
            patch("app.db.supabase_client.get_async_supabase_admin", AsyncMock(return_value=supabase)) as _,
            patch("app.services.pattern_agent.recompute_patterns_for_property") as patterns_mock,
            patch("app.services.predict_agent.recompute_predictions_for_property") as preds_mock,
            patch("app.services.vision_agent.get_vision_agent") as vision_mock,
        ):
            result = await _process_scan_async(
                task=None,
                scan_id=scan_id,
                property_id=property_id,
                user_id=user_id,
                image_url="https://example.com/image.jpg",
                scan_type="receipt",
            )

        assert result["status"] == "completed"
        assert result.get("skipped") is True
        # Pipeline should NOT be re-executed
        vision_mock.assert_not_called()
        patterns_mock.assert_not_called()
        preds_mock.assert_not_called()


# ---------------------------------------------------------------------------
# report_service: dedup prevents duplicate exports
# ---------------------------------------------------------------------------

@pytest.mark.anyio
class TestReportRetryDeduplication:
    async def test_report_retry_does_not_produce_duplicate_export(self):
        """
        Requesting a report with the same params within the dedup window
        should return the existing report without enqueuing a second task.
        """
        from app.api.deps import TenantContext
        from app.services.report_service import ReportService

        tenant = TenantContext(
            user_id=uuid4(),
            org_id=uuid4(),
            property_id=uuid4(),
            role="admin",
            jwt="tok",
        )
        existing_report = {
            "id": str(uuid4()),
            "report_type": "inventory_snapshot",
            "status": "completed",
            "params_hash": "abc123",
        }

        svc = ReportService()
        mock_repo = AsyncMock()
        mock_repo.find_existing = AsyncMock(return_value=existing_report)
        svc._repo = mock_repo

        with patch("app.tasks.report_tasks.generate_report_task") as task_mock:
            result = await svc.request_report(
                tenant=tenant,
                report_type="inventory_snapshot",
                params={"period": "2025-W01"},
            )

        assert result["id"] == existing_report["id"]
        assert result["deduplicated"] is True
        task_mock.apply_async.assert_not_called()


# ---------------------------------------------------------------------------
# log_business_event smoke test
# ---------------------------------------------------------------------------

class TestLogBusinessEvent:
    def test_does_not_raise(self):
        from app.core.logging import log_business_event

        # Should not raise regardless of kwargs
        log_business_event(
            "scan.completed",
            scan_id="abc",
            items_upserted=5,
            elapsed_ms=300,
        )

    def test_optional_context_fields(self):
        from app.core.logging import log_business_event

        log_business_event(
            "reorder.generated",
            user_id="u1",
            org_id="o1",
            property_id="p1",
            list_id="l1",
        )
