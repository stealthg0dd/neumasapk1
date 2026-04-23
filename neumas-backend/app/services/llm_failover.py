"""Shared LLM failover wrapper for scan and orchestration services."""

from __future__ import annotations

import base64
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
        name = type(exc).__name__
        msg = _safe_message(exc)
        is_failover = (
            name in {"InsufficientCreditsError", "RateLimitError"}
            or status in {400, 429}
            or "insufficient" in msg.lower()
            or "credit" in msg.lower()
            or "quota" in msg.lower()
            or "rate" in msg.lower()
        )
        if is_failover:
            raise ProviderFailure(msg) from exc
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
        lower = msg.lower()
        status = _extract_status_code(exc)
        if (
            "rate" in lower
            or "quota" in lower
            or "insufficient" in lower
            or "credit" in lower
            or status in {400, 429}
        ):
            raise ProviderFailure(msg) from exc
        raise


async def _call_google(
    model: str,
    system_prompt: str,
    user_content: str | list[dict[str, Any]],
    is_vision: bool,
    image_data: dict[str, str] | None,
) -> dict[str, Any]:
    import google.generativeai as genai

    if not settings.GOOGLE_API_KEY:
        raise ProviderFailure("GOOGLE_API_KEY missing")

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
        lower = msg.lower()
        if "rate" in lower or "quota" in lower or "limit" in lower or "429" in lower:
            raise ProviderFailure(msg) from exc
        raise


async def get_completion_with_failover(
    system_prompt: str,
    user_content: str | list[dict[str, Any]],
    is_vision: bool = False,
    image_data: dict[str, str] | None = None,
    metadata: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Try Anthropic -> OpenAI -> Gemini and return first successful completion."""

    context = dict(metadata or {})

    chain: list[tuple[str, str, Any]] = [
        ("anthropic", "claude-3-5-sonnet", _call_anthropic),
        ("openai", "gpt-4o", _call_openai),
        ("google", "gemini-1.5-flash", _call_google),
    ]

    failures: list[str] = []

    for idx, (provider, model, fn) in enumerate(chain):
        try:
            result = await fn(
                model=model,
                system_prompt=system_prompt,
                user_content=user_content,
                is_vision=is_vision,
                image_data=image_data,
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
                "text": result.get("text", ""),
                "provider": provider,
                "model": model,
                "usage": result.get("usage", {}),
                "fallback_used": fallback,
            }

        except ProviderFailure as exc:
            reason = _safe_message(exc)
            failures.append(f"{provider}: {reason}")

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
            logger.error(
                "Provider call failed with non-retryable error",
                provider=provider,
                model=model,
                reason=reason,
                **context,
            )

    raise RuntimeError(f"All providers failed: {' | '.join(failures)}")
