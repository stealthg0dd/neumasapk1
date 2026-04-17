"""
Orchestration service for coordinating multi-agent workflows.

Implements LLM failover and multi-provider support for agent calls.
"""

import json
import re
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from app.core.celery_app import (
    LLMParseError,
    LLMRateLimitError,
    celery_app,
)
from app.core.config import settings
from app.core.logging import get_logger
from app.db.repositories.inventory import get_inventory_repository
from app.db.repositories.predictions import get_predictions_repository
from app.db.repositories.shopping_lists import get_shopping_lists_repository
from app.schemas.predictions import DemandForecastRequest
from app.schemas.shopping import GenerateShoppingListRequest

logger = get_logger(__name__)


# =============================================================================
# LLM Model Priority Configuration
# =============================================================================

AgentName = Literal["VISION", "PATTERN", "PREDICT", "SHOPPING", "BUDGET"]

MODEL_PRIORITY: dict[AgentName, list[str]] = {
    "VISION": ["claude-3-5-sonnet", "gpt-4-vision", "gemini-1.5-vision"],
    "PATTERN": ["gpt-4o-mini", "claude-haiku", "gemini-1.5-flash"],
    "PREDICT": ["gpt-4o", "claude-sonnet", "gemini-pro"],
    "SHOPPING": ["gpt-4o-mini", "claude-haiku", "gemini-1.5-flash"],
    "BUDGET": ["gpt-4o-mini", "claude-haiku", "gemini-1.5-flash"],
}

# Model to provider mapping
MODEL_PROVIDER: dict[str, str] = {
    # OpenAI models
    "gpt-4-vision": "openai",
    "gpt-4o": "openai",
    "gpt-4o-mini": "openai",
    # Anthropic models
    "claude-3-5-sonnet": "anthropic",
    "claude-sonnet": "anthropic",
    "claude-haiku": "anthropic",
    # Google models
    "gemini-1.5-vision": "google",
    "gemini-1.5-flash": "google",
    "gemini-pro": "google",
}

# OpenAI model name mapping
OPENAI_MODEL_NAMES: dict[str, str] = {
    "gpt-4-vision": "gpt-4o",  # GPT-4o supports vision
    "gpt-4o": "gpt-4o",
    "gpt-4o-mini": "gpt-4o-mini",
}

# Anthropic model name mapping
ANTHROPIC_MODEL_NAMES: dict[str, str] = {
    "claude-3-5-sonnet": "claude-sonnet-4-6",
    "claude-sonnet": "claude-sonnet-4-6",
    "claude-haiku": "claude-haiku-4-5-20251001",
}

# Google model name mapping
GOOGLE_MODEL_NAMES: dict[str, str] = {
    "gemini-1.5-vision": "gemini-1.5-pro",
    "gemini-1.5-flash": "gemini-1.5-flash",
    "gemini-pro": "gemini-1.5-pro",
}


# =============================================================================
# System Prompts for Agents
# =============================================================================

