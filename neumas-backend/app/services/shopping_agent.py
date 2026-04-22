"""
Shopping Agent for intelligent shopping list generation.

Uses predictions to create shopping lists grouped by urgency and store.
Stores items in shopping_lists.items JSONB.
"""

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from app.core.logging import get_logger
from app.db.repositories.inventory import get_inventory_repository
from app.db.repositories.predictions import get_predictions_repository
from app.db.supabase_client import get_async_supabase_admin
from app.services.orchestration_service import call_agent

logger = get_logger(__name__)


class ShoppingAgent:
    """
    AI agent for generating intelligent shopping lists.

    Transforms predictions into organized shopping lists:
    - Groups by urgency bucket (critical/warning/normal)
    - Optionally groups by store
    - Stores items in shopping_lists.items JSONB

    Uses LLM for:
    - Smart item grouping by store/aisle
    - Quantity suggestions
    - Alternative product recommendations
    """

    async def generate_shopping_list(
        self,
        property_id: UUID,
        user_id: UUID,
        name: str | None = None,
        include_low_stock: bool = True,
        include_predictions: bool = True,
        days_ahead: int = 7,
        budget_limit: Decimal | None = None,
        exclude_categories: list[UUID] | None = None,
        group_by_store: bool = False,
        include_critical_only: bool = False,
    ) -> dict[str, Any]:
        """
        Generate an intelligent shopping list from predictions.

        Args:
            property_id: Property to generate list for
            user_id: User creating the list
            name: Optional list name
            include_low_stock: Include items below reorder point
            include_predictions: Include predicted needs
            days_ahead: Days ahead to consider for predictions
            budget_limit: Optional budget constraint
            exclude_categories: Categories to exclude
            group_by_store: Group items by preferred store

        Returns:
            Generated shopping list with items JSONB
        """
        logger.info(
            "Generating shopping list",
            property_id=str(property_id),
            user_id=str(user_id),
        )

        inventory_repo = await get_inventory_repository()
        predictions_repo = await get_predictions_repository()
        items_to_add: list[dict[str, Any]] = []
        seen_item_ids: set[str] = set()
        supabase = await get_async_supabase_admin()
        if not supabase:
            raise RuntimeError("Supabase admin client unavailable")

        org_resp = await (
            supabase.table("properties")
            .select("organization_id")
            .eq("id", str(property_id))
            .single()
            .execute()
        )
        organization_id = (org_resp.data or {}).get("organization_id")
        if not organization_id:
            raise RuntimeError(f"Could not resolve organization for property {property_id}")

        # 1. Get low stock items
        low_stock_count = 0
        if include_low_stock:
            low_stock_items = await inventory_repo.get_low_stock_items_admin(
                property_id,
                limit=100,
            )

            for item in low_stock_items:
                # Skip excluded categories
                if exclude_categories and item.get("category_id") in [
                    str(c) for c in exclude_categories
                ]:
                    continue

                item_data = self._create_shopping_item(
                    item,
                    "Low stock level",
                    urgency_bucket="warning",
                    source="low_stock",
                )
                items_to_add.append(item_data)
                seen_item_ids.add(item["id"])
                low_stock_count += 1

        # 2. Get prediction-based items with urgency buckets
        prediction_count = 0
        if include_predictions:
            # Get runout predictions which include urgency_bucket
            predictions = await predictions_repo.get_stockout_predictions_admin(
                property_id,
                days_ahead=days_ahead,
            )

            for prediction in predictions:
                item_info = prediction.get("inventory_item", {})
                if not item_info or item_info.get("id") in seen_item_ids:
                    continue

                # Skip excluded categories
                if exclude_categories and item_info.get("category_id") in [
                    str(c) for c in exclude_categories
                ]:
                    continue

                raw_urgency = prediction.get("stockout_risk_level") or (
                    prediction.get("features_used", {}) or {}
                ).get("urgency_bucket", "normal")
                urgency = {
                    "critical": "critical",
                    "urgent": "warning",
                    "soon": "warning",
                    "later": "normal",
                    "warning": "warning",
                }.get(str(raw_urgency), "normal")
                predicted_date = prediction.get("prediction_date")
                reason = (
                    f"Predicted stockout around {predicted_date}"
                    if predicted_date
                    else "Predicted stockout soon"
                )

                item_data = self._create_shopping_item(
                    item_info,
                    reason,
                    predicted_quantity=prediction.get("predicted_value"),
                    urgency_bucket=urgency,
                    prediction_id=prediction.get("id"),
                    source="prediction",
                )
                items_to_add.append(item_data)
                seen_item_ids.add(item_info["id"])
                prediction_count += 1

        # 3. Use LLM to organize and enhance items
        if items_to_add:
            items_to_add = await self._organize_with_llm(
                items_to_add,
                group_by_store=group_by_store,
            )

        if include_critical_only:
            items_to_add = [
                item
                for item in items_to_add
                if item.get("urgency_bucket") == "critical" or item.get("priority") == "critical"
            ]

        # 4. Group by urgency
        items_by_urgency = self._group_by_urgency(items_to_add)

        # 5. Apply budget constraints if specified
        excluded_by_budget = 0
        if budget_limit:
            items_to_add, excluded_by_budget = self._apply_budget_constraint(
                items_to_add,
                budget_limit,
            )
            items_by_urgency = self._group_by_urgency(items_to_add)

        # 6. Create shopping list with items JSONB
        list_name = name or f"Shopping List - {datetime.now(UTC).strftime('%Y-%m-%d')}"
        list_id = str(uuid4())
        generation_params = {
            "include_low_stock": include_low_stock,
            "include_predictions": include_predictions,
            "include_critical_only": include_critical_only,
            "days_ahead": days_ahead,
            "exclude_categories": [str(c) for c in exclude_categories] if exclude_categories else None,
            "group_by_store": group_by_store,
            "by_urgency_summary": {
                "critical_count": len(items_by_urgency.get("critical", [])),
                "warning_count": len(items_by_urgency.get("warning", [])),
                "normal_count": len(items_by_urgency.get("normal", [])),
            },
        }

        shopping_list_payload = {
            "id": list_id,
            "property_id": str(property_id),
            "organization_id": str(organization_id),
            "created_by_id": str(user_id),
            "name": list_name,
            "status": "draft",
            "budget_limit": str(budget_limit) if budget_limit else None,
            "currency": "USD",
            "generation_params": generation_params,
        }
        shopping_resp = await supabase.table("shopping_lists").insert(shopping_list_payload).execute()
        shopping_list = shopping_resp.data[0] if shopping_resp.data else shopping_list_payload

        if items_to_add:
            item_rows = [
                {
                    "id": str(uuid4()),
                    "shopping_list_id": list_id,
                    "inventory_item_id": item.get("inventory_item_id"),
                    "prediction_id": item.get("prediction_id"),
                    "name": item["name"],
                    "quantity": item["quantity"],
                    "unit": item.get("unit", "unit"),
                    "estimated_price": item.get("estimated_price"),
                    "currency": "USD",
                    "priority": item.get("priority", "normal"),
                    "reason": item.get("reason"),
                    "source": item.get("source", "manual"),
                    "is_purchased": False,
                }
                for item in items_to_add
            ]
            await supabase.table("shopping_list_items").insert(item_rows).execute()

        # Calculate estimated total
        estimated_total = sum(
            Decimal(str(item.get("estimated_price", 0) or 0)) *
            Decimal(str(item.get("quantity", 1)))
            for item in items_to_add
        )

        await (
            supabase.table("shopping_lists")
            .update(
                {
                    "total_estimated_cost": str(estimated_total),
                    "notes": (
                        "Built from low stock, prediction output, and the latest baseline signals."
                    ),
                }
            )
            .eq("id", list_id)
            .execute()
        )

        detail_resp = await (
            supabase.table("shopping_lists")
            .select("*, items:shopping_list_items(*)")
            .eq("id", list_id)
            .single()
            .execute()
        )
        if detail_resp.data:
            shopping_list = detail_resp.data

        logger.info(
            "Shopping list generated",
            list_id=shopping_list["id"],
            items_count=len(items_to_add),
            estimated_total=float(estimated_total),
        )

        return {
            "shopping_list": shopping_list,
            "generation_summary": {
                "low_stock_items_added": low_stock_count,
                "predicted_needs_added": prediction_count,
                "items_excluded_by_budget": excluded_by_budget,
                "total_estimated_cost": float(estimated_total),
                "budget_utilization": (
                    float(estimated_total / budget_limit * 100)
                    if budget_limit else None
                ),
                "urgency_breakdown": items_by_urgency,
            },
        }

    async def _organize_with_llm(
        self,
        items: list[dict[str, Any]],
        group_by_store: bool = False,
    ) -> list[dict[str, Any]]:
        """
        Use LLM to organize items and suggest improvements.

        Returns items with:
        - Store assignments (if group_by_store)
        - Aisle/section hints
        - Quantity adjustments
        """
        items_summary = []
        for item in items:
            items_summary.append({
                "name": item["name"],
                "quantity": item["quantity"],
                "unit": item.get("unit", "unit"),
                "category": item.get("category"),
                "urgency_bucket": item.get("urgency_bucket", "normal"),
            })

        prompt = f"""Organize this shopping list for efficient shopping:

Items:
{items_summary}

Tasks:
1. Suggest store section/aisle for each item (e.g., "dairy", "produce", "frozen")
2. {"Suggest preferred store for each item based on typical pricing" if group_by_store else "Skip store assignment"}
3. Flag any items that might need quantity adjustment (e.g., "buy larger/bulk size")
4. Group items logically for shopping efficiency

Return organized list with section/aisle assignments."""

        task_payload = {"prompt": prompt}
        llm_result = await call_agent("SHOPPING", task_payload)

        if "error" not in llm_result:
            # Merge LLM suggestions back into items
            llm_items = llm_result.get("items", [])
            for llm_item in llm_items:
                for item in items:
                    if item["name"].lower() == llm_item.get("name", "").lower():
                        item["section"] = llm_item.get("section", llm_item.get("aisle"))
                        if group_by_store:
                            item["preferred_store"] = llm_item.get("store", llm_item.get("preferred_store"))
                        if llm_item.get("quantity_suggestion"):
                            item["quantity_suggestion"] = llm_item["quantity_suggestion"]
                        break
        else:
            logger.warning("LLM organization failed, using defaults")
            # Apply basic section assignment based on category
            for item in items:
                item["section"] = self._guess_section(item.get("category"))

        return items

    def _guess_section(self, category: str | None) -> str:
        """Fallback section assignment based on category."""
        if not category:
            return "general"

        category_lower = category.lower()
        section_map = {
            "dairy": "dairy",
            "milk": "dairy",
            "cheese": "dairy",
            "produce": "produce",
            "fruit": "produce",
            "vegetable": "produce",
            "meat": "meat",
            "poultry": "meat",
            "frozen": "frozen",
            "canned": "canned goods",
            "bread": "bakery",
            "bakery": "bakery",
            "beverage": "beverages",
            "drink": "beverages",
            "snack": "snacks",
            "cleaning": "household",
            "household": "household",
            "personal": "personal care",
            "health": "pharmacy",
        }

        for key, section in section_map.items():
            if key in category_lower:
                return section

        return "general"

    def _group_by_urgency(
        self,
        items: list[dict[str, Any]],
    ) -> dict[str, list[dict[str, Any]]]:
        """Group items by urgency bucket."""
        grouped = {
            "critical": [],
            "warning": [],
            "normal": [],
        }

        for item in items:
            bucket = item.get("urgency_bucket", "normal")
            if bucket in grouped:
                grouped[bucket].append(item)
            else:
                grouped["normal"].append(item)

        return grouped

    def _group_by_store(
        self,
        items: list[dict[str, Any]],
    ) -> dict[str, list[dict[str, Any]]]:
        """Group items by preferred store."""
        grouped: dict[str, list[dict[str, Any]]] = {}

        for item in items:
            store = item.get("preferred_store", "General")
            if store not in grouped:
                grouped[store] = []
            grouped[store].append(item)

        return grouped

    def _create_shopping_item(
        self,
        inventory_item: dict[str, Any],
        reason: str,
        predicted_quantity: Any = None,
        urgency_bucket: str = "normal",
        prediction_id: str | None = None,
        source: str = "manual",
    ) -> dict[str, Any]:
        """Create a shopping list item from inventory item."""
        current_qty = Decimal(str(inventory_item.get("quantity", 0)))
        min_qty = Decimal(str(inventory_item.get("min_quantity", 0)))
        max_qty = inventory_item.get("max_quantity")
        reorder_point = inventory_item.get("reorder_point")
        cost = inventory_item.get("cost_per_unit")

        # Calculate order quantity
        if predicted_quantity:
            order_qty = Decimal(str(predicted_quantity))
        elif max_qty:
            order_qty = Decimal(str(max_qty)) - current_qty
        elif reorder_point:
            target = Decimal(str(reorder_point)) * Decimal("1.5")
            order_qty = max(Decimal("1"), target - current_qty)
        else:
            order_qty = max(min_qty, Decimal("1"))

        # Determine priority from urgency bucket
        priority_map = {
            "critical": "critical",
            "warning": "high",
            "normal": "normal",
        }
        priority = priority_map.get(urgency_bucket, "normal")

        return {
            "inventory_item_id": inventory_item["id"],
            "prediction_id": prediction_id,
            "name": inventory_item["name"],
            "category": inventory_item.get("category"),
            "quantity": str(order_qty),
            "unit": inventory_item.get("unit", "unit"),
            "estimated_price": str(cost) if cost else None,
            "priority": priority,
            "urgency_bucket": urgency_bucket,
            "reason": reason,
            "source": source,
            "is_purchased": False,
        }

    def _prioritize_items(
        self,
        items: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Sort items by urgency then priority."""
        urgency_order = {"critical": 0, "warning": 1, "normal": 2}
        priority_order = {"critical": 0, "high": 1, "normal": 2, "low": 3}
        return sorted(
            items,
            key=lambda x: (
                urgency_order.get(x.get("urgency_bucket", "normal"), 2),
                priority_order.get(x.get("priority", "normal"), 2),
            ),
        )

    def _apply_budget_constraint(
        self,
        items: list[dict[str, Any]],
        budget_limit: Decimal,
    ) -> tuple[list[dict[str, Any]], int]:
        """
        Filter items to fit within budget, prioritizing critical items.

        Returns:
            Tuple of (filtered items, count of excluded items)
        """
        # Sort by urgency first
        items = self._prioritize_items(items)

        included = []
        running_total = Decimal("0")
        excluded_count = 0

        for item in items:
            price = Decimal(str(item.get("estimated_price") or 0))
            qty = Decimal(str(item.get("quantity", 1)))
            item_cost = price * qty

            if running_total + item_cost <= budget_limit:
                included.append(item)
                running_total += item_cost
            elif item.get("urgency_bucket") == "critical":
                # Always include critical items
                included.append(item)
                running_total += item_cost
            else:
                excluded_count += 1

        return included, excluded_count

    async def add_item_to_list(
        self,
        list_id: UUID,
        inventory_item_id: UUID | None,
        name: str,
        quantity: Decimal,
        unit: str = "unit",
        estimated_price: Decimal | None = None,
        priority: str = "normal",
        urgency_bucket: str = "normal",
        reason: str | None = None,
    ) -> dict[str, Any]:
        """Add a single item to an existing shopping list."""
        shopping_repo = await get_shopping_lists_repository()

        item_data = {
            "id": str(uuid4()),
            "inventory_item_id": str(inventory_item_id) if inventory_item_id else None,
            "name": name,
            "quantity": str(quantity),
            "unit": unit,
            "estimated_price": str(estimated_price) if estimated_price else None,
            "priority": priority,
            "urgency_bucket": urgency_bucket,
            "reason": reason,
            "is_purchased": False,
        }

        result = await shopping_repo.add_item(list_id, item_data)
        await shopping_repo.update_totals(list_id)

        return result


async def get_shopping_agent() -> ShoppingAgent:
    """Get shopping agent instance."""
    return ShoppingAgent()
