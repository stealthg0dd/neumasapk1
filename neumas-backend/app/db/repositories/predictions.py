"""
Predictions repository for forecast data.

Multi-tenant access: All queries filter by tenant.property_id to ensure
data isolation. This aligns with Supabase RLS policies:

    -- Example RLS policy on predictions
    CREATE POLICY "users_can_view_own_property_predictions"
    ON predictions FOR SELECT
    USING (
        property_id IN (
            SELECT p.id FROM properties p
            JOIN users u ON u.org_id = p.org_id
            WHERE u.auth_id = auth.uid()
        )
    );
"""

from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin
from supabase._async.client import AsyncClient

if TYPE_CHECKING:
    from app.api.deps import TenantContext

logger = get_logger(__name__)


class PredictionsRepository:
    """
    Repository for prediction/forecast database operations.

    All methods require a TenantContext to ensure proper tenant isolation.
    Queries filter by property_id which aligns with RLS policies.
    """

    def __init__(self, client: AsyncClient) -> None:
        self.client = client
        self.table = "predictions"

    async def get_by_id(
        self,
        tenant: "TenantContext",
        prediction_id: UUID,
    ) -> dict[str, Any] | None:
        """
        Get prediction by ID.

        RLS: Users can only view predictions for their properties.
        """
        query = (
            self.client.table(self.table)
            .select("*")
            .eq("id", str(prediction_id))
        )

        if tenant.property_id:
            query = query.eq("property_id", str(tenant.property_id))

        try:
            response = await query.single().execute()
            return response.data
        except Exception as e:
            logger.error(
                "Failed to get prediction",
                prediction_id=str(prediction_id),
                error=str(e),
            )
            return None

    async def get_by_property(
        self,
        tenant: "TenantContext",
        prediction_type: str | None = None,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """
        Get predictions for tenant's property.

        RLS: Automatically filtered to accessible properties.
        """
        if not tenant.property_id:
            logger.warning("get_by_property called without property_id")
            return []

        query = (
            self.client.table(self.table)
            .select("*, inventory_item:inventory_items(id, name)")
            .eq("property_id", str(tenant.property_id))
        )

        if prediction_type:
            query = query.eq("prediction_type", prediction_type)

        if from_date:
            query = query.gte("prediction_date", from_date.isoformat())

        if to_date:
            query = query.lte("prediction_date", to_date.isoformat())

        response = await (
            query
            .order("prediction_date")
            .limit(limit)
            .execute()
        )
        return response.data

    async def get_by_item(
        self,
        tenant: "TenantContext",
        item_id: UUID,
        prediction_type: str | None = None,
        limit: int = 30,
    ) -> list[dict[str, Any]]:
        """
        Get predictions for a specific item.

        RLS: Item must belong to tenant's property.
        """
        query = (
            self.client.table(self.table)
            .select("*")
            .eq("item_id", str(item_id))
        )

        if tenant.property_id:
            query = query.eq("property_id", str(tenant.property_id))

        if prediction_type:
            query = query.eq("prediction_type", prediction_type)

        response = await (
            query
            .order("prediction_date")
            .limit(limit)
            .execute()
        )
        return response.data

    async def create(
        self,
        tenant: "TenantContext",
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Create a new prediction for tenant's property.

        RLS: Insert policy requires property_id to be accessible.
        """
        if not tenant.property_id:
            raise ValueError("property_id required to create prediction")

        # Ensure property_id is set from tenant context
        data["property_id"] = str(tenant.property_id)

        response = await self.client.table(self.table).insert(data).execute()
        logger.info(
            "Created prediction",
            prediction_id=response.data[0]["id"],
            property_id=str(tenant.property_id),
            prediction_type=data.get("prediction_type"),
        )
        return response.data[0]

    async def create_batch(
        self,
        tenant: "TenantContext",
        predictions: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """
        Create multiple predictions at once for tenant's property.
        """
        if not predictions:
            return []

        if not tenant.property_id:
            raise ValueError("property_id required to create predictions")

        # Ensure all predictions have correct property_id
        for pred in predictions:
            pred["property_id"] = str(tenant.property_id)

        response = await self.client.table(self.table).insert(predictions).execute()
        logger.info(
            "Created batch predictions",
            count=len(predictions),
            property_id=str(tenant.property_id),
        )
        return response.data

    async def update(
        self,
        tenant: "TenantContext",
        prediction_id: UUID,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Update a prediction.

        RLS: Update policy ensures user can only update accessible predictions.
        """
        query = (
            self.client.table(self.table)
            .update(data)
            .eq("id", str(prediction_id))
        )

        if tenant.property_id:
            query = query.eq("property_id", str(tenant.property_id))

        response = await query.execute()
        return response.data[0]

    async def record_actual(
        self,
        tenant: "TenantContext",
        prediction_id: UUID,
        actual_value: float,
    ) -> dict[str, Any]:
        """
        Record actual value for a prediction (for accuracy tracking).
        """
        return await self.update(
            tenant,
            prediction_id,
            {"actual_value": actual_value},
        )

    async def get_stockout_predictions(
        self,
        tenant: "TenantContext",
        days_ahead: int = 7,
    ) -> list[dict[str, Any]]:
        """
        Get predicted stockouts within the specified days for tenant's property.
        """
        from datetime import UTC, timedelta

        if not tenant.property_id:
            return []

        now = datetime.now(UTC)
        end_date = now + timedelta(days=days_ahead)

        response = await (
            self.client.table(self.table)
            .select("*, inventory_item:inventory_items(id, name, quantity)")
            .eq("property_id", str(tenant.property_id))
            .eq("prediction_type", "stockout")
            .gte("prediction_date", now.isoformat())
            .lte("prediction_date", end_date.isoformat())
            .order("prediction_date")
            .execute()
        )
        return response.data

    async def get_stockout_predictions_admin(
        self,
        property_id: UUID,
        days_ahead: int = 7,
    ) -> list[dict[str, Any]]:
        """
        Admin version of stockout prediction lookup for background workers.
        """
        from datetime import UTC, timedelta

        admin_client = await get_async_supabase_admin()
        now = datetime.now(UTC)
        end_date = now + timedelta(days=days_ahead)

        response = await (
            admin_client.table(self.table)
            .select("*, inventory_item:inventory_items(id, name, quantity, min_quantity, max_quantity, reorder_point, unit, cost_per_unit, category_id)")
            .eq("property_id", str(property_id))
            .eq("prediction_type", "stockout")
            .gte("prediction_date", now.isoformat())
            .lte("prediction_date", end_date.isoformat())
            .order("prediction_date")
            .execute()
        )
        return response.data or []

    async def get_reorder_suggestions(
        self,
        tenant: "TenantContext",
    ) -> list[dict[str, Any]]:
        """
        Get items that are predicted to need reordering for tenant's property.
        """
        if not tenant.property_id:
            return []

        response = await (
            self.client.table(self.table)
            .select("*, inventory_item:inventory_items(id, name, quantity, min_quantity)")
            .eq("property_id", str(tenant.property_id))
            .eq("prediction_type", "reorder")
            .order("prediction_date")
            .limit(50)
            .execute()
        )
        return response.data

    async def delete_old_predictions(
        self,
        before_date: datetime,
    ) -> int:
        """
        Delete predictions older than specified date (cleanup).

        Note: This is an admin/server-side operation.
        """
        try:
            response = await (
                self.client.table(self.table)
                .delete()
                .lt("prediction_date", before_date.isoformat())
                .execute()
            )
            count = len(response.data) if response.data else 0
            logger.info("Deleted old predictions", count=count)
            return count
        except Exception as e:
            logger.error("Failed to delete old predictions", error=str(e))
            return 0

    async def get_prediction_accuracy(
        self,
        tenant: "TenantContext",
        prediction_type: str,
        days: int = 30,
    ) -> dict[str, Any]:
        """
        Calculate prediction accuracy for tenant's property.
        Only considers predictions where actual_value was recorded.
        """
        from datetime import UTC, timedelta

        if not tenant.property_id:
            return {
                "sample_size": 0,
                "mae": None,
                "mape": None,
                "accuracy": None,
            }

        cutoff = datetime.now(UTC) - timedelta(days=days)

        response = await (
            self.client.table(self.table)
            .select("predicted_value, actual_value, confidence")
            .eq("property_id", str(tenant.property_id))
            .eq("prediction_type", prediction_type)
            .gte("prediction_date", cutoff.isoformat())
            .not_.is_("actual_value", "null")
            .execute()
        )

        if not response.data:
            return {
                "sample_size": 0,
                "mae": None,
                "mape": None,
                "accuracy": None,
            }

        predictions = response.data
        total_error = 0.0
        total_pct_error = 0.0

        for pred in predictions:
            predicted = float(pred["predicted_value"])
            actual = float(pred["actual_value"])
            error = abs(predicted - actual)
            total_error += error
            if actual != 0:
                total_pct_error += error / actual

        n = len(predictions)
        mae = total_error / n
        mape = (total_pct_error / n) * 100

        return {
            "sample_size": n,
            "mae": round(mae, 2),
            "mape": round(mape, 2),
            "accuracy": round(100 - mape, 2),
        }


async def get_predictions_repository(
    tenant: "TenantContext | None" = None,
) -> PredictionsRepository:
    """
    Get predictions repository instance.

    If tenant is provided with JWT, uses user-scoped client for RLS.
    Otherwise uses admin client (for background tasks).
    """
    client = None
    if tenant and hasattr(tenant, 'jwt'):
        client = await tenant.get_supabase_client()
    if client is None:
        client = await get_async_supabase_admin()
    return PredictionsRepository(client)
