"""Shared LLM failover wrapper for scan and orchestration services."""

from __future__ import annotations

import asyncio
import base64
import json
from collections.abc import Mapping
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

PROVIDER_LABEL = {
    "anthropic": "Anthropic",
    "openai": "OpenAI",
    "google": "Gemini",
}


class ProviderFailure(Exception):
    """Internal signal for provider-level failure that should trigger fallback."""

    def __init__(self, message: str, code: str = "provider_error", best_effort_text: str | None = None):
        super().__init__(message)
        self.code = code
        self.best_effort_text = best_effort_text


class AllProvidersFailed(RuntimeError):
    """Raised when all configured providers fail in the chain."""

    def __init__(
        self,
        message: str,
        failures: list[dict[str, str]],
        best_effort_text: str | None = None,
    ):
        super().__init__(message)
        self.failures = failures
        self.best_effort_text = best_effort_text


def _extract_status_code(exc: Exception) -> int | None:
    status_code = getattr(exc, "status_code", None)
    if isinstance(status_code, int):
        return status_code

    response = getattr(exc, "response", None)
    if response is not None:
        response_status = getattr(response, "status_code", None)
        if isinstance(response_status, int):
            return response_status

    return None


def _safe_message(exc: Exception) -> str:
    return str(exc).strip() or type(exc).__name__


def _classify_error(message: str, status: int | None = None) -> str:
    lower = message.lower()
    if "malformed" in lower and "json" in lower:
        return "malformed_json"
    if "timeout" in lower:
        return "timeout"
    if "import" in lower or "module named" in lower or "dependency missing" in lower:
        return "import_failure"
    if "api key" in lower or "missing" in lower or "not configured" in lower:
        return "missing_provider_config"
    if "insufficient" in lower or "credit" in lower or "quota" in lower or "rate" in lower:
        return "quota_exceeded"
    if status == 429:
        return "quota_exceeded"
    if status and status >= 500:
        return "provider_unavailable"
    return "provider_error"


def _extract_json_payload(text: str) -> dict[str, Any] | None:
    stripped = text.strip()
    if not stripped:
        return None

    try:
        payload = json.loads(stripped)
        if isinstance(payload, dict):
            return payload
    except json.JSONDecodeError:
        pass

    for marker in ("```json", "```"):
        if marker in stripped:
            start = stripped.find(marker)
            tail = stripped[start + len(marker):]
            end = tail.find("```")
            snippet = tail[:end] if end >= 0 else tail
            try:
                payload = json.loads(snippet.strip())
                if isinstance(payload, dict):
                    return payload
            except json.JSONDecodeError:
                continue

    return None


def _extract_vision_text_and_url(
    user_content: str | list[dict[str, Any]],
) -> tuple[str, str | None]:
    if isinstance(user_content, str):
        return user_content, None

    text_parts: list[str] = []
    image_url: str | None = None

    for block in user_content:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "text":
            text_parts.append(str(block.get("text", "")))
        elif block.get("type") == "image_url":
            image_url = str((block.get("image_url") or {}).get("url") or "") or image_url

    text_prompt = "\n".join([p for p in text_parts if p]).strip() or "Analyze this image"
    return text_prompt, image_url


async def _call_anthropic(
    model: str,
    system_prompt: str,
    user_content: str | list[dict[str, Any]],
    is_vision: bool,
    image_data: dict[str, str] | None,
) -> dict[str, Any]:
    import anthropic

    if not settings.ANTHROPIC_API_KEY:
        raise ProviderFailure("ANTHROPIC_API_KEY missing")

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    if is_vision:
        vision_blocks: list[dict[str, Any]] = []
        text_prompt, image_url = _extract_vision_text_and_url(user_content)
        if image_data and image_data.get("data"):
            vision_blocks.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": image_data.get("media_type", "image/jpeg"),
                        "data": image_data["data"],
                    },
                }
            )
        elif image_url:
            vision_blocks.append(
                {
                    "type": "image",
                    "source": {
                        "type": "url",
                        "url": image_url,
                    },
                }
            )
        vision_blocks.append({"type": "text", "text": str(text_prompt)})
        content: str | list[dict[str, Any]] = vision_blocks
    else:
        content = user_content if isinstance(user_content, str) else str(user_content)

    try:
        response = await client.messages.create(
            model=model,
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": content}],
        )
        text = response.content[0].text if response.content else ""
        return {
            "text": text,
            "usage": {
                "input_tokens": getattr(response.usage, "input_tokens", 0),
                "output_tokens": getattr(response.usage, "output_tokens", 0),
            },
        }
    except Exception as exc:
        status = _extract_status_code(exc)
        msg = _safe_message(exc)
        code = _classify_error(msg, status)
        if code in {"quota_exceeded", "missing_provider_config", "import_failure", "provider_unavailable"}:
            raise ProviderFailure(msg, code=code) from exc
        raise


