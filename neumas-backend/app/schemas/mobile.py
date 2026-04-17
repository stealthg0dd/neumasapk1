"""
Mobile request schemas.

These schemas enforce the conventions required for offline-queue safety:
  - client_operation_id  (UUID v4, client-generated, idempotency key)
  - device_id            (stable per-device identifier)
  - submitted_at_client  (ISO 8601 timestamp from device clock)

The server validates that submitted_at_client is within
MAX_OFFLINE_QUEUE_AGE_DAYS of the current time.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.core.constants import MAX_OFFLINE_QUEUE_AGE_DAYS


class MobileBaseRequest(BaseModel):
    """
    Base class for all mobile-submitted requests.

    Subclass this to add domain-specific fields.
    """

    client_operation_id: UUID = Field(
        ...,
        description="Client-generated UUID v4 used as an idempotency key.",
    )
    device_id: str = Field(
        ...,
        min_length=1,
        max_length=128,
        description="Stable per-device identifier (UUID or platform device ID).",
    )
    submitted_at_client: datetime = Field(
        ...,
        description="ISO 8601 UTC timestamp of when the operation was created on the device.",
    )

    @field_validator("submitted_at_client", mode="after")
    @classmethod
    def validate_not_too_old(cls, v: datetime) -> datetime:
        cutoff = datetime.now(UTC) - timedelta(days=MAX_OFFLINE_QUEUE_AGE_DAYS)
        if v.tzinfo is None:
            v = v.replace(tzinfo=UTC)
        if v < cutoff:
            raise ValueError(
                f"submitted_at_client is too old (max age: {MAX_OFFLINE_QUEUE_AGE_DAYS} days)."
            )
        return v


class MobileScanUploadRequest(MobileBaseRequest):
    """
    Mobile scan upload metadata (paired with the multipart file upload).
    """

    scan_type: str = Field(
        "receipt",
        pattern="^(receipt|barcode)$",
        description="Type of scan: 'receipt' or 'barcode'.",
    )
    property_id: UUID = Field(..., description="Property being scanned.")
    notes: str | None = Field(None, max_length=500)


class MobileInventoryAdjustRequest(MobileBaseRequest):
    """
    Offline inventory adjustment submitted from a mobile client.
    """

    item_id: UUID = Field(..., description="Inventory item to adjust.")
    quantity_delta: float = Field(..., description="Positive = add, negative = consume.")
    reason: str | None = Field(None, max_length=200)


class MobileAlertActionRequest(MobileBaseRequest):
    """
    Snooze or resolve an alert from a mobile client.
    """

    action: str = Field(
        ...,
        pattern="^(snooze|resolve)$",
        description="Action to perform: 'snooze' or 'resolve'.",
    )
    snooze_until: datetime | None = Field(
        None,
        description="Required when action == 'snooze'. ISO 8601 UTC timestamp.",
    )

    @field_validator("snooze_until", mode="after")
    @classmethod
    def validate_snooze_until(cls, v: datetime | None, values) -> datetime | None:
        if v is not None and v.tzinfo is None:
            return v.replace(tzinfo=UTC)
        return v