SYSTEM_PROMPTS: dict[AgentName, str] = {
    "VISION": """You are a vision analysis agent for inventory management.
Analyze the provided image and extract inventory items.

RESPOND ONLY WITH VALID JSON in this exact format:
{
  "items": [
    {"item": "item_name", "qty": number, "unit": "unit_type", "category": "category_name"}
  ],
  "confidence": 0.0 to 1.0,
  "notes": "optional observations"
}

Categories should be one of: dairy, produce, meat, beverages, cleaning, toiletries, paper_goods, other.
Units should be: units, liters, kg, grams, packs, bottles, cans, boxes.
Be precise with quantities. If uncertain, provide your best estimate with lower confidence.""",

    "PATTERN": """You are a consumption pattern analysis agent.
Given historical consumption data, identify patterns and consumption rates.

RESPOND ONLY WITH VALID JSON in this exact format:
{
  "patterns": [
    {
      "item_id": "uuid",
      "avg_daily_consumption": number,
      "weekly_pattern": {"monday": number, "tuesday": number, ...},
      "confidence": 0.0 to 1.0,
      "trend": "stable" | "increasing" | "decreasing",
      "seasonality": "none" | "weekly" | "monthly"
    }
  ],
  "insights": ["observation1", "observation2"]
}

Use statistical reasoning to smooth noise and identify true patterns.""",

    "PREDICT": """You are a demand prediction agent for inventory management.
Given consumption patterns and current inventory, predict stockout dates and urgency.

RESPOND ONLY WITH VALID JSON in this exact format:
{
  "predictions": [
    {
      "item_id": "uuid",
      "item_name": "name",
      "current_qty": number,
      "predicted_runout_date": "YYYY-MM-DD",
      "days_until_runout": number,
      "urgency": "critical" | "urgent" | "soon" | "later",
      "recommended_reorder_qty": number,
      "confidence": 0.0 to 1.0
    }
  ],
  "summary": {
    "critical_count": number,
    "urgent_count": number
  }
}

Urgency levels:
- critical: 0-3 days
- urgent: 4-7 days
- soon: 8-14 days
- later: >14 days""",

    "SHOPPING": """You are a shopping list generation agent.
Given predictions and urgency levels, create an optimized shopping list.

RESPOND ONLY WITH VALID JSON in this exact format:
{
  "shopping_list": {
    "name": "descriptive_name",
    "items": [
      {
        "item_name": "name",
        "quantity": number,
        "unit": "unit_type",
        "priority": "critical" | "high" | "normal" | "low",
        "reason": "why this item needs restocking",
        "estimated_price": number or null
      }
    ],
    "grouped_by_store": {
      "store_name": ["item1", "item2"]
    }
  },
  "total_items": number,
  "estimated_total": number or null
}

Group items logically and prioritize by urgency.""",

    "BUDGET": """You are a budget optimization agent for shopping lists.
Analyze a shopping list and suggest cost-saving alternatives.

RESPOND ONLY WITH VALID JSON in this exact format:
{
  "optimizations": [
    {
      "original_item": "name",
      "suggestion": "cheaper alternative or bulk option",
      "savings_estimate": number,
      "reason": "why this saves money"
    }
  ],
  "summary": {
    "total_potential_savings": number,
    "recommendations": ["tip1", "tip2"]
  }
}

Focus on practical suggestions: bulk buying, generic brands, seasonal alternatives.""",
}


# =============================================================================
# LLM Client Functions
# =============================================================================


async def _call_openai(
    model: str,
    system_prompt: str,
    user_content: str | list[dict],
    is_vision: bool = False,
) -> str:
    """Call OpenAI API."""
    try:
        import openai
    except ImportError:
        raise RuntimeError("openai package not installed")

    if not settings.OPENAI_API_KEY:
        raise LLMRateLimitError("OpenAI API key not configured")

    client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    model_name = OPENAI_MODEL_NAMES.get(model, model)

    messages = [{"role": "system", "content": system_prompt}]

    if is_vision and isinstance(user_content, list):
        messages.append({"role": "user", "content": user_content})
    else:
        messages.append({"role": "user", "content": str(user_content)})

    try:
        response = await client.chat.completions.create(
            model=model_name,
            messages=messages,
            max_tokens=4096,
            temperature=0.1,  # Low temperature for structured output
        )
        return response.choices[0].message.content or ""
    except openai.RateLimitError as e:
        logger.warning("OpenAI rate limit", model=model, error=str(e))
        raise LLMRateLimitError(f"OpenAI rate limit: {e}")
    except openai.APIError as e:
        logger.error("OpenAI API error", model=model, error=str(e))
        raise


