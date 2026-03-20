"""
Prediction schemas.
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class PredictionBase(BaseModel):
    """Base prediction fields."""

    prediction_type: Literal["demand", "stockout", "reorder"]
    prediction_date: datetime


class PredictionCreate(PredictionBase):
    """Create prediction (internal use)."""

    property_id: UUID
    item_id: UUID | None = None
    predicted_value: Decimal
    confidence_interval_low: Decimal | None = None
    confidence_interval_high: Decimal | None = None
    confidence: Decimal
    model_version: str | None = None
    features_used: dict[str, Any] = Field(default_factory=dict)


class PredictionResponse(PredictionBase):
    """Prediction response."""

    id: UUID
    property_id: UUID
    item_id: UUID | None
    predicted_value: Decimal
    confidence_interval_low: Decimal | None
    confidence_interval_high: Decimal | None
    confidence: Decimal
    model_version: str | None
    actual_value: Decimal | None
    created_at: datetime
    item_name: str | None = None  # Joined from inventory_items

    model_config = {"from_attributes": True}


class PredictionListRequest(BaseModel):
    """Request to list predictions."""

    property_id: UUID
    prediction_type: Literal["demand", "stockout", "reorder"] | None = None
    item_id: UUID | None = None
    from_date: datetime | None = None
    to_date: datetime | None = None
    limit: int = Field(default=100, le=500)


class PredictionListResponse(BaseModel):
    """Paginated prediction list."""

    items: list[PredictionResponse]
    total: int


# ============================================================================
# Demand Forecast Schemas
# ============================================================================


class DemandForecastRequest(BaseModel):
    """Request demand forecast."""

    property_id: UUID
    item_ids: list[UUID] | None = Field(None, max_length=100)
    forecast_days: int = Field(default=30, ge=1, le=365)
    include_confidence_intervals: bool = True


class DemandForecastItem(BaseModel):
    """Demand forecast for single item."""

    item_id: UUID
    item_name: str
    current_quantity: Decimal
    forecasts: list["DailyForecast"]
    stockout_date: datetime | None = None
    reorder_date: datetime | None = None


class DailyForecast(BaseModel):
    """Daily demand forecast."""

    date: datetime
    predicted_demand: Decimal
    confidence_interval_low: Decimal | None = None
    confidence_interval_high: Decimal | None = None
    expected_quantity: Decimal


class DemandForecastResponse(BaseModel):
    """Demand forecast response."""

    property_id: UUID
    forecast_generated_at: datetime
    forecast_days: int
    items: list[DemandForecastItem]
    summary: "ForecastSummary"


class ForecastSummary(BaseModel):
    """Summary of forecast results."""

    total_items_forecasted: int
    items_needing_reorder: int
    predicted_stockouts: int
    days_until_first_stockout: int | None = None
    total_predicted_demand: Decimal


# ============================================================================
# Stockout Prediction Schemas
# ============================================================================


class StockoutPredictionRequest(BaseModel):
    """Request stockout predictions."""

    property_id: UUID
    days_ahead: int = Field(default=14, ge=1, le=90)
    confidence_threshold: float = Field(default=0.7, ge=0, le=1)


class StockoutPrediction(BaseModel):
    """Stockout prediction for an item."""

    item_id: UUID
    item_name: str
    current_quantity: Decimal
    predicted_stockout_date: datetime
    days_until_stockout: int
    confidence: Decimal
    recommended_order_quantity: Decimal | None = None


class StockoutPredictionResponse(BaseModel):
    """Stockout predictions response."""

    property_id: UUID
    generated_at: datetime
    days_ahead: int
    predictions: list[StockoutPrediction]
    critical_count: int
    warning_count: int


# ============================================================================
# Pattern Schemas
# ============================================================================


class ConsumptionPatternResponse(BaseModel):
    """Consumption pattern response."""

    id: UUID
    item_id: UUID
    item_name: str | None = None
    pattern_type: str
    pattern_data: dict[str, Any]
    confidence: Decimal
    sample_size: int
    valid_from: datetime | None
    valid_until: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PatternAnalysisRequest(BaseModel):
    """Request pattern analysis for items."""

    property_id: UUID
    item_ids: list[UUID] | None = None
    pattern_types: list[str] | None = Field(
        None,
        description="Types: daily, weekly, seasonal, event",
    )


class PatternAnalysisResponse(BaseModel):
    """Pattern analysis results."""

    property_id: UUID
    analyzed_items: int
    patterns_found: int
    patterns: list[ConsumptionPatternResponse]


# ============================================================================
# Accuracy Tracking Schemas
# ============================================================================


class PredictionAccuracyRequest(BaseModel):
    """Request prediction accuracy metrics."""

    property_id: UUID
    prediction_type: Literal["demand", "stockout", "reorder"]
    days: int = Field(default=30, ge=7, le=365)


class PredictionAccuracyResponse(BaseModel):
    """Prediction accuracy metrics."""

    property_id: UUID
    prediction_type: str
    period_days: int
    sample_size: int
    mean_absolute_error: Decimal | None = None
    mean_absolute_percentage_error: Decimal | None = None
    accuracy_percentage: Decimal | None = None


# ============================================================================
# Accuracy Tracking Schemas
# ============================================================================


class PredictionAccuracyRequest(BaseModel):
    """Request prediction accuracy metrics."""

    property_id: UUID
    prediction_type: Literal["demand", "stockout", "reorder"]
    days: int = Field(default=30, ge=7, le=365)


class PredictionAccuracyResponse(BaseModel):
    """Prediction accuracy metrics."""

    property_id: UUID
    prediction_type: str
    period_days: int
    sample_size: int
    mean_absolute_error: float | None
    mean_absolute_percentage_error: float | None
    accuracy_percentage: float | None


# ============================================================================
# Urgency-Ordered Prediction Schemas
# ============================================================================


class UrgencyBucket(str, Enum):
    """Urgency levels for predictions."""

    CRITICAL = "critical"  # <= 3 days
    URGENT = "urgent"      # 4-7 days
    SOON = "soon"          # 8-14 days
    LATER = "later"        # > 14 days


class PredictionItem(BaseModel):
    """Single prediction item with urgency."""

    item_id: UUID
    item_name: str
    current_qty: Decimal
    predicted_runout_date: datetime | None
    days_until_runout: int | None
    urgency: UrgencyBucket
    confidence: float
    recommended_qty: Decimal | None = None


class UrgencyOrderedPredictionsResponse(BaseModel):
    """Predictions grouped and ordered by urgency."""

    property_id: UUID
    generated_at: datetime
    critical: list[PredictionItem] = Field(default_factory=list, description="<= 3 days")
    urgent: list[PredictionItem] = Field(default_factory=list, description="4-7 days")
    soon: list[PredictionItem] = Field(default_factory=list, description="8-14 days")
    later: list[PredictionItem] = Field(default_factory=list, description="> 14 days")
    total_items: int


# Forward refs
DemandForecastResponse.model_rebuild()
