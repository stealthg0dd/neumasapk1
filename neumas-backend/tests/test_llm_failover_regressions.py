from __future__ import annotations

import builtins

import pytest

from app.services.llm_failover import (
    ProviderFailure,
    _call_google,
    get_completion_with_failover,
)


@pytest.mark.anyio
async def test_google_provider_missing_dependency_is_failover_error(monkeypatch):
    monkeypatch.setattr("app.services.llm_failover.settings.GOOGLE_API_KEY", "fake-key")

    original_import = builtins.__import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "google.generativeai":
            raise ImportError("No module named google.generativeai")
        if name == "google" and "genai" in fromlist:
            raise ImportError("No module named google.genai")
        return original_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    with pytest.raises(ProviderFailure, match="dependency missing"):
        await _call_google(
            model="gemini-1.5-flash",
            system_prompt="Extract receipt",
            user_content="hello",
            is_vision=False,
            image_data=None,
        )


@pytest.mark.anyio
async def test_failover_chain_reports_google_dependency_issue_cleanly(monkeypatch):
    monkeypatch.setattr("app.services.llm_failover.settings.ANTHROPIC_API_KEY", "x")
    monkeypatch.setattr("app.services.llm_failover.settings.OPENAI_API_KEY", "x")
    monkeypatch.setattr("app.services.llm_failover.settings.GOOGLE_API_KEY", "x")

    async def fail_anthropic(*args, **kwargs):
        raise ProviderFailure("anthropic quota")

    async def fail_openai(*args, **kwargs):
        raise ProviderFailure("openai quota")

    monkeypatch.setattr("app.services.llm_failover._call_anthropic", fail_anthropic)
    monkeypatch.setattr("app.services.llm_failover._call_openai", fail_openai)

    original_import = builtins.__import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "google.generativeai":
            raise ImportError("No module named google.generativeai")
        if name == "google" and "genai" in fromlist:
            raise ImportError("No module named google.genai")
        return original_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    with pytest.raises(RuntimeError) as exc_info:
        await get_completion_with_failover(
            system_prompt="Extract receipt",
            user_content="hello",
            is_vision=False,
        )

    message = str(exc_info.value)
    assert "anthropic: anthropic quota" in message
    assert "openai: openai quota" in message
    assert "google: Google GenAI dependency missing" in message
