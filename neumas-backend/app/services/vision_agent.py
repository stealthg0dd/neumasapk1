"""
Vision Agent for processing receipt/scan images.

Uses Claude 3.5 Sonnet (Anthropic SDK) to extract inventory items from images.
Specializes in B2B procurement receipt parsing with quantity normalization.
"""

import base64
import asyncio
import json
import re
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# =============================================================================
# System Prompt for Receipt Processing
# =============================================================================

VISION_SYSTEM_PROMPT = """You are a B2B Procurement Expert. Extract items from this receipt into a JSON list.

Required fields for each item:
- item_name: The name of the product (cleaned and normalized)
- quantity: Numeric quantity (see normalization rules below)
- unit: Unit of measurement (e.g., "1L", "kg", "pack", "unit", "case")
- unit_price: Price per unit (numeric, no currency symbol)
- total_price: Total line price (numeric, no currency symbol)
- category: One of: "Dairy", "Produce", "Meat", "Dry Goods", "Beverages", "Alcohol", "Cleaning", "Other"

NORMALIZATION RULES:
- If an item is "Case of 12x 1L Milk", normalize to: quantity: 12, unit: "1L", item_name: "Milk"
- If "Pack of 6 Water Bottles 500ml", normalize to: quantity: 6, unit: "500ml", item_name: "Water Bottle"
- If "24x Eggs", normalize to: quantity: 24, unit: "unit", item_name: "Eggs"
- If "2kg Flour", normalize to: quantity: 2, unit: "kg", item_name: "Flour"
- Extract numeric multipliers from descriptions (e.g., "6-pack", "12x", "case of 24")
- Default unit is "unit" if not specified

OUTPUT FORMAT:
Return ONLY valid JSON in this exact structure:
{
    "items": [
        {
            "item_name": "string",
            "quantity": number,
            "unit": "string",
            "unit_price": number,
            "total_price": number,
            "category": "string"
        }
    ],
    "receipt_metadata": {
        "vendor_name": "string or null",
        "receipt_date": "YYYY-MM-DD or null",
        "receipt_total": number or null,
        "currency": "USD" or detected currency
    },
    "confidence": 0.0 to 1.0
}

Do not include any explanation or markdown - return ONLY the JSON object."""