async def _call_anthropic(
    model: str,
    system_prompt: str,
    user_content: str | list[dict],
    is_vision: bool = False,
) -> str:
    """Call Anthropic API."""
    try:
        import anthropic
    except ImportError:
        raise RuntimeError("anthropic package not installed")

    if not settings.ANTHROPIC_API_KEY:
        raise LLMRateLimitError("Anthropic API key not configured")

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    model_name = ANTHROPIC_MODEL_NAMES.get(model, model)

    # Build content
    if is_vision and isinstance(user_content, list):
        content = user_content
    else:
        content = str(user_content)

    try:
        response = await client.messages.create(
            model=model_name,
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": content}],
        )
        # Extract text from response
        if response.content and len(response.content) > 0:
            return response.content[0].text
        return ""
    except anthropic.RateLimitError as e:
        logger.warning("Anthropic rate limit", model=model, error=str(e))
        raise LLMRateLimitError(f"Anthropic rate limit: {e}")
    except anthropic.APIError as e:
        logger.error("Anthropic API error", model=model, error=str(e))
        raise


async def _call_google(
    model: str,
    system_prompt: str,
    user_content: str | list[dict],
    is_vision: bool = False,
) -> str:
    """Call Google Gemini API."""
    try:
        import google.generativeai as genai
    except ImportError:
        raise RuntimeError("google-generativeai package not installed")

    if not settings.GOOGLE_API_KEY:
        raise LLMRateLimitError("Google API key not configured")

    genai.configure(api_key=settings.GOOGLE_API_KEY)
    model_name = GOOGLE_MODEL_NAMES.get(model, model)

    generation_config = genai.GenerationConfig(
        temperature=0.1,
        max_output_tokens=4096,
    )

    gemini_model = genai.GenerativeModel(
        model_name=model_name,
        system_instruction=system_prompt,
        generation_config=generation_config,
    )

    try:
        # For vision, handle image content
        if is_vision and isinstance(user_content, list):
            # Convert to Gemini format
            parts = []
            for item in user_content:
                if item.get("type") == "text":
                    parts.append(item.get("text", ""))
                elif item.get("type") == "image_url":
                    # Gemini expects different format for images
                    url = item.get("image_url", {}).get("url", "")
                    parts.append(f"[Image: {url}]")
            content = "\n".join(parts) if parts else str(user_content)
        else:
            content = str(user_content)

        response = await gemini_model.generate_content_async(content)
        return response.text or ""
    except Exception as e:
        error_str = str(e).lower()
        if "rate" in error_str or "quota" in error_str or "limit" in error_str:
            logger.warning("Google rate limit", model=model, error=str(e))
            raise LLMRateLimitError(f"Google rate limit: {e}")
        logger.error("Google API error", model=model, error=str(e))
        raise


# =============================================================================
# Main LLM Execution Functions
# =============================================================================


def _extract_json(text: str) -> dict[str, Any]:
    """Extract JSON from LLM response, handling markdown code blocks."""
    # Try to find JSON in code blocks first
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if json_match:
        text = json_match.group(1)

    # Try to find JSON object
    text = text.strip()

    # Find first { and last }
    start = text.find("{")
    end = text.rfind("}")

    if start != -1 and end != -1 and end > start:
        json_str = text[start : end + 1]
        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            pass

    # Last resort: try parsing the whole thing
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise LLMParseError(f"Could not parse JSON from response: {e}")


