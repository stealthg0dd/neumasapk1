from __future__ import annotations

import pytest

from app.services.llm_failover import (
    AllProvidersFailed,
    ProviderFailure,
    get_completion_with_failover,
)
from app.services.vision_agent import VisionAgent


@pytest.mark.asyncio
async def test_provider_quota_failure_falls_to_next_provider(monkeypatch):
    async def fail_quota(**_kwargs):
        raise ProviderFailure("quota exceeded", code="quota_exceeded")

    async def succeed_openai(**_kwargs):
        return {"text": '{"items": []}', "usage": {"input_tokens": 1, "output_tokens": 1}}

    monkeypatch.setattr("app.services.llm_failover._call_anthropic", fail_quota)
    monkeypatch.setattr("app.services.llm_failover._call_openai", succeed_openai)

    result = await get_completion_with_failover(
        system_prompt="Return JSON",
        user_content="{}",
        expect_json=True,
    )

    assert result["provider"] == "openai"
    assert result["fallback_used"] is True
    assert result["parsed_json"] == {"items": []}


@pytest.mark.asyncio
async def test_all_providers_fail_returns_structured_failure(monkeypatch):
    async def fail_anthropic(**_kwargs):
        raise ProviderFailure("insufficient credits", code="quota_exceeded")

    async def fail_openai(**_kwargs):
        raise ProviderFailure("quota exceeded", code="quota_exceeded")

    async def fail_google(**_kwargs):
        raise ProviderFailure("google sdk missing", code="import_failure", best_effort_text="Milk 2 unit 3.50")

    monkeypatch.setattr("app.services.llm_failover._call_anthropic", fail_anthropic)
    monkeypatch.setattr("app.services.llm_failover._call_openai", fail_openai)
    monkeypatch.setattr("app.services.llm_failover._call_google", fail_google)

    with pytest.raises(AllProvidersFailed) as exc:
        await get_completion_with_failover(
            system_prompt="Return JSON",
            user_content="{}",
            expect_json=True,
        )

    err = exc.value
    assert len(err.failures) == 3
    assert err.best_effort_text == "Milk 2 unit 3.50"


@pytest.mark.asyncio
async def test_missing_provider_config_does_not_crash_scan_analysis(monkeypatch):
    agent = VisionAgent()

    monkeypatch.setattr("app.services.vision_agent.settings.DEV_MODE", False)

    async def fake_fetch_image(_url: str):
        return {"data": "", "media_type": "image/jpeg"}

    async def fail_all(**_kwargs):
        raise AllProvidersFailed(
            "All providers failed",
            failures=[
                {"provider": "anthropic", "reason": "insufficient credits", "code": "quota_exceeded"},
                {"provider": "openai", "reason": "quota exceeded", "code": "quota_exceeded"},
                {"provider": "google", "reason": "GOOGLE_API_KEY missing", "code": "missing_provider_config"},
            ],
            best_effort_text=None,
        )

    monkeypatch.setattr(agent, "_fetch_image", fake_fetch_image)
    monkeypatch.setattr("app.services.vision_agent.get_completion_with_failover", fail_all)

    result = await agent.analyze_receipt("https://example.test/receipt.jpg", scan_type="receipt")

    assert "error" in result
    assert result.get("reason_code") == "provider_unavailable"
    assert result.get("items") == []


@pytest.mark.asyncio
async def test_all_providers_fail_can_return_partial_fallback(monkeypatch):
    agent = VisionAgent()

    monkeypatch.setattr("app.services.vision_agent.settings.DEV_MODE", False)

    async def fake_fetch_image(_url: str):
        return {"data": "", "media_type": "image/jpeg"}

    async def fail_all(**_kwargs):
        raise AllProvidersFailed(
            "All providers failed",
            failures=[{"provider": "google", "reason": "timeout", "code": "timeout"}],
            best_effort_text="NTUC FairPrice\nMilk 2 unit 3.50\nEggs 1 pack 4.20\nTOTAL 7.70",
        )

    monkeypatch.setattr(agent, "_fetch_image", fake_fetch_image)
    monkeypatch.setattr("app.services.vision_agent.get_completion_with_failover", fail_all)

    result = await agent.analyze_receipt("https://example.test/receipt.jpg", scan_type="receipt")

    assert result.get("partial_analysis") is True
    assert isinstance(result.get("items"), list)
    assert len(result.get("items") or []) >= 1
