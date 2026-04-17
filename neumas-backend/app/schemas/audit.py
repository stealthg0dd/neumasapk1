"""
Audit schemas — request/response types for audit log endpoints.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class AuditLogEntry(BaseModel):
    id: UUID
    org_id: UUID
    property_id: UUID | None = None
    actor_id: UUID | None = None
    actor_role: str | None = None
    action: str
    resource_type: str
    resource_id: str | None = None
    before_state: dict[str, Any] | None = None
    after_state: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None
    ip_address: str | None = None
    created_at: datetime


class AuditLogListResponse(BaseModel):
    entries: list[AuditLogEntry]
    total: int
    page: int
    page_size: int


class UsageSummary(BaseModel):
    org_id: UUID
    period_start: datetime
    period_end: datetime
    documents_scanned: int
    line_items_processed: int
    exports_generated: int
    active_users: int
    active_properties: int
    llm_calls: int
    llm_cost_usd: float
    breakdown: dict[str, Any]