async def execute_llm(
    agent_name: AgentName,
    model: str,
    task_payload: dict[str, Any],
) -> dict[str, Any]:
    """
    Execute LLM call for a specific agent with a specific model.

    Args:
        agent_name: Name of the agent (VISION, PATTERN, etc.)
        model: Model identifier
        task_payload: Payload containing prompt data

    Returns:
        Parsed JSON response from LLM
    """
    provider = MODEL_PROVIDER.get(model)
    if not provider:
        raise ValueError(f"Unknown model: {model}")

    system_prompt = SYSTEM_PROMPTS.get(agent_name)
    if not system_prompt:
        raise ValueError(f"No system prompt for agent: {agent_name}")

    # Build user content
    user_content = task_payload.get("prompt", "")
    is_vision = task_payload.get("is_vision", False)

    # For vision tasks, build multimodal content
    if is_vision and task_payload.get("image_url"):
        image_url = task_payload["image_url"]
        text_prompt = task_payload.get("text_prompt", "Analyze this image.")

        if provider == "openai":
            user_content = [
                {"type": "text", "text": text_prompt},
                {"type": "image_url", "image_url": {"url": image_url}},
            ]
        elif provider == "anthropic":
            user_content = [
                {
                    "type": "image",
                    "source": {"type": "url", "url": image_url},
                },
                {"type": "text", "text": text_prompt},
            ]
        else:  # Google
            user_content = [
                {"type": "text", "text": text_prompt},
                {"type": "image_url", "image_url": {"url": image_url}},
            ]

    logger.info(
        "Executing LLM call",
        agent=agent_name,
        model=model,
        provider=provider,
        is_vision=is_vision,
    )

    # Call appropriate provider
    if provider == "openai":
        response_text = await _call_openai(model, system_prompt, user_content, is_vision)
    elif provider == "anthropic":
        response_text = await _call_anthropic(model, system_prompt, user_content, is_vision)
    elif provider == "google":
        response_text = await _call_google(model, system_prompt, user_content, is_vision)
    else:
        raise ValueError(f"Unknown provider: {provider}")

    # Parse and validate JSON response
    result = _extract_json(response_text)

    logger.info(
        "LLM call successful",
        agent=agent_name,
        model=model,
        response_keys=list(result.keys()),
    )

    return result


async def call_agent(
    agent_name: AgentName,
    task_payload: dict[str, Any],
    retry_idx: int = 0,
) -> dict[str, Any]:
    """
    Call an agent with automatic LLM failover.

    Tries models in priority order, falling back on rate limits.
    When DEV_MODE=True, returns a deterministic stub instead of calling any LLM.

    Args:
        agent_name: Name of the agent (VISION, PATTERN, PREDICT, SHOPPING, BUDGET)
        task_payload: Payload for the agent
        retry_idx: Current retry index (for failover)

    Returns:
        Agent response dict, or error dict if all models exhausted
    """
    if settings.DEV_MODE:
        from app.services.dev_stubs import get_stub
        stub_fn = get_stub(agent_name)
        if stub_fn:
            logger.info("[DEV_MODE] using stub", agent=agent_name)
            return stub_fn(task_payload)

    model_candidates = MODEL_PRIORITY.get(agent_name, [])

    if retry_idx >= len(model_candidates):
        logger.error(
            "All LLMs exhausted",
            agent=agent_name,
            attempts=retry_idx,
        )
        return {
            "error": "All LLMs exhausted",
            "fallback": "manual_queue",
            "agent": agent_name,
        }

    model = model_candidates[retry_idx]

    try:
        result = await execute_llm(agent_name, model, task_payload)

        # Record usage for cost accounting (non-fatal)
        tenant = task_payload.get("tenant")
        if tenant is not None:
            try:
                from app.core.constants import estimate_llm_cost
                from app.db.repositories.usage_metering import UsageMeteringRepository
                input_tokens = int(task_payload.get("_input_tokens", 0))
                output_tokens = int(task_payload.get("_output_tokens", 0))
                cost = estimate_llm_cost(model, input_tokens, output_tokens)
                await UsageMeteringRepository().record(
                    tenant=tenant,
                    feature=agent_name.lower(),
                    event_type="llm_call",
                    model=model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    cost_usd=cost,
                )
            except Exception as _meter_err:
                logger.debug("Usage metering failed (non-fatal)", error=str(_meter_err))

        return result

    except LLMRateLimitError as e:
        logger.warning(
            "LLM rate limit, trying next model",
            agent=agent_name,
            model=model,
            retry_idx=retry_idx,
            error=str(e),
        )
        # Recurse to next model
        return await call_agent(agent_name, task_payload, retry_idx + 1)

    except LLMParseError as e:
        logger.warning(
            "LLM parse error, trying next model",
            agent=agent_name,
            model=model,
            error=str(e),
        )
        # Try next model on parse errors
        return await call_agent(agent_name, task_payload, retry_idx + 1)

    except Exception as exc:
        # Log and fail fast for non-rate-limit errors
        logger.error(
            "LLM call failed",
            agent=agent_name,
            model=model,
            error=str(exc),
            error_type=type(exc).__name__,
        )
        raise


