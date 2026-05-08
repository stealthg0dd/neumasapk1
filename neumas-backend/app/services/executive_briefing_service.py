from __future__ import annotations

import json
from collections import Counter
from datetime import UTC, datetime, timedelta
from typing import Any

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)


class ExecutiveBriefingService:
    """Summarize recent audit activity into three executive bullets."""

    async def get_briefing(
        self,
        tenant: TenantContext,
        days: int = 7,
    ) -> dict[str, Any]:
        client = await get_async_supabase_admin()
        since = (datetime.now(UTC) - timedelta(days=days)).isoformat()

        query = (
            client.table("audit_logs")
            .select("action,resource_type,metadata,created_at")
            .eq("organization_id", str(tenant.org_id))
            .gte("created_at", since)
            .order("created_at", desc=True)
            .limit(200)
        )
        if tenant.property_id:
            query = query.eq("property_id", str(tenant.property_id))

        response = await query.execute()
        logs = response.data or []
        bullets = await self._llm_summary(logs, days)

        return {
            "period_days": days,
            "generated_at": datetime.now(UTC).isoformat(),
            "bullets": bullets[:3],
            "log_count": len(logs),
        }

    def _fallback_bullets(self, logs: list[dict[str, Any]], days: int) -> list[str]:
        if not logs:
            return [
                f"No audited activity was recorded in the last {days} days.",
                "Inventory workflows were quiet, so no new operational risks were inferred.",
                "Run a fresh scan or forecast to refresh the executive narrative.",
            ]

        actions = Counter(str(log.get("action") or "unknown") for log in logs)
        resources = Counter(str(log.get("resource_type") or "unknown") for log in logs)
        scan_failures = sum(
            1 for log in logs if str(log.get("action") or "").startswith("scan.") and "fail" in str(log.get("action"))
        )
        reorder_events = sum(
            1 for log in logs if str(log.get("action") or "").startswith(("reorder.", "shopping."))
        )

        top_actions = ", ".join(f"{name} ({count})" for name, count in actions.most_common(3))
        busiest_resource = resources.most_common(1)[0][0] if resources else "operations"
        return [
            f"{len(logs)} audited actions landed in the last {days} days, led by {top_actions or 'normal operations'}.",
            f"The busiest workflow was {busiest_resource}, with {reorder_events} reorder and shopping actions recorded.",
            f"Operational friction stayed at {scan_failures} scan failures across the same window.",
        ]

    async def _llm_summary(self, logs: list[dict[str, Any]], days: int) -> list[str]:
        fallback = self._fallback_bullets(logs, days)
        if not logs:
            return fallback

        try:
            import anthropic

            from app.core.config import settings

            if not settings.ANTHROPIC_API_KEY:
                return fallback

            client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
            payload = {
                "task": "Summarize these Neumas audit logs into exactly three concise executive bullets.",
                "rules": [
                    "Focus on operational impact, risk, and recommended attention areas.",
                    "Mention concrete counts when they are obvious from the data.",
                    "Return valid JSON: {\"bullets\": [\"...\", \"...\", \"...\"]}",
                ],
                "period_days": days,
                "logs": logs[:50],
            }
            message = await client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=400,
                system="You are an operations intelligence analyst. Return only valid JSON.",
                messages=[{"role": "user", "content": json.dumps(payload)}],
            )
            text = "".join(
                block.text for block in message.content if getattr(block, "type", "") == "text"
            ).strip()
            parsed = json.loads(text)
            bullets = parsed.get("bullets")
            if isinstance(bullets, list):
                cleaned = [str(bullet).strip() for bullet in bullets if str(bullet).strip()]
                if cleaned:
                    return cleaned
        except Exception as exc:
            logger.warning("Executive briefing LLM summary failed", error=str(exc))

        return fallback