async def _call_openai(
    model: str,
    system_prompt: str,
    user_content: str | list[dict[str, Any]],
    is_vision: bool,
    image_data: dict[str, str] | None,
) -> dict[str, Any]:
    import openai

    if not settings.OPENAI_API_KEY:
        raise ProviderFailure("OPENAI_API_KEY missing")

    client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]

    if is_vision:
        text_prompt, image_url = _extract_vision_text_and_url(user_content)
        content_blocks: list[dict[str, Any]] = [{"type": "text", "text": str(text_prompt)}]
        if image_data and image_data.get("data"):
            data_uri = f"data:{image_data.get('media_type', 'image/jpeg')};base64,{image_data['data']}"
            content_blocks.append({"type": "image_url", "image_url": {"url": data_uri}})
        elif image_url:
            content_blocks.append({"type": "image_url", "image_url": {"url": image_url}})
        messages.append({"role": "user", "content": content_blocks})
    else:
        messages.append({"role": "user", "content": user_content if isinstance(user_content, str) else str(user_content)})

    try:
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=4096,
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        text = response.choices[0].message.content or ""
        return {
            "text": text,
            "usage": {
                "input_tokens": getattr(response.usage, "prompt_tokens", 0),
                "output_tokens": getattr(response.usage, "completion_tokens", 0),
            },
        }
    except Exception as exc:
        msg = _safe_message(exc)
        status = _extract_status_code(exc)
        code = _classify_error(msg, status)
        if code in {"quota_exceeded", "missing_provider_config", "import_failure", "provider_unavailable"}:
            raise ProviderFailure(msg, code=code) from exc
        raise


async def _call_google(
    model: str,
    system_prompt: str,
    user_content: str | list[dict[str, Any]],
    is_vision: bool,
    image_data: dict[str, str] | None,
) -> dict[str, Any]:
    if not settings.GOOGLE_API_KEY:
        raise ProviderFailure("GOOGLE_API_KEY missing")

    try:
        import google.generativeai as genai
    except ImportError:
        genai = None

    if genai is None:
        try:
            from google import genai as google_genai
        except ImportError as exc:
            raise ProviderFailure("Google GenAI dependency missing", code="import_failure") from exc

        client = google_genai.Client(api_key=settings.GOOGLE_API_KEY)
        try:
            if is_vision and image_data and image_data.get("data"):
                prompt_text, _ = _extract_vision_text_and_url(user_content)
                image_bytes = base64.b64decode(image_data["data"])
                response = await client.aio.models.generate_content(
                    model=model,
                    contents=[
                        prompt_text,
                        {
                            "mime_type": image_data.get("media_type", "image/jpeg"),
                            "data": image_bytes,
                        },
                    ],
                )
            elif is_vision:
                prompt_text, image_url = _extract_vision_text_and_url(user_content)
                combined = prompt_text if not image_url else f"{prompt_text}\n\nImage URL: {image_url}"
                response = await client.aio.models.generate_content(model=model, contents=combined)
            else:
                response = await client.aio.models.generate_content(
                    model=model,
                    contents=user_content if isinstance(user_content, str) else str(user_content),
                )

            response_text = getattr(response, "text", "") or ""
            return {"text": response_text, "usage": {}}
        except Exception as exc:
            msg = _safe_message(exc)
            status = _extract_status_code(exc)
            code = _classify_error(msg, status)
            raise ProviderFailure(msg, code=code) from exc

    genai.configure(api_key=settings.GOOGLE_API_KEY)
    generation_config = genai.GenerationConfig(temperature=0.1, max_output_tokens=4096)
    model_client = genai.GenerativeModel(
        model_name=model,
        system_instruction=system_prompt,
        generation_config=generation_config,
    )

    try:
        if is_vision and image_data and image_data.get("data"):
            prompt_text, _ = _extract_vision_text_and_url(user_content)
            image_bytes = base64.b64decode(image_data["data"])
            response = await model_client.generate_content_async(
                [
                    str(prompt_text),
                    {
                        "mime_type": image_data.get("media_type", "image/jpeg"),
                        "data": image_bytes,
                    },
                ]
            )
        elif is_vision:
            prompt_text, image_url = _extract_vision_text_and_url(user_content)
            combined = prompt_text if not image_url else f"{prompt_text}\n\nImage URL: {image_url}"
            response = await model_client.generate_content_async(combined)
        else:
            response = await model_client.generate_content_async(
                user_content if isinstance(user_content, str) else str(user_content)
            )

        return {
            "text": getattr(response, "text", "") or "",
            "usage": {},
        }
    except Exception as exc:
        msg = _safe_message(exc)
        status = _extract_status_code(exc)
        code = _classify_error(msg, status)
        if code in {"quota_exceeded", "missing_provider_config", "import_failure", "provider_unavailable"}:
            raise ProviderFailure(msg, code=code) from exc
        raise


