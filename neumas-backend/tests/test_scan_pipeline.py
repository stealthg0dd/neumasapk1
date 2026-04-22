from __future__ import annotations

from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from starlette.datastructures import UploadFile

from app.api.deps import TenantContext
from app.api.routes.scans import upload_scan as upload_scan_route
from app.services.scan_service import ScanService


class _Resp:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
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

    def update(self, payload):
        self.op = "update"
        self.payload = payload
        return self

    def insert(self, payload):
        self.op = "insert"
        self.payload = payload
        return self

    def eq(self, key, value):
        self.filters.append(("eq", key, value))
        return self

    def neq(self, key, value):
        self.filters.append(("neq", key, value))
        return self

    def in_(self, key, values):
        self.filters.append(("in", key, list(values)))
        return self

    def ilike(self, key, value):
        self.filters.append(("ilike", key, value))
        return self

    def limit(self, *_args):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def gte(self, *_args):
        return self

    def lte(self, *_args):
        return self

    def single(self):
        self._single = True
        return self

    async def execute(self):
        return self.db.execute(self)


class _FakeSupabase:
    def __init__(self, org_id: str):
        self.org_id = org_id
        self.property_id = str(uuid4())
        self.scan_id = str(uuid4())
        self.scans = {
            self.scan_id: {
                "id": self.scan_id,
                "status": "queued",
                "items_detected": 0,
                "processing_time_ms": 0,
                "processed_results": {},
                "property_id": self.property_id,
            }
        }
        self.inventory = {}

    def table(self, name: str):
        return _FakeQuery(self, name)

    def _match(self, row: dict, flt) -> bool:
        op, key, value = flt
        if op == "eq":
            return str(row.get(key)) == str(value)
        if op == "neq":
            return str(row.get(key)) != str(value)
        if op == "in":
            return row.get(key) in value
        if op == "ilike":
            return str(row.get(key, "")).lower() == str(value).lower()
        return True

    def execute(self, q: _FakeQuery):
        if q.table == "properties":
            return _Resp({"organization_id": self.org_id})

        if q.table == "scans":
            if q.op == "select":
                rows = [row for row in self.scans.values() if all(self._match(row, f) for f in q.filters)]
                if q._single:
                    return _Resp(rows[0] if rows else None)
                return _Resp(rows)
            if q.op == "update":
                updated = []
                for sid, row in self.scans.items():
                    if all(self._match(row, f) for f in q.filters):
                        self.scans[sid] = {**row, **(q.payload or {})}
                        updated.append(self.scans[sid])
                return _Resp(updated)

        if q.table == "inventory_items":
            if q.op == "select":
                rows = [row for row in self.inventory.values() if all(self._match(row, f) for f in q.filters)]
                return _Resp(rows)
            if q.op == "insert":
                rid = str(uuid4())
                payload = {"id": rid, **(q.payload or {})}
                self.inventory[rid] = payload
                return _Resp([payload])
            if q.op == "update":
                rows = []
                for iid, row in self.inventory.items():
                    if all(self._match(row, f) for f in q.filters):
                        self.inventory[iid] = {**row, **(q.payload or {})}
                        rows.append(self.inventory[iid])
                return _Resp(rows)

        if q.table in {"vendor_aliases", "vendors"}:
            return _Resp([])

        return _Resp([])


@pytest.mark.anyio
async def test_upload_scan_success(monkeypatch):
    tenant = TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="staff",
        jwt="token",
    )
    service = ScanService()

    scans_repo = SimpleNamespace(create=AsyncMock(), update=AsyncMock())
    monkeypatch.setattr("app.services.scan_service.get_scans_repository", AsyncMock(return_value=scans_repo))
    monkeypatch.setattr(
        ScanService,
        "_upload_to_storage",
        AsyncMock(return_value=("org/prop/scan.jpg", "https://example.test/scan.jpg")),
    )
    monkeypatch.setattr("app.tasks.scan_tasks._process_scan_async", AsyncMock(return_value={"status": "completed"}))

    upload = UploadFile(filename="receipt.jpg", file=BytesIO(b"abc123"), headers={"content-type": "image/jpeg"})

    result = await service.upload_scan(upload, b"abc123", "receipt", tenant)
    assert result.status == "queued"
    scans_repo.create.assert_awaited_once()
    scans_repo.update.assert_awaited_once()


@pytest.mark.anyio
async def test_upload_scan_empty_file_fails():
    tenant = TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="staff",
        jwt="token",
    )
    service = ScanService()

    upload = UploadFile(filename="empty.jpg", file=BytesIO(b""), headers={"content-type": "image/jpeg"})

    with pytest.raises(ValueError, match="empty"):
        await service.upload_scan(upload, b"", "receipt", tenant)


