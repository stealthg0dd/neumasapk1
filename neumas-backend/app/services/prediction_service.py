"""
Prediction service for retrieving and organizing predictions by urgency.
"""

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.repositories.inventory import get_inventory_repository
from app.db.repositories.predictions import get_predictions_repository
from app.schemas.predictions import (
    PredictionItem,
    UrgencyBucket,
    UrgencyOrderedPredictionsResponse,
)

logger = get_logger(__name__)


class PredictionService:
    """Service for retrieving and organizing predictions."""

    async def get_urgency_ordered_predictions(
        self,
        property_id: UUID,
        tenant: TenantContext,
    ) -> UrgencyOrderedPredictionsResponse:
        """
        Get predictions ordered by urgency bucket.

        Urgency buckets:
        - critical: <= 3 days until stockout
        - urgent: 4-7 days
        - soon: 8-14 days
        - later: > 14 days

        Args:
            property_id: Property to get predictions for
            tenant: Current tenant context

        Returns:
            UrgencyOrderedPredictionsResponse grouped by urgency
        """
        logger.info(
            "Fetching urgency-ordered predictions",
            property_id=str(property_id),
            user_id=str(tenant.user_id),
        )

        predictions_repo = await get_predictions_repository()
        inventory_repo = await get_inventory_repository()

        # Get active stockout predictions for property
        predictions = await predictions_repo.get_stockout_predictions(
            property_id=property_id,
            tenant=tenant,
        )

        # Get inventory items for current quantities
        inventory_items = await inventory_repo.get_by_property(property_id, tenant)
        inventory_map = {UUID(item["id"]): item for item in inventory_items}

        # Bucket the predictions by urgency
        critical: list[PredictionItem] = []
        urgent: list[PredictionItem] = []
        soon: list[PredictionItem] = []
        later: list[PredictionItem] = []

        now = datetime.now(UTC)

        for pred in predictions:
            item_id = UUID(pred["item_id"])
            inventory_item = inventory_map.get(item_id, {})

            # Calculate days until runout
            runout_date = pred.get("predicted_stockout_date")
            days_until_runout: int | None = None

            if runout_date:
                if isinstance(runout_date, str):
                    runout_date = datetime.fromisoformat(runout_date.replace("Z", "+00:00"))
                delta = runout_date - now
                days_until_runout = max(0, delta.days)

            # Determine urgency bucket
            if days_until_runout is None:
                urgency = UrgencyBucket.LATER
            elif days_until_runout <= 3:
                urgency = UrgencyBucket.CRITICAL
            elif days_until_runout <= 7:
                urgency = UrgencyBucket.URGENT
            elif days_until_runout <= 14:
                urgency = UrgencyBucket.SOON
            else:
                urgency = UrgencyBucket.LATER

            prediction_item = PredictionItem(
                item_id=item_id,
                item_name=inventory_item.get("name", pred.get("item_name", "Unknown")),
                current_qty=Decimal(str(inventory_item.get("quantity", 0))),
                predicted_runout_date=runout_date,
                days_until_runout=days_until_runout,
                urgency=urgency,
                confidence=float(pred.get("confidence", 0.0)),
                recommended_qty=Decimal(str(pred["recommended_quantity"])) if pred.get("recommended_quantity") else None,
            )

            # Add to appropriate bucket
            if urgency == UrgencyBucket.CRITICAL:
                critical.append(prediction_item)
            elif urgency == UrgencyBucket.URGENT:
                urgent.append(prediction_item)
            elif urgency == UrgencyBucket.SOON:
                soon.append(prediction_item)
            else:
                later.append(prediction_item)

        # Sort each bucket by days_until_runout (most urgent first)
        def sort_key(p: PredictionItem) -> int:
            return p.days_until_runout if p.days_until_runout is not None else 9999

        critical.sort(key=sort_key)
        urgent.sort(key=sort_key)
        soon.sort(key=sort_key)
        later.sort(key=sort_key)

        total_items = len(critical) + len(urgent) + len(soon) + len(later)

        logger.info(
            "Organized predictions by urgency",
            property_id=str(property_id),
            critical_count=len(critical),
            urgent_count=len(urgent),
            soon_count=len(soon),
            later_count=len(later),
        )

        return UrgencyOrderedPredictionsResponse(
            property_id=property_id,
            generated_at=datetime.now(UTC),
            critical=critical,
            urgent=urgent,
            soon=soon,
            later=later,
            total_items=total_items,
        )


async def get_prediction_service() -> PredictionService:
    """Get prediction service instance."""
    return PredictionService()
