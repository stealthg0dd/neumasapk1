"""
Admin schemas.
"""

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


# ============================================================================
# System Health & Monitoring
# ============================================================================


class HealthCheckResponse(BaseModel):
    """Health check response."""

    status: str = "healthy"
    version: str
    environment: str
    timestamp: datetime


class ReadinessCheckResponse(BaseModel):
    """Readiness check with dependency status."""

    status: str
    checks: dict[str, "DependencyStatus"]
    timestamp: datetime


class DependencyStatus(BaseModel):
    """Status of a dependency."""

    connected: bool
    latency_ms: float | None = None
    error: str | None = None


class SystemStatsResponse(BaseModel):
    """System statistics."""

    total_organizations: int
    total_properties: int
    total_users: int
    total_inventory_items: int
    total_scans_today: int
    total_predictions_generated: int
    active_shopping_lists: int


# ============================================================================
# Organization Administration
# ============================================================================


class AdminOrganizationCreate(BaseModel):
    """Admin create organization."""

    name: str = Field(..., min_length=2, max_length=255)
    slug: str = Field(..., min_length=2, max_length=100)
    subscription_tier: str = "free"
    subscription_status: str = "active"
    settings: dict[str, Any] = Field(default_factory=dict)
    owner_email: str
    owner_name: str


class AdminOrganizationUpdate(BaseModel):
    """Admin update organization."""

    name: str | None = None
    subscription_tier: str | None = None
    subscription_status: str | None = None
    settings: dict[str, Any] | None = None


class AdminOrganizationResponse(BaseModel):
    """Admin organization view."""

    id: UUID
    name: str
    slug: str
    subscription_tier: str
    subscription_status: str
    settings: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    user_count: int
    property_count: int
    last_activity_at: datetime | None = None

    model_config = {"from_attributes": True}


class OrganizationListRequest(BaseModel):
    """Request to list organizations."""

    search: str | None = None
    subscription_tier: str | None = None
    subscription_status: str | None = None
    sort_by: str = "created_at"
    sort_order: str = "desc"
    page: int = 1
    page_size: int = 20


class OrganizationListResponse(BaseModel):
    """Paginated organization list."""

    items: list[AdminOrganizationResponse]
    total: int
    page: int
    page_size: int


# ============================================================================
# User Administration
# ============================================================================


class AdminUserResponse(BaseModel):
    """Admin user view."""

    id: UUID
    auth_id: UUID
    email: str
    full_name: str | None
    role: str
    organization_id: UUID
    organization_name: str | None = None
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminUserUpdate(BaseModel):
    """Admin update user."""

    role: str | None = None
    is_active: bool | None = None
    permissions: dict[str, bool] | None = None


class UserListRequest(BaseModel):
    """Request to list users."""

    search: str | None = None
    organization_id: UUID | None = None
    role: str | None = None
    is_active: bool | None = None
    page: int = 1
    page_size: int = 20


class UserListResponse(BaseModel):
    """Paginated user list."""

    items: list[AdminUserResponse]
    total: int
    page: int
    page_size: int


# ============================================================================
# Background Jobs / Tasks
# ============================================================================


class TaskStatusResponse(BaseModel):
    """Celery task status."""

    task_id: str
    status: str  # PENDING, STARTED, SUCCESS, FAILURE, RETRY
    result: Any | None = None
    error: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


class TaskListResponse(BaseModel):
    """List of tasks."""

    items: list[TaskStatusResponse]
    total: int


class TriggerTaskRequest(BaseModel):
    """Request to manually trigger a background task."""

    task_name: str
    args: list[Any] = Field(default_factory=list)
    kwargs: dict[str, Any] = Field(default_factory=dict)
    queue: str | None = None


class TriggerTaskResponse(BaseModel):
    """Response after triggering a task."""

    task_id: str
    status: str
    message: str


# ============================================================================
# Audit Logs
# ============================================================================


class AuditLog(BaseModel):
    """Audit log entry."""

    id: UUID
    user_id: UUID | None
    action: str
    resource_type: str
    resource_id: UUID | None
    details: dict[str, Any]
    ip_address: str | None
    user_agent: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
class TriggerTaskResponse(BaseModel):
    """Response after triggering task."""

    task_id: str
    status: str = "PENDING"
    message: str = "Task queued successfully"


# ============================================================================
# Audit Log
# ============================================================================


class AuditLogEntry(BaseModel):
    """Audit log entry."""

    id: UUID
    timestamp: datetime
    user_id: UUID | None
    user_email: str | None
    organization_id: UUID | None
    action: str
    resource_type: str
    resource_id: str | None
    details: dict[str, Any]
    ip_address: str | None


class AuditLogRequest(BaseModel):
    """Request to query audit logs."""

    organization_id: UUID | None = None
    user_id: UUID | None = None
    action: str | None = None
    resource_type: str | None = None
    from_date: datetime | None = None
    to_date: datetime | None = None
    page: int = 1
    page_size: int = 50


class AuditLogResponse(BaseModel):
    """Paginated audit log."""

    items: list[AuditLogEntry]
    total: int
    page: int
    page_size: int


# ============================================================================
# Feature Flags / Configuration
# ============================================================================


class FeatureFlagResponse(BaseModel):
    """Feature flag response."""

    name: str
    enabled: bool
    description: str | None = None
    organization_overrides: dict[str, bool] = Field(default_factory=dict)


class FeatureFlagUpdate(BaseModel):
    """Update feature flag."""

    enabled: bool | None = None
    organization_overrides: dict[str, bool] | None = None


class SystemConfigResponse(BaseModel):
    """System configuration."""

    feature_flags: dict[str, bool]
    rate_limits: dict[str, int]
    maintenance_mode: bool
    announcement: str | None = None


class SystemConfigUpdate(BaseModel):
    """Update system configuration."""

    feature_flags: dict[str, bool] | None = None
    rate_limits: dict[str, int] | None = None
    maintenance_mode: bool | None = None
    announcement: str | None = None


# ============================================================================
# B2B Admin Dashboard Schemas
# ============================================================================


class CriticalAlertItem(BaseModel):
    """Top critical alert item."""

    item_name: str
    alert_count: int
    avg_days_to_stockout: float | None = None


class DashboardResponse(BaseModel):
    """Admin dashboard summary for an organization."""

    org_id: UUID
    properties_count: int
    total_active_predictions: int
    total_monthly_savings_estimate: Decimal
    currency: str = "SGD"
    top_critical_alerts: list[CriticalAlertItem]
    generated_at: datetime


class ExportRow(BaseModel):
    """Single row for CSV export."""

    date: datetime
    property_name: str
    item_name: str
    predicted_runout_date: datetime | None
    urgency: Literal["critical", "urgent", "soon", "later"]
    savings_estimate: Decimal | None


class ExportResponse(BaseModel):
    """Export response with CSV data."""

    org_id: UUID
    rows: list[ExportRow]
    total_rows: int
    exported_at: datetime


# Forward refs
ReadinessCheckResponse.model_rebuild()