@pytest.mark.anyio
async def test_upload_scan_storage_failure_marks_scan_failed(monkeypatch):
    tenant = TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="staff",
        jwt="token",
    )
    service = ScanService()

    scans_repo = SimpleNamespace(create=AsyncMock(), update=AsyncMock())
    monkeypatch.setattr("app.services.scan_service.get_scans_repository", AsyncMock(return_value=scans_repo))
    monkeypatch.setattr("app.services.scan_service.settings.DEV_MODE", False)
    monkeypatch.setattr(
        ScanService,
        "_upload_to_storage",
        AsyncMock(side_effect=RuntimeError("bucket missing")),
    )

    upload = UploadFile(filename="receipt.jpg", file=BytesIO(b"abc123"), headers={"content-type": "image/jpeg"})

    with pytest.raises(RuntimeError, match="Storage upload failed"):
        await service.upload_scan(upload, b"abc123", "receipt", tenant)

    assert scans_repo.update.await_count == 1


@pytest.mark.anyio
async def test_upload_route_invalid_file_rejected():
    tenant = TenantContext(
        user_id=uuid4(),
        org_id=uuid4(),
        property_id=uuid4(),
        role="staff",
        jwt="token",
    )

    upload = UploadFile(filename="receipt.txt", file=BytesIO(b"plain text"), headers={"content-type": "text/plain"})

    with pytest.raises(HTTPException) as exc_info:
        await upload_scan_route(
            request=SimpleNamespace(state=SimpleNamespace(request_id="req-route-invalid")),
            file=upload,
            scan_type="receipt",
            tenant=tenant,
        )

    assert exc_info.value.status_code == 400
    assert "image" in str(exc_info.value.detail).lower()


@pytest.mark.anyio
async def test_process_scan_ocr_failure_records_stage_error(monkeypatch):
    from app.tasks.scan_tasks import _process_scan_async

    fake = _FakeSupabase(org_id=str(uuid4()))
    scan_id = fake.scan_id

    class _Vision:
        async def analyze_receipt(self, **_kwargs):
            return {"error": "ocr unavailable"}

    monkeypatch.setattr("app.db.supabase_client.get_async_supabase_admin", AsyncMock(return_value=fake))
    monkeypatch.setattr("app.services.vision_agent.get_vision_agent", AsyncMock(return_value=_Vision()))
    monkeypatch.setattr("app.services.pattern_agent.recompute_patterns_for_property", AsyncMock(return_value={}))
    monkeypatch.setattr("app.services.predict_agent.recompute_predictions_for_property", AsyncMock(return_value={}))

    result = await _process_scan_async(
        task=None,
        scan_id=scan_id,
        property_id=fake.property_id,
        user_id=str(uuid4()),
        image_url="https://example.test/receipt.jpg",
        scan_type="receipt",
        request_id="req-ocr-failure",
    )

    assert result["status"] == "failed"
    assert fake.scans[scan_id]["status"] == "failed"
    stage_errors = (fake.scans[scan_id].get("processed_results") or {}).get("stage_errors") or []
    assert any(e.get("stage") == "ocr" for e in stage_errors)
    stage_details = (fake.scans[scan_id].get("processed_results") or {}).get("stage_details") or {}
    assert stage_details.get("request_id") == "req-ocr-failure"


@pytest.mark.anyio
async def test_process_scan_success_recomputes_baseline_and_predictions(monkeypatch):
    from app.tasks.scan_tasks import _process_scan_async

    fake = _FakeSupabase(org_id=str(uuid4()))
    scan_id = fake.scan_id

    class _Vision:
        async def analyze_receipt(self, **_kwargs):
            return {
                "items": [{"item_name": "Milk", "quantity": 2, "unit": "unit"}],
                "receipt_metadata": {"vendor_name": "Acme Foods"},
                "confidence": 0.92,
                "llm_provider": "anthropic",
                "llm_model": "claude-sonnet-4-6",
                "usage": {"input_tokens": 10, "output_tokens": 20},
            }

    recompute_patterns = AsyncMock(return_value={"items_analyzed": 1, "patterns_found": 1})
    recompute_predictions = AsyncMock(return_value={"predictions_upserted": 1, "critical_count": 0})

    monkeypatch.setattr("app.db.supabase_client.get_async_supabase_admin", AsyncMock(return_value=fake))
    monkeypatch.setattr("app.services.vision_agent.get_vision_agent", AsyncMock(return_value=_Vision()))
    monkeypatch.setattr("app.services.pattern_agent.recompute_patterns_for_property", recompute_patterns)
    monkeypatch.setattr("app.services.predict_agent.recompute_predictions_for_property", recompute_predictions)

    result = await _process_scan_async(
        task=None,
        scan_id=scan_id,
        property_id=fake.property_id,
        user_id=str(uuid4()),
        image_url="https://example.test/receipt.jpg",
        scan_type="receipt",
        request_id="req-success",
    )

    assert result["status"] == "completed"
    assert fake.scans[scan_id]["status"] == "completed"
    recompute_patterns.assert_awaited_once()
    recompute_predictions.assert_awaited_once()
    stage_details = (fake.scans[scan_id].get("processed_results") or {}).get("stage_details") or {}
    assert stage_details.get("request_id") == "req-success"
    assert stage_details.get("baseline", {}).get("status") == "completed"
    assert stage_details.get("predictions", {}).get("status") == "completed"
