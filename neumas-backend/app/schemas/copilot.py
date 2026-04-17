"""
Pydantic schemas for Copilot tool calls and responses.

Each tool has a request schema (inputs) and a response schema (outputs).
The CopilotToolRequest envelope wraps any tool call with a common header.
"""

from __future__ import annotations

from typing import Any, Literal, Union
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Tool: search_documents
# ---------------------------------------------------------------------------

class SearchDocumentsInput(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    document_type: str | None = None
    vendor_name: str | None = None
    limit: int = Field(10, ge=1, le=50)


class SearchDocumentsResult(BaseModel):
    documents: list[dict[str, Any]]
    total: int
    query: str


# ---------------------------------------------------------------------------
# Tool: explain_prediction
# ---------------------------------------------------------------------------

class ExplainPredictionInput(BaseModel):
    item_id: UUID
    horizon_days: int = Field(7, ge=1, le=90)


class ExplainPredictionResult(BaseModel):
    item_id: str
    item_name: str
    predicted_stockout_days: float | None
    confidence: float
    reasoning: str
    contributing_factors: list[str]


# ---------------------------------------------------------------------------
# Tool: compare_vendors
# ---------------------------------------------------------------------------

class CompareVendorsInput(BaseModel):
    item_name: str = Field(..., min_length=1, max_length=200)
    vendor_ids: list[UUID] | None = None


class VendorPriceSummary(BaseModel):
    vendor_id: str
    vendor_name: str
    last_price: float | None
    avg_price_30d: float | None
    price_change_pct: float | None


class CompareVendorsResult(BaseModel):
    item_name: str
    vendors: list[VendorPriceSummary]
    cheapest_vendor_id: str | None
    recommendation: str


# ---------------------------------------------------------------------------
# Tool: summarize_outlet_risk
# ---------------------------------------------------------------------------

class SummarizeOutletRiskInput(BaseModel):
    property_id: UUID
    include_snoozed: bool = False


class OutletRiskSummary(BaseModel):
    property_id: str
    open_alerts: int
    critical_alerts: int
    low_stock_items: int
    days_since_last_scan: int | None
    overall_risk: Literal["low", "medium", "high", "critical"]
    top_concerns: list[str]


# ---------------------------------------------------------------------------
# Tool: generate_reorder_plan
# ---------------------------------------------------------------------------

class GenerateReorderPlanInput(BaseModel):
    property_id: UUID
    budget_limit: float | None = None
    days_ahead: int = Field(7, ge=1, le=30)
    preferred_vendor_id: UUID | None = None


class ReorderLineItem(BaseModel):
    item_id: str
    item_name: str
    current_qty: float
    reorder_qty: float
    unit: str
    estimated_cost: float | None
    vendor_name: str | None


class GenerateReorderPlanResult(BaseModel):
    property_id: str
    items: list[ReorderLineItem]
    total_estimated_cost: float | None
    within_budget: bool | None
    generated_at: str


# ---------------------------------------------------------------------------
# Envelope
# ---------------------------------------------------------------------------

CopilotToolInput = Union[
    SearchDocumentsInput,
    ExplainPredictionInput,
    CompareVendorsInput,
    SummarizeOutletRiskInput,
    GenerateReorderPlanInput,
]

CopilotToolOutput = Union[
    SearchDocumentsResult,
    ExplainPredictionResult,
    CompareVendorsResult,
    OutletRiskSummary,
    GenerateReorderPlanResult,
]


class CopilotToolRequest(BaseModel):
    """Envelope wrapping a copilot tool call."""

    tool: Literal[
        "search_documents",
        "explain_prediction",
        "compare_vendors",
        "summarize_outlet_risk",
        "generate_reorder_plan",
    ]
    input: dict[str, Any] = Field(
        ...,
        description="Tool-specific input; validated against the tool's schema in CopilotToolService.",
    )
    context_property_id: UUID | None = Field(
        None,
        description="Property context to scope the tool call.",
    )


class CopilotToolResponse(BaseModel):
    """Envelope wrapping a copilot tool response."""

    tool: str
    ok: bool
    result: CopilotToolOutput | None = None
    error: str | None = None
