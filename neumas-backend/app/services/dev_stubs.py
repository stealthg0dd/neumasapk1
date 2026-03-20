"""
Deterministic stub implementations for all LLM agents.

Used when DEV_MODE=True so the full pipeline can be exercised without
any external API keys.  Every function logs its input and returns a
realistic-looking but hard-coded JSON structure.
"""

import json
from datetime import date, timedelta
from typing import Any

from app.core.logging import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _today_plus(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


# ---------------------------------------------------------------------------
# Vision stub  (replaces VisionAgent._call_claude_vision)
# ---------------------------------------------------------------------------

def stub_vision(image_data: dict[str, str]) -> dict[str, Any]:
    """Return a fake receipt extraction result."""
    logger.info(
        "[DEV_MODE] vision stub called",
        media_type=image_data.get("media_type"),
        data_bytes=len(image_data.get("data", "")),
    )
    return {
        "items": [
            {
                "item_name": "Full-Cream Milk 1L",
                "quantity": 12,
                "unit": "1L",
                "unit_price": 2.50,
                "total_price": 30.00,
                "category": "Dairy",
            },
            {
                "item_name": "White Bread Loaf",
                "quantity": 6,
                "unit": "unit",
                "unit_price": 3.00,
                "total_price": 18.00,
                "category": "Dry Goods",
            },
            {
                "item_name": "Mineral Water 500ml",
                "quantity": 24,
                "unit": "500ml",
                "unit_price": 0.80,
                "total_price": 19.20,
                "category": "Beverages",
            },
        ],
        "receipt_metadata": {
            "vendor_name": "Demo Supplier Pte Ltd",
            "receipt_date": date.today().isoformat(),
            "receipt_total": 67.20,
            "currency": "SGD",
        },
        "confidence": 0.95,
        "llm_provider": "stub",
        "llm_model": "dev-stub",
        "usage": {"input_tokens": 0, "output_tokens": 0},
    }


# ---------------------------------------------------------------------------
# Agent stubs  (replace call_agent in orchestration_service)
# ---------------------------------------------------------------------------

def stub_pattern(task_payload: dict[str, Any]) -> dict[str, Any]:
    logger.info("[DEV_MODE] pattern stub called", payload_keys=list(task_payload.keys()))
    return {
        "patterns": [
            {
                "item_id": "stub-item-1",
                "avg_daily_consumption": 2.5,
                "weekly_pattern": {
                    "monday": 2.0,
                    "tuesday": 2.5,
                    "wednesday": 3.0,
                    "thursday": 2.5,
                    "friday": 3.5,
                    "saturday": 2.0,
                    "sunday": 1.5,
                },
                "confidence": 0.82,
                "trend": "stable",
                "seasonality": "weekly",
            }
        ],
        "insights": [
            "Consumption peaks on Fridays — likely weekend prep.",
            "Weekend usage drops ~35% vs weekday average.",
        ],
    }


def stub_predict(task_payload: dict[str, Any]) -> dict[str, Any]:
    logger.info("[DEV_MODE] predict stub called", payload_keys=list(task_payload.keys()))
    return {
        "predictions": [
            {
                "item_id": "stub-item-1",
                "item_name": "Full-Cream Milk 1L",
                "current_qty": 4,
                "predicted_runout_date": _today_plus(2),
                "days_until_runout": 2,
                "urgency": "critical",
                "recommended_reorder_qty": 12,
                "confidence": 0.88,
            },
            {
                "item_id": "stub-item-2",
                "item_name": "White Bread Loaf",
                "current_qty": 3,
                "predicted_runout_date": _today_plus(5),
                "days_until_runout": 5,
                "urgency": "urgent",
                "recommended_reorder_qty": 6,
                "confidence": 0.79,
            },
        ],
        "summary": {
            "critical_count": 1,
            "urgent_count": 1,
            "total_items_forecasted": 2,
        },
    }


def stub_shopping(task_payload: dict[str, Any]) -> dict[str, Any]:
    logger.info("[DEV_MODE] shopping stub called", payload_keys=list(task_payload.keys()))
    return {
        "shopping_list": {
            "name": "Weekly Restock (stub)",
            "items": [
                {
                    "item_name": "Full-Cream Milk 1L",
                    "quantity": 12,
                    "unit": "1L",
                    "priority": "critical",
                    "reason": "Predicted runout in 2 days",
                    "estimated_price": 2.50,
                },
                {
                    "item_name": "White Bread Loaf",
                    "quantity": 6,
                    "unit": "unit",
                    "priority": "high",
                    "reason": "Predicted runout in 5 days",
                    "estimated_price": 3.00,
                },
                {
                    "item_name": "Mineral Water 500ml",
                    "quantity": 24,
                    "unit": "500ml",
                    "priority": "normal",
                    "reason": "Weekly replenishment",
                    "estimated_price": 0.80,
                },
            ],
            "grouped_by_store": {
                "Demo Supplier": [
                    "Full-Cream Milk 1L",
                    "White Bread Loaf",
                    "Mineral Water 500ml",
                ]
            },
        },
        "total_items": 3,
        "estimated_total": 67.20,
    }


def stub_budget(task_payload: dict[str, Any]) -> dict[str, Any]:
    logger.info("[DEV_MODE] budget stub called", payload_keys=list(task_payload.keys()))
    return {
        "optimizations": [
            {
                "original_item": "Full-Cream Milk 1L",
                "suggestion": "Switch to house-brand 2L cartons — saves ~20%",
                "savings_estimate": 6.00,
                "reason": "Generic brand available at same supplier",
            },
        ],
        "summary": {
            "total_potential_savings": 6.00,
            "recommendations": [
                "Buy milk in 2L cartons for better unit price.",
                "Order water in case quantities for 15% bulk discount.",
            ],
        },
    }


# Registry so call_agent can dispatch by name
_STUBS = {
    "PATTERN": stub_pattern,
    "PREDICT": stub_predict,
    "SHOPPING": stub_shopping,
    "BUDGET": stub_budget,
    "VISION": stub_vision,  # accessed directly in vision_agent.py
}


def get_stub(agent_name: str) -> Any:
    """Return the stub function for a given agent name, or None."""
    return _STUBS.get(agent_name.upper())
