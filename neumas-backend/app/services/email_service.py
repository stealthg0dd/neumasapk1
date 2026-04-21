"""
Email delivery service for transactional weekly digests.
"""

from __future__ import annotations

from html import escape
from pathlib import Path
from string import Template
from typing import Any
from uuid import UUID

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.db.repositories.email_logs import EmailLogsRepository

logger = get_logger(__name__)

_TEMPLATE_PATH = (
    Path(__file__).resolve().parent.parent / "templates" / "emails" / "weekly_digest.html"
)


class EmailServiceError(RuntimeError):
    """Raised when transactional email delivery fails."""


def _format_currency(value: float | int | None, currency: str) -> str:
    amount = float(value or 0)
    symbol = {
        "USD": "$",
        "EUR": "EUR ",
        "GBP": "GBP ",
        "SGD": "S$",
    }.get(currency.upper(), f"{currency.upper()} ")
    return f"{symbol}{amount:,.2f}"


def _render_stat_card(label: str, value: str) -> str:
    return (
        '<div class="stat">'
        f'<div class="stat-label">{escape(label)}</div>'
        f'<div class="stat-value">{escape(value)}</div>'
        "</div>"
    )


def _render_table(
    headers: list[str],
    rows: list[list[str]],
    empty_message: str,
) -> str:
    if not rows:
        return f'<p class="muted">{escape(empty_message)}</p>'

    thead = "".join(f"<th>{escape(header)}</th>" for header in headers)
    body_rows = []
    for row in rows:
        cells = "".join(f"<td>{cell}</td>" for cell in row)
        body_rows.append(f"<tr>{cells}</tr>")
    tbody = "".join(body_rows)
    return f"<table><thead><tr>{thead}</tr></thead><tbody>{tbody}</tbody></table>"


def _render_alert_list(
    items: list[dict[str, Any]],
    *,
    variant: str,
    empty_message: str,
    label_key: str = "name",
    detail_builder: callable | None = None,
) -> str:
    if not items:
        return f'<p class="muted">{escape(empty_message)}</p>'

    box_class = "alert-critical" if variant == "critical" else "alert-warning"
    pill_class = "pill-critical" if variant == "critical" else "pill-warning"
    parts: list[str] = []
    for item in items[:5]:
        detail = detail_builder(item) if detail_builder else ""
        parts.append(
            f'<div class="alert-box {box_class}">'
            f'<span class="pill {pill_class}">{escape(str(item.get("label", variant)))}</span>'
            f'<div style="margin-top:8px;font-weight:700;">{escape(str(item.get(label_key, "Unknown item")))}</div>'
            f'<div style="margin-top:4px;">{escape(detail)}</div>'
            "</div>"
        )
    return "".join(parts)


def render_weekly_digest_html(
    digest: dict[str, Any],
    *,
    recipient_name: str | None = None,
) -> str:
    """Render the weekly digest HTML using the checked-in template."""
    template = Template(_TEMPLATE_PATH.read_text(encoding="utf-8"))
    summary = digest["summary"]
    currency = digest["property"]["currency"]

    summary_cards = "".join([
        _render_stat_card("Total spend", _format_currency(summary["total_spend"], currency)),
        _render_stat_card("Potential savings", _format_currency(summary["potential_savings"], currency)),
        _render_stat_card("Waste value", _format_currency(summary["waste_value"], currency)),
    ])

    vendors_rows = [
        [
            escape(str(vendor["name"])),
            escape(_format_currency(vendor["spend"], currency)),
            escape(str(vendor["documents"])),
        ]
        for vendor in digest["top_vendors"][:5]
    ]
    categories_rows = [
        [
            escape(str(category["name"])),
            escape(_format_currency(category["spend"], currency)),
            escape(str(category["items"])),
        ]
        for category in digest["top_categories"][:5]
    ]
    reorder_rows = [
        [
            escape(str(item["name"])),
            escape(f'{float(item["recommended_qty"]):.1f} {item["unit"]}'),
            escape(item["reason"]),
        ]
        for item in digest["suggested_reorders"][:8]
    ]

    html = template.substitute(
        email_title=f"Neumas weekly digest — {digest['property']['name']}",
        headline=(
            f"Weekly digest for {digest['property']['name']}"
            if not recipient_name
            else f"Hi {recipient_name}, here’s {digest['property']['name']} this week"
        ),
        subheadline=(
            f"{digest['period']['label']} · {summary['document_count']} documents processed · "
            f"{summary['stockout_count']} stockouts recorded"
        ),
        summary_intro=(
            "A quick pulse on spend, waste, and stock risk for the last 7 days."
            if digest["has_activity"]
            else "No purchase or movement activity was recorded this week, but Neumas is still watching for stock risk."
        ),
        summary_cards=summary_cards,
        vendors_section=_render_table(
            ["Vendor", "Spend", "Docs"],
            vendors_rows,
            "No vendor spend was recorded this week.",
        ),
        categories_section=_render_table(
            ["Category", "Spend", "Items"],
            categories_rows,
            "No category spend data was available this week.",
        ),
        stockouts_section=_render_alert_list(
            digest["stocked_out_items"],
            variant="critical",
            empty_message="No stockouts were recorded this week.",
            detail_builder=lambda item: item["detail"],
        ),
        predictions_section=_render_alert_list(
            digest["predicted_stockouts"],
            variant="warning",
            empty_message="No high-risk stockouts are predicted in the next 7 days.",
            detail_builder=lambda item: item["detail"],
        ),
        waste_section=_render_table(
            ["Item", "Impact", "Notes"],
            [
                [
                    escape(str(item["name"])),
                    escape(_format_currency(item["estimated_value"], currency)),
                    escape(item["detail"]),
                ]
                for item in digest["waste_incidents"][:8]
            ],
            "No waste incidents were recorded this week.",
        ),
        reorders_section=_render_table(
            ["Item", "Suggested qty", "Reason"],
            reorder_rows,
            "No reorders are suggested right now.",
        ),
        dashboard_url=digest["dashboard_url"],
        footer_copy=(
            f"Report window: {digest['period']['start_date']} to {digest['period']['end_date']} · "
            f"Timezone: {digest['property']['timezone']}"
        ),
    )
    return html