async def get_completion_with_failover(
    system_prompt: str,
    user_content: str | list[dict[str, Any]],
    is_vision: bool = False,
    image_data: dict[str, str] | None = None,
    metadata: Mapping[str, Any] | None = None,
    expect_json: bool = False,
    provider_timeout_seconds: float = 30,
) -> dict[str, Any]:
    """Try Anthropic -> OpenAI -> Gemini and return first successful completion."""

    context = dict(metadata or {})

    chain: list[tuple[str, str, Any]] = [
        ("anthropic", "claude-3-5-sonnet", _call_anthropic),
        ("openai", "gpt-4o", _call_openai),
        ("google", "gemini-1.5-flash", _call_google),
    ]

    failures: list[str] = []
    failure_details: list[dict[str, str]] = []
    best_effort_text: str | None = None

    for idx, (provider, model, fn) in enumerate(chain):
        try:
            result = await asyncio.wait_for(
                fn(
                    model=model,
                    system_prompt=system_prompt,
                    user_content=user_content,
                    is_vision=is_vision,
                    image_data=image_data,
                ),
                timeout=provider_timeout_seconds,
            )
            text = result.get("text", "")

            if expect_json and _extract_json_payload(text) is None:
                raise ProviderFailure(
                    "Malformed JSON from provider",
                    code="malformed_json",
                    best_effort_text=text,
                )

            fallback = idx > 0
            if fallback:
                logger.info(
                    f"Scan successful using Fallback: {PROVIDER_LABEL.get(provider, provider)} ({model}).",
                    provider=provider,
                    model=model,
                    **context,
                )
            else:
                logger.info(
                    f"LLM completion successful using Primary: {PROVIDER_LABEL.get(provider, provider)} ({model}).",
                    provider=provider,
                    model=model,
                    **context,
                )

            return {
                "text": text,
                "provider": provider,
                "model": model,
                "usage": result.get("usage", {}),
                "fallback_used": fallback,
                "parsed_json": _extract_json_payload(text) if expect_json else None,
            }

        except TimeoutError:
            reason = f"provider timeout after {provider_timeout_seconds}s"
            failures.append(f"{provider}: {reason}")
            failure_details.append({"provider": provider, "reason": reason, "code": "timeout"})
            logger.warning(
                "Provider timed out, attempting fallback",
                provider=provider,
                model=model,
                timeout_s=provider_timeout_seconds,
                **context,
            )
            continue

        except ProviderFailure as exc:
            reason = _safe_message(exc)
            failures.append(f"{provider}: {reason}")
            failure_details.append({"provider": provider, "reason": reason, "code": exc.code})
            if exc.best_effort_text and not best_effort_text:
                best_effort_text = exc.best_effort_text

            if provider == "anthropic":
                logger.warning(
                    "Anthropic failed, switching to OpenAI...",
                    reason=reason,
                    provider=provider,
                    model=model,
                    **context,
                )
            elif provider == "openai":
                logger.warning(
                    "OpenAI failed, switching to Gemini...",
                    reason=reason,
                    provider=provider,
                    model=model,
                    **context,
                )
            else:
                logger.warning(
                    "Gemini fallback failed",
                    reason=reason,
                    provider=provider,
                    model=model,
                    **context,
                )
            continue

        except Exception as exc:
            reason = _safe_message(exc)
            failures.append(f"{provider}: {reason}")
            failure_details.append({"provider": provider, "reason": reason, "code": "provider_error"})
            logger.error(
                "Provider call failed with non-retryable error",
                provider=provider,
                model=model,
                reason=reason,
                **context,
            )

    raise AllProvidersFailed(
        f"All providers failed: {' | '.join(failures)}",
        failures=failure_details,
        best_effort_text=best_effort_text,
    )
