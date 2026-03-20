"""
Admin service for B2B dashboard and data export.
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.repositories.organizations import get_organizations_repository
from app.db.repositories.predictions import get_predictions_repository
from app.db.repositories.properties import get_properties_repository
from app.db.repositories.inventory import get_inventory_repository
from app.schemas.admin import (
    CriticalAlertItem,
    DashboardResponse,
    ExportResponse,
    ExportRow,
)

logger = get_logger(__name__)


class AdminService:
    """Service for B2B admin dashboard and reporting."""

    async def get_dashboard(
        self,
        org_id: UUID,
        tenant: TenantContext,
    ) -> DashboardResponse:
        """
        Get dashboard summary for an organization.

        Includes:
        - Number of properties
        - Total active predictions
        - Total monthly estimated savings
        - Top 10 items by critical alerts in last 30 days

        Args:
            org_id: Organization ID
            tenant: Current tenant context

        Returns:
            DashboardResponse with summary metrics
        """
        logger.info(
            "Generating admin dashboard",
            org_id=str(org_id),
            user_id=str(tenant.user_id),
        )

        props_repo = await get_properties_repository()
        predictions_repo = await get_predictions_repository()
        inventory_repo = await get_inventory_repository()

        # Get properties count
        properties = await props_repo.get_by_organization(org_id, tenant)
        properties_count = len([p for p in properties if p.get("is_active", True)])

        # Get active predictions count across all properties
        total_active_predictions = 0
        critical_alerts: dict[str, int] = {}  # item_name -> alert_count
        
        for prop in properties:
            prop_id = UUID(prop["id"])
            
            # Count active predictions
            predictions = await predictions_repo.get_stockout_predictions(
                property_id=prop_id,
                tenant=tenant,
            )
            total_active_predictions += len(predictions)

            # Track critical alerts (items with <= 3 days to stockout)
            for pred in predictions:
                days_until = pred.get("days_until_stockout")
                if days_until is not None and days_until <= 3:
                    item_name = pred.get("item_name", "Unknown")
                    critical_alerts[item_name] = critical_alerts.get(item_name, 0) + 1

        # Build top 10 critical alerts
        sorted_alerts = sorted(
            critical_alerts.items(),
            key=lambda x: x[1],
            reverse=True,
        )[:10]

        top_critical_alerts = [
            CriticalAlertItem(
                item_name=name,
                alert_count=count,
            )
            for name, count in sorted_alerts
        ]

        # Calculate estimated monthly savings
        # Simplified: based on prevented stockouts
        # Assume each prevented stockout saves ~$50 on average
        savings_per_alert = Decimal("50.00")
        total_monthly_savings_estimate = savings_per_alert * Decimal(str(len(critical_alerts)))

        logger.info(
            "Generated dashboard",
            org_id=str(org_id),
            properties_count=properties_count,
            predictions_count=total_active_predictions,
            critical_alerts_count=len(critical_alerts),
        )

        return DashboardResponse(
            org_id=org_id,
            properties_count=properties_count,
            total_active_predictions=total_active_predictions,
            total_monthly_savings_estimate=total_monthly_savings_estimate,
            currency="SGD",
            top_critical_alerts=top_critical_alerts,
            generated_at=datetime.now(UTC),
        )

    async def export_predictions(
        self,
        org_id: UUID,
        tenant: TenantContext,
    ) -> ExportResponse:
        """
        Export predictions data as structured rows (for CSV).

        Format: date, property_name, item_name, predicted_runout_date, urgency, savings_estimate

        Args:
            org_id: Organization ID
            tenant: Current tenant context

        Returns:
            ExportResponse with rows for CSV generation
        """
        logger.info(
            "Exporting predictions",
            org_id=str(org_id),
            user_id=str(tenant.user_id),
        )

        props_repo = await get_properties_repository()
        predictions_repo = await get_predictions_repository()

        # Get all properties
        properties = await props_repo.get_by_organization(org_id, tenant)
        property_map = {UUID(p["id"]): p["name"] for p in properties}

        rows: list[ExportRow] = []
        now = datetime.now(UTC)

        for prop in properties:
            prop_id = UUID(prop["id"])
            prop_name = prop["name"]

            # Get predictions for property
            predictions = await predictions_repo.get_stockout_predictions(
                property_id=prop_id,
                tenant=tenant,
            )

            for pred in predictions:
                # Calculate urgency
                days_until = pred.get("days_until_stockout")
                if days_until is None:
                    urgency = "later"
                elif days_until <= 3:
                    urgency = "critical"
                elif days_until <= 7:
                    urgency = "urgent"
                elif days_until <= 14:
                    urgency = "soon"
                else:
                    urgency = "later"

                # Parse runout date
                runout_date = pred.get("predicted_stockout_date")
                if isinstance(runout_date, str):
                    runout_date = datetime.fromisoformat(runout_date.replace("Z", "+00:00"))

                # Estimate savings (simplified)
                savings = Decimal("25.00") if urgency in ("critical", "urgent") else Decimal("10.00")

                row = ExportRow(
                    date=now,
                    property_name=prop_name,
                    item_name=pred.get("item_name", "Unknown"),
                    predicted_runout_date=runout_date,
                    urgency=urgency,  # type: ignore
                    savings_estimate=savings,
                )
                rows.append(row)

        logger.info(
            "Exported predictions",
            org_id=str(org_id),
            total_rows=len(rows),
        )

        return ExportResponse(
            org_id=org_id,
            rows=rows,
            total_rows=len(rows),
            exported_at=datetime.now(UTC),
        )


async def get_admin_service() -> AdminService:
    """Get admin service instance."""
    return AdminService()