class EmailService:
    """Send and track transactional emails via SendGrid."""

    def __init__(self) -> None:
        self._repo = EmailLogsRepository()

    async def send_email(
        self,
        *,
        to_email: str,
        subject: str,
        html_body: str,
        org_id: str,
        property_id: str | None,
        user_id: str | None,
        template_name: str,
        message_type: str,
        metadata: dict[str, Any] | None = None,
        report_period_start: str | None = None,
        report_period_end: str | None = None,
    ) -> dict[str, Any]:
        if not settings.SENDGRID_API_KEY:
            raise EmailServiceError("SENDGRID_API_KEY is not configured")
        if not settings.FROM_EMAIL:
            raise EmailServiceError("FROM_EMAIL is not configured")

        log_row = await self._repo.create(
            org_id=org_id,
            property_id=property_id,
            user_id=user_id,
            email=to_email,
            subject=subject,
            template_name=template_name,
            message_type=message_type,
            delivery_status="queued",
            report_period_start=None if not report_period_start else __import__("datetime").date.fromisoformat(report_period_start),
            report_period_end=None if not report_period_end else __import__("datetime").date.fromisoformat(report_period_end),
            metadata=metadata,
        )
        if not log_row:
            raise EmailServiceError("Failed to create email log entry")

        payload = {
            "personalizations": [
                {
                    "to": [{"email": to_email}],
                    "subject": subject,
                    "custom_args": {"email_log_id": str(log_row["id"])},
                }
            ],
            "from": {
                "email": settings.FROM_EMAIL,
                "name": settings.FROM_NAME or "Neumas Reports",
            },
            "content": [{"type": "text/html", "value": html_body}],
            "tracking_settings": {
                "click_tracking": {"enable": True, "enable_text": False},
                "open_tracking": {"enable": True},
            },
            "categories": [message_type, template_name],
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    "https://api.sendgrid.com/v3/mail/send",
                    headers={
                        "Authorization": f"Bearer {settings.SENDGRID_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
            response.raise_for_status()
        except Exception as exc:
            await self._repo.update_delivery(
                UUID(log_row["id"]),
                delivery_status="failed",
                error_message=str(exc),
            )
            logger.error("Transactional email send failed", email=to_email, error=str(exc))
            raise EmailServiceError(str(exc)) from exc

        provider_message_id = response.headers.get("x-message-id")
        updated = await self._repo.update_delivery(
            UUID(log_row["id"]),
            delivery_status="sent",
            provider_message_id=provider_message_id,
        )
        return updated or log_row

    async def send_weekly_digest_email(
        self,
        *,
        recipient: dict[str, Any],
        digest: dict[str, Any],
    ) -> dict[str, Any]:
        html_body = render_weekly_digest_html(
            digest,
            recipient_name=recipient.get("full_name"),
        )
        subject = f"Your weekly Neumas digest — {digest['property']['name']}"
        return await self.send_email(
            to_email=str(recipient["email"]),
            subject=subject,
            html_body=html_body,
            org_id=digest["property"]["organization_id"],
            property_id=digest["property"]["id"],
            user_id=recipient.get("id"),
            template_name="weekly_digest",
            message_type="weekly_digest",
            metadata={
                "property_name": digest["property"]["name"],
                "week_start": digest["period"]["start_date"],
                "week_end": digest["period"]["end_date"],
            },
            report_period_start=digest["period"]["start_date"],
            report_period_end=digest["period"]["end_date"],
        )

    async def record_sendgrid_events(self, events: list[dict[str, Any]]) -> list[dict[str, Any]]:
        updates: list[dict[str, Any]] = []
        for event in events:
            updated = await self._repo.apply_provider_event(event)
            if updated:
                updates.append(updated)
        return updates