class VisionAgent:
    """
    AI agent for processing inventory scan images using Claude 3.5 Sonnet.

    Specializes in B2B procurement receipts with:
    - Quantity normalization (cases, packs, multipacks)
    - Category classification
    - Price extraction
    """

    def __init__(self) -> None:
        """Initialize the VisionAgent with Anthropic client."""
        self.model = "claude-sonnet-4-6"
        self.max_tokens = 4096

        if not settings.ANTHROPIC_API_KEY:
            logger.warning("ANTHROPIC_API_KEY not set - VisionAgent will fail")

    async def analyze_receipt(
        self,
        image_url: str,
        scan_type: str = "receipt",
    ) -> dict[str, Any]:
        """
        Analyze a receipt image and extract items.

        Args:
            image_url: URL of the receipt image
            scan_type: Type of scan (receipt, barcode)

        Returns:
            Dict with extracted items, metadata, and confidence
        """
        logger.info(
            "Starting receipt analysis",
            image_url=image_url[:80] + "..." if len(image_url) > 80 else image_url,
            scan_type=scan_type,
        )

        try:
            # Fetch image and convert to base64
            image_data = await self._fetch_image(image_url)
            if not image_data:
                return self._error_response("Failed to fetch image from URL")

            # Call Claude Vision API
            result = await self._call_claude_vision(image_data)

            if "error" in result:
                return result

            # Post-process and validate
            processed = self._post_process_results(result)

            logger.info(
                "Receipt analysis complete",
                items_extracted=len(processed.get("items", [])),
                confidence=processed.get("confidence", 0),
            )

            return processed

        except Exception as e:
            logger.exception("Receipt analysis failed", error=str(e))
            return self._error_response(str(e))

    async def _fetch_image(self, image_url: str) -> dict[str, str] | None:
        """
        Fetch image from URL and return base64 encoded data.

        Returns:
            Dict with 'data' (base64) and 'media_type', or None on failure
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(image_url)
                response.raise_for_status()

                # Detect media type
                content_type = response.headers.get("content-type", "image/jpeg")
                if ";" in content_type:
                    content_type = content_type.split(";")[0].strip()

                # Validate it's an image
                if not content_type.startswith("image/"):
                    logger.error("URL does not point to an image", content_type=content_type)
                    return None

                # Convert to base64
                image_bytes = response.content
                base64_data = base64.standard_b64encode(image_bytes).decode("utf-8")

                return {
                    "data": base64_data,
                    "media_type": content_type,
                }

        except httpx.HTTPStatusError as e:
            logger.error("HTTP error fetching image", status=e.response.status_code, url=image_url[:80])
            return None
        except Exception as e:
            logger.error("Failed to fetch image", error=str(e), url=image_url[:80])
            return None

    async def _call_claude_vision(
        self,
        image_data: dict[str, str],
    ) -> dict[str, Any]:
        """
        Call Claude 3.5 Sonnet Vision API.

        When DEV_MODE=True returns a deterministic stub without any network call.

        Args:
            image_data: Dict with 'data' (base64) and 'media_type'

        Returns:
            Parsed JSON response or error dict
        """
        if settings.DEV_MODE:
            from app.services.dev_stubs import stub_vision
            return stub_vision(image_data)

        # Lazy import Anthropic to avoid import issues if not installed
        try:
            import anthropic
        except ImportError:
            logger.error("anthropic package not installed")
            return self._error_response("anthropic package not installed")

        if not settings.ANTHROPIC_API_KEY:
            return self._error_response("ANTHROPIC_API_KEY not configured")

        try:
            # Use AsyncAnthropic so the event loop is not blocked during the
            # API call — the synchronous Anthropic() client would freeze all
            # concurrent requests for the duration of the LLM round-trip.
            client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

            # Build the message with image
            try:
                message = await asyncio.wait_for(
                    client.messages.create(
                        model=self.model,
                        max_tokens=self.max_tokens,
                        system=VISION_SYSTEM_PROMPT,
                        messages=[
                            {
                                "role": "user",
                                "content": [
                                    {
                                        "type": "image",
                                        "source": {
                                            "type": "base64",
                                            "media_type": image_data["media_type"],
                                            "data": image_data["data"],
                                        },
                                    },
                                    {
                                        "type": "text",
                                        "text": "Extract all items from this receipt image. Follow the normalization rules carefully.",
                                    },
                                ],
                            }
                        ],
                    ),
                    timeout=45,
                )
            except asyncio.TimeoutError:
                logger.error("OCR provider timed out", provider="anthropic", model=self.model, timeout_seconds=45)
                return self._error_response("OCR provider timeout after 45 seconds")

            # Extract text response
            response_text = message.content[0].text

            # Parse JSON from response
            parsed = self._parse_json_response(response_text)

            if parsed is None:
                return self._error_response("Failed to parse LLM response as JSON")

            # Add LLM metadata
            parsed["llm_provider"] = "anthropic"
            parsed["llm_model"] = self.model
            parsed["usage"] = {
                "input_tokens": message.usage.input_tokens,
                "output_tokens": message.usage.output_tokens,
            }

            return parsed

        except Exception as e:
            # Check for specific Anthropic errors
            error_name = type(e).__name__
            if "RateLimitError" in error_name:
                logger.error("Anthropic rate limit exceeded", error=str(e))
                return self._error_response(f"Rate limit exceeded: {e}")
            elif "APIError" in error_name:
                logger.error("Anthropic API error", error=str(e))
                return self._error_response(f"API error: {e}")
            else:
                logger.exception("Claude Vision call failed", error=str(e))
                return self._error_response(str(e))

    def _parse_json_response(self, response_text: str) -> dict[str, Any] | None:
        """
        Parse JSON from LLM response, handling potential markdown wrapping.
        """
        text = response_text.strip()

        # Try direct parse first
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Try to extract JSON from markdown code blocks
        patterns = [
            r"```json\s*([\s\S]*?)\s*```",
            r"```\s*([\s\S]*?)\s*```",
            r"\{[\s\S]*\}",
        ]

        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                try:
                    json_str = match.group(1) if "```" in pattern else match.group(0)
                    return json.loads(json_str)
                except json.JSONDecodeError:
                    continue

        logger.error("Failed to parse JSON from response", response_preview=text[:200])
        return None

    def _post_process_results(self, result: dict[str, Any]) -> dict[str, Any]:
        """
        Post-process and validate extracted items.

        - Ensures all required fields exist
        - Normalizes quantities and units
        - Validates categories
        """
        items = result.get("items", [])
        processed_items = []

        valid_categories = {
            "Dairy", "Produce", "Meat", "Dry Goods",
            "Beverages", "Alcohol", "Cleaning", "Other"
        }

        for item in items:
            processed = {
                "item_name": str(item.get("item_name", "Unknown")).strip(),
                "quantity": self._normalize_quantity(item.get("quantity", 1)),
                "unit": str(item.get("unit", "unit")).strip(),
                "unit_price": self._normalize_price(item.get("unit_price")),
                "total_price": self._normalize_price(item.get("total_price")),
                "category": item.get("category", "Other"),
            }

            # Validate category
            if processed["category"] not in valid_categories:
                processed["category"] = "Other"

            # Additional normalization from item_name
            processed = self._extract_quantity_from_name(processed)

            processed_items.append(processed)

        return {
            "items": processed_items,
            "receipt_metadata": result.get("receipt_metadata", {}),
            "confidence": float(result.get("confidence", 0.8)),
            "llm_provider": result.get("llm_provider"),
            "llm_model": result.get("llm_model"),
            "usage": result.get("usage"),
        }

    def _normalize_quantity(self, qty: Any) -> float:
        """Normalize quantity to a float."""
        if qty is None:
            return 1.0
        try:
            return float(qty)
        except (ValueError, TypeError):
            return 1.0

    def _normalize_price(self, price: Any) -> float | None:
        """Normalize price to a float or None."""
        if price is None:
            return None
        try:
            # Remove currency symbols and commas
            if isinstance(price, str):
                price = re.sub(r"[?$?,]", "", price.strip())
            return float(price)
        except (ValueError, TypeError):
            return None

    def _extract_quantity_from_name(self, item: dict[str, Any]) -> dict[str, Any]:
        """
        Extract quantity multipliers from item names.

        Examples:
        - "Case of 12x 1L Milk" -> quantity: 12, unit: "1L", name: "Milk"
        - "6-pack Beer 330ml" -> quantity: 6, unit: "330ml", name: "Beer"
        """
        name = item["item_name"]

        # Pattern: "Case of Nx" or "Pack of N"
        case_match = re.search(r"(?:case|pack|box)\s*(?:of)?\s*(\d+)\s*x?\s*", name, re.IGNORECASE)
        if case_match:
            multiplier = int(case_match.group(1))
            # Only update if current quantity is 1 (not already normalized)
            if item["quantity"] == 1:
                item["quantity"] = float(multiplier)
            # Clean name
            item["item_name"] = re.sub(r"(?:case|pack|box)\s*(?:of)?\s*\d+\s*x?\s*", "", name, flags=re.IGNORECASE).strip()

        # Pattern: "Nx" at start or "N-pack"
        nx_match = re.search(r"^(\d+)\s*x\s*", name, re.IGNORECASE)
        if nx_match:
            multiplier = int(nx_match.group(1))
            if item["quantity"] == 1:
                item["quantity"] = float(multiplier)
            item["item_name"] = re.sub(r"^\d+\s*x\s*", "", name, flags=re.IGNORECASE).strip()

        # Pattern: "N-pack"
        pack_match = re.search(r"(\d+)-?pack", name, re.IGNORECASE)
        if pack_match:
            multiplier = int(pack_match.group(1))
            if item["quantity"] == 1:
                item["quantity"] = float(multiplier)
            item["item_name"] = re.sub(r"\d+-?pack\s*", "", name, flags=re.IGNORECASE).strip()

        # Extract unit from name if present (e.g., "1L", "500ml", "2kg")
        unit_match = re.search(r"(\d+(?:\.\d+)?)\s*(ml|l|L|kg|g|oz|lb)\b", name)
        if unit_match and item["unit"] == "unit":
            item["unit"] = unit_match.group(0)

        return item

    def _error_response(self, message: str) -> dict[str, Any]:
        """Create standardized error response."""
        return {
            "error": message,
            "items": [],
            "confidence": 0.0,
        }


# =============================================================================
# Factory Function
# =============================================================================

_vision_agent_instance: VisionAgent | None = None


async def get_vision_agent() -> VisionAgent:
    """Get or create VisionAgent singleton."""
    global _vision_agent_instance
    if _vision_agent_instance is None:
        _vision_agent_instance = VisionAgent()
    return _vision_agent_instance
