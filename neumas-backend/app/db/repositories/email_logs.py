from __future__ import annotations

"""
Email log repository for weekly digest delivery tracking.
"""

from datetime import date, datetime
from typing import Any
from uuid import UUID

from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)


class EmailLogsRepository:
    """Repository for the email_logs table."""

    table = "email_logs"

    async def create(
        self,
        *,
        org_id: str,
        property_id: str | None,
        user_id: str | None,
        email: str,
        subject: str,
        template_name: str,
        message_type: str,
        delivery_status: str,
        provider: str = "sendgrid",
        provider_message_id: str | None = None,
        report_period_start: date | None = None,
        report_period_end: date | None = None,
        metadata: dict[str, Any] | None = None,
        error_message: str | None = None,
    ) -> dict[str, Any] | None:
        client = await get_async_supabase_admin()
        payload: dict[str, Any] = {
            "organization_id": org_id,
            "property_id": property_id,
            "user_id": user_id,
            "email": email.lower(),
            "subject": subject,
            "template_name": template_name,
            "message_type": message_type,
            "delivery_status": delivery_status,
            "provider": provider,
            "provider_message_id": provider_message_id,
            "report_period_start": report_period_start.isoformat() if report_period_start else None,
            "report_period_end": report_period_end.isoformat() if report_period_end else None,
            "metadata": metadata or {},
            "error_message": error_message,
        }
        payload = {key: value for key, value in payload.items() if value is not None}
        response = await client.table(self.table).insert(payload).execute()
        return response.data[0] if response.data else None

    async def update_delivery(
        self,
        log_id: UUID,
        *,
        delivery_status: str,
        provider_message_id: str | None = None,
        error_message: str | None = None,
        metadata_patch: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        client = await get_async_supabase_admin()
        updates: dict[str, Any] = {"delivery_status": delivery_status}
        if provider_message_id is not None:
            updates["provider_message_id"] = provider_message_id
        if error_message is not None:
            updates["error_message"] = error_message

        if metadata_patch:
            current = await self.get_by_id(log_id)
            merged = {**(current.get("metadata") or {})} if current else {}
            merged.update(metadata_patch)
            updates["metadata"] = merged

        response = await (
            client.table(self.table)
            .update(updates)
            .eq("id", str(log_id))
            .execute()
        )
        return response.data[0] if response.data else None

    async def apply_provider_event(self, event: dict[str, Any]) -> dict[str, Any] | None:
        client = await get_async_supabase_admin()
        provider_message_id = (
            event.get("sg_message_id")
            or event.get("smtp-id")
            or event.get("provider_message_id")
        )
        if not provider_message_id:
            return None

        response = await (
            client.table(self.table)
            .select("*")
            .eq("provider_message_id", provider_message_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if not response.data:
            logger.warning("Email provider event received for unknown message", provider_message_id=provider_message_id)
            return None

        log_row = response.data[0]
        metadata = {**(log_row.get("metadata") or {})}
        event_type = str(event.get("event") or "unknown")
        metadata.setdefault("provider_events", []).append(event)

        updates: dict[str, Any] = {"metadata": metadata}
        current_status = log_row.get("delivery_status") or "sent"

        if event_type == "open":
            updates["open_count"] = int(log_row.get("open_count") or 0) + 1
        elif event_type == "click":
            updates["click_count"] = int(log_row.get("click_count") or 0) + 1
        elif event_type in {"bounce", "dropped"}:
            updates["bounce_count"] = int(log_row.get("bounce_count") or 0) + 1
            updates["last_bounce_at"] = (
                datetime.utcfromtimestamp(event["timestamp"]).isoformat()
                if event.get("timestamp")
                else datetime.utcnow().isoformat()
            )
            updates["delivery_status"] = "bounced"
        elif event_type == "delivered":
            updates["delivery_status"] = "delivered"
        elif event_type in {"deferred", "processed"} and current_status == "queued":
            updates["delivery_status"] = "sent"

        result = await (
            client.table(self.table)
            .update(updates)
            .eq("id", log_row["id"])
            .execute()
        )
        return result.data[0] if result.data else None

    async def list_logs(
        self,
        *,
        org_id: str,
        property_id: str | None = None,
        delivery_status: str | None = None,
        email: str | None = None,
        template_name: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        client = await get_async_supabase_admin()
        query = client.table(self.table).select("*").eq("organization_id", org_id)
        if property_id:
            query = query.eq("property_id", property_id)
        if delivery_status:
            query = query.eq("delivery_status", delivery_status)
        if email:
            query = query.eq("email", email.lower())
        if template_name:
            query = query.eq("template_name", template_name)
        response = await (
            query.order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        return response.data or []

    async def count_recent_bounces(self, *, email: str, days: int = 30) -> int:
        client = await get_async_supabase_admin()
        response = await (
            client.table(self.table)
            .select("id", count="exact")
            .eq("email", email.lower())
            .eq("delivery_status", "bounced")
            .gte("created_at", f"now() - interval '{days} days'")
            .execute()
        )
        return response.count or 0

    async def get_by_id(self, log_id: UUID) -> dict[str, Any] | None:
        client = await get_async_supabase_admin()
        response = await (
            client.table(self.table)
            .select("*")
            .eq("id", str(log_id))
            .single()
            .execute()
        )
        return response.data