class OrchestrationService:
    """
    Service for orchestrating complex workflows involving multiple agents.

    This service coordinates the flow between:
    - Vision Agent (scan processing)
    - Pattern Agent (consumption analysis)
    - Predict Agent (demand forecasting)
    - Shopping Agent (list generation)
    - Budget Agent (cost optimization)
    """

    async def process_scan_workflow(
        self,
        scan_id: UUID,
        property_id: UUID,
        user_id: UUID,
        image_url: str,
        scan_type: str = "receipt",
    ) -> dict[str, Any]:
        """
        Orchestrate the full scan processing workflow.

        Flow:
        1. Vision Agent processes images
        2. Inventory is updated
        3. Pattern Agent analyzes new data
        4. Predictions are regenerated

        Args:
            scan_id: ID of the scan to process
            property_id: Property being scanned
            user_id: User who initiated scan
            image_url: URL of the image to process
            scan_type: Type of scan (receipt, shelf, invoice)

        Returns:
            Workflow status and results
        """
        logger.info(
            "Starting scan workflow",
            scan_id=str(scan_id),
            property_id=str(property_id),
        )

        # Queue the scan processing task
        task = celery_app.send_task(
            "scans.process_scan",
            kwargs={
                "scan_id": str(scan_id),
                "property_id": str(property_id),
                "user_id": str(user_id),
                "image_url": image_url,
                "scan_type": scan_type,
            },
            queue="scans",
        )

        return {
            "workflow_id": str(scan_id),
            "task_id": task.id,
            "status": "processing",
            "stages": [
                {"name": "vision_processing", "status": "pending"},
                {"name": "inventory_update", "status": "pending"},
                {"name": "pattern_analysis", "status": "pending"},
                {"name": "prediction_refresh", "status": "pending"},
            ],
        }

    async def generate_predictions_workflow(
        self,
        property_id: UUID,
        request: DemandForecastRequest,
    ) -> dict[str, Any]:
        """
        Orchestrate prediction generation workflow.

        Flow:
        1. Pattern Agent analyzes historical data
        2. Predict Agent generates forecasts
        3. Results are stored and returned

        Args:
            property_id: Property to generate predictions for
            request: Forecast parameters

        Returns:
            Workflow status and task ID
        """
        logger.info(
            "Starting prediction workflow",
            property_id=str(property_id),
            forecast_days=request.forecast_days,
        )

        # Queue the prediction task
        task = celery_app.send_task(
            "app.tasks.prediction_tasks.generate_forecasts",
            args=[str(property_id), request.model_dump()],
            queue="neumas.predictions",
        )

        return {
            "property_id": str(property_id),
            "task_id": task.id,
            "status": "processing",
            "forecast_days": request.forecast_days,
        }

    async def generate_shopping_list_workflow(
        self,
        request: GenerateShoppingListRequest,
        user_id: UUID,
    ) -> dict[str, Any]:
        """
        Orchestrate shopping list generation workflow.

        Flow:
        1. Get low stock items
        2. Get prediction-based needs
        3. Shopping Agent creates optimized list
        4. Budget Agent applies constraints

        Args:
            request: Shopping list generation parameters
            user_id: User creating the list

        Returns:
            Generated shopping list or task status
        """
        logger.info(
            "Starting shopping list workflow",
            property_id=str(request.property_id),
            user_id=str(user_id),
        )

        # For simple cases, process synchronously
        # For complex cases with budget optimization, use async task

        inventory_repo = await get_inventory_repository()
        shopping_repo = await get_shopping_lists_repository()

        items_to_add = []

        # 1. Get low stock items
        if request.include_low_stock:
            low_stock = await inventory_repo.get_low_stock_items(
                request.property_id,
                limit=100,
            )
            for item in low_stock:
                reorder_qty = self._calculate_reorder_quantity(item)
                items_to_add.append({
                    "inventory_item_id": item["id"],
                    "name": item["name"],
                    "quantity": str(reorder_qty),
                    "unit": item.get("unit", "unit"),
                    "priority": "high" if float(item.get("quantity", 0)) == 0 else "normal",
                    "reason": "Low stock",
                    "estimated_price": item.get("cost_per_unit"),
                })

        # 2. Get prediction-based needs
        if request.include_predicted_needs:
            predictions_repo = await get_predictions_repository()
            stockouts = await predictions_repo.get_stockout_predictions(
                request.property_id,
                days_ahead=request.days_ahead,
            )
            for pred in stockouts:
                item_info = pred.get("inventory_item", {})
                if item_info and item_info.get("id") not in [
                    i.get("inventory_item_id") for i in items_to_add
                ]:
                    items_to_add.append({
                        "inventory_item_id": item_info["id"],
                        "name": item_info["name"],
                        "quantity": str(pred.get("predicted_value", 1)),
                        "unit": item_info.get("unit", "unit"),
                        "priority": "normal",
                        "reason": f"Predicted stockout on {pred.get('prediction_date')}",
                    })

        # 3. Create the shopping list
        list_name = request.name or f"Shopping List {datetime.now().strftime('%Y-%m-%d')}"

        shopping_list = await shopping_repo.create({
            "property_id": str(request.property_id),
            "created_by_id": str(user_id),
            "name": list_name,
            "status": "draft",
            "budget_limit": str(request.budget_limit) if request.budget_limit else None,
            "generation_params": request.model_dump(mode="json"),
        })

        # Add items
        if items_to_add:
            await shopping_repo.add_items_batch(
                UUID(shopping_list["id"]),
                items_to_add,
            )

        # Update totals
        await shopping_repo.update_totals(UUID(shopping_list["id"]))

        # Get complete list with items
        result = await shopping_repo.get_by_id(UUID(shopping_list["id"]))

        return {
            "shopping_list_id": shopping_list["id"],
            "status": "completed",
            "items_added": len(items_to_add),
            "result": result,
        }

    def _calculate_reorder_quantity(self, item: dict[str, Any]) -> Decimal:
        """Calculate how much to reorder for an item."""
        current_qty = Decimal(str(item.get("quantity", 0)))
        min_qty = Decimal(str(item.get("min_quantity", 0)))
        max_qty = item.get("max_quantity")
        reorder_point = item.get("reorder_point")

        if max_qty:
            # Order up to max
            return Decimal(str(max_qty)) - current_qty

        if reorder_point:
            # Order to get above reorder point + buffer
            target = Decimal(str(reorder_point)) * Decimal("1.5")
            return max(Decimal("0"), target - current_qty)

        # Default: order min_quantity amount
        return max(min_qty, Decimal("1"))

    async def get_workflow_status(
        self,
        task_id: str,
    ) -> dict[str, Any]:
        """
        Get status of a background workflow.

        Args:
            task_id: Celery task ID

        Returns:
            Task status and result if complete
        """
        result = celery_app.AsyncResult(task_id)

        return {
            "task_id": task_id,
            "status": result.status,
            "result": result.result if result.ready() else None,
            "error": str(result.result) if result.failed() else None,
        }

    async def cancel_workflow(self, task_id: str) -> bool:
        """
        Attempt to cancel a running workflow.

        Args:
            task_id: Celery task ID

        Returns:
            True if cancellation was sent
        """
        celery_app.control.revoke(task_id, terminate=True)
        logger.info("Cancelled workflow", task_id=task_id)
        return True


async def get_orchestration_service() -> OrchestrationService:
    """Get orchestration service instance."""
    return OrchestrationService()
