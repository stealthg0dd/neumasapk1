"""
Budget Agent for shopping list cost optimization.

Uses LLM to suggest cheaper alternatives and bulk sizes.
Attaches {savings: "...", suggestion: "..."} to shopping list records.
"""

from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from app.core.logging import get_logger
from app.db.repositories.shopping_lists import get_shopping_lists_repository
from app.services.orchestration_service import call_agent

logger = get_logger(__name__)


class BudgetAgent:
    """
    AI agent for budget optimization of shopping lists.

    Uses LLM to:
    - Suggest cheaper alternatives
    - Recommend bulk/larger sizes
    - Identify cost-saving opportunities

    Optimizes shopping lists to fit within budget by:
    - Prioritizing essential items
    - Suggesting quantity reductions
    - Finding cost-effective alternatives
    - Balancing immediate vs future needs

    Attaches {savings: "...", suggestion: "..."} to shopping list record.
    """

    async def optimize_for_budget(
        self,
        shopping_list_id: UUID,
        budget_limit: Decimal,
        strategy: Literal["priority_first", "lowest_cost", "balanced"] = "priority_first",
    ) -> dict[str, Any]:
        """
        Optimize a shopping list to fit within budget.

        Args:
            shopping_list_id: ID of shopping list to optimize
            budget_limit: Maximum budget
            strategy: Optimization strategy

        Returns:
            Optimization results with changes made
        """
        logger.info(
            "Optimizing shopping list for budget",
            list_id=str(shopping_list_id),
            budget_limit=float(budget_limit),
            strategy=strategy,
        )

        shopping_repo = await get_shopping_lists_repository()
        shopping_list = await shopping_repo.get_by_id(shopping_list_id)

        if not shopping_list:
            raise ValueError(f"Shopping list {shopping_list_id} not found")

        # Get items from JSONB
        items_jsonb = shopping_list.get("items", {})
        items = items_jsonb.get("items", []) if isinstance(items_jsonb, dict) else items_jsonb

        # Calculate current total
        original_cost = self._calculate_total(items)

        if original_cost <= budget_limit:
            # Already within budget - still get LLM suggestions
            suggestions = await self._get_llm_suggestions(items, budget_limit)
            await self._attach_suggestions_to_list(
                shopping_list_id,
                shopping_repo,
                savings="0",
                suggestion=suggestions.get("summary", "List already within budget"),
                alternatives=suggestions.get("alternatives", []),
            )
            return {
                "shopping_list_id": str(shopping_list_id),
                "original_cost": float(original_cost),
                "optimized_cost": float(original_cost),
                "savings": 0,
                "items_removed": [],
                "items_reduced": [],
                "llm_suggestions": suggestions,
                "message": "List already within budget",
            }

        # Apply optimization strategy
        if strategy == "priority_first":
            result = self._optimize_by_priority(items, budget_limit)
        elif strategy == "lowest_cost":
            result = self._optimize_by_cost(items, budget_limit)
        else:
            result = self._optimize_balanced(items, budget_limit)

        # Get LLM suggestions for remaining items
        remaining_items = [
            item for item in items
            if item["id"] not in [r["item_id"] for r in result["items_removed"]]
        ]
        suggestions = await self._get_llm_suggestions(remaining_items, budget_limit)

        # Apply changes to shopping list
        items_removed = result["items_removed"]
        items_reduced = result["items_reduced"]

        # Remove items
        for removed in items_removed:
            await shopping_repo.remove_item(UUID(removed["item_id"]))

        # Update reduced quantities
        for reduced in items_reduced:
            await shopping_repo.update_item(
                UUID(reduced["item_id"]),
                {"quantity": str(reduced["new_quantity"])},
            )

        # Recalculate totals
        await shopping_repo.update_totals(shopping_list_id)

        optimized_cost = original_cost - result["total_savings"]

        # Attach suggestions to shopping list record
        await self._attach_suggestions_to_list(
            shopping_list_id,
            shopping_repo,
            savings=str(result["total_savings"]),
            suggestion=suggestions.get("summary", "Optimized for budget"),
            alternatives=suggestions.get("alternatives", []),
        )

        logger.info(
            "Shopping list optimized",
            list_id=str(shopping_list_id),
            original_cost=float(original_cost),
            optimized_cost=float(optimized_cost),
            items_removed=len(items_removed),
            items_reduced=len(items_reduced),
        )

        return {
            "shopping_list_id": str(shopping_list_id),
            "original_cost": float(original_cost),
            "optimized_cost": float(optimized_cost),
            "savings": float(result["total_savings"]),
            "items_removed": items_removed,
            "items_reduced": items_reduced,
            "llm_suggestions": suggestions,
        }

    async def _get_llm_suggestions(
        self,
        items: list[dict[str, Any]],
        budget_limit: Decimal,
    ) -> dict[str, Any]:
        """
        Use LLM to suggest cheaper alternatives and bulk sizes.

        Returns:
            {
                "summary": "...",
                "alternatives": [{"item": "...", "suggestion": "...", "potential_savings": "..."}],
                "bulk_opportunities": [...]
            }
        """
        items_summary = []
        for item in items:
            items_summary.append({
                "name": item.get("name"),
                "quantity": item.get("quantity"),
                "unit": item.get("unit", "unit"),
                "estimated_price": item.get("estimated_price"),
                "category": item.get("category"),
            })

        prompt = f"""Analyze this shopping list and suggest cost-saving opportunities:

Items:
{items_summary}

Budget limit: ${budget_limit}
Current estimated total: ${self._calculate_total(items)}

For each item where applicable, suggest:
1. Cheaper alternative brands or products
2. Bulk/larger sizes that offer better value
3. Store-brand vs name-brand options
4. Seasonal or sale timing suggestions

Also provide:
- Overall summary of potential savings
- Priority items to focus on for maximum savings"""

        task_payload = {"prompt": prompt}
        llm_result = await call_agent("BUDGET", task_payload)

        if "error" not in llm_result:
            return {
                "summary": llm_result.get("summary", "Suggestions generated"),
                "alternatives": llm_result.get("alternatives", []),
                "bulk_opportunities": llm_result.get("bulk_opportunities", []),
                "total_potential_savings": llm_result.get("total_potential_savings", "0"),
            }
        else:
            logger.warning("LLM suggestions failed", error=llm_result.get("error"))
            return {
                "summary": "Unable to generate suggestions",
                "alternatives": [],
                "bulk_opportunities": [],
                "total_potential_savings": "0",
            }

    async def _attach_suggestions_to_list(
        self,
        shopping_list_id: UUID,
        shopping_repo: Any,
        savings: str,
        suggestion: str,
        alternatives: list[dict[str, Any]],
    ) -> None:
        """
        Attach {savings: "...", suggestion: "..."} to shopping list record.
        """
        await shopping_repo.update(
            shopping_list_id,
            {
                "budget_optimization": {
                    "savings": savings,
                    "suggestion": suggestion,
                    "alternatives": alternatives,
                    "optimized_at": __import__("datetime").datetime.now(
                        __import__("datetime").UTC
                    ).isoformat(),
                }
            },
        )

    def _calculate_total(self, items: list[dict[str, Any]]) -> Decimal:
        """Calculate total cost of items."""
        total = Decimal("0")
        for item in items:
            price = Decimal(str(item.get("estimated_price") or 0))
            qty = Decimal(str(item.get("quantity", 1)))
            total += price * qty
        return total

    def _optimize_by_priority(
        self,
        items: list[dict[str, Any]],
        budget_limit: Decimal,
    ) -> dict[str, Any]:
        """
        Optimize by keeping highest priority items.

        Removes low priority items first until budget is met.
        """
        priority_order = {"critical": 0, "high": 1, "normal": 2, "low": 3}
        urgency_order = {"critical": 0, "warning": 1, "normal": 2}

        # Sort by urgency and priority (lowest last for removal)
        sorted_items = sorted(
            items,
            key=lambda x: (
                urgency_order.get(x.get("urgency_bucket", "normal"), 2),
                priority_order.get(x.get("priority", "normal"), 2),
            ),
            reverse=True,  # Low priority first for removal
        )

        removed = []
        total_savings = Decimal("0")
        current_total = self._calculate_total(items)

        for item in sorted_items:
            if current_total <= budget_limit:
                break

            # Skip critical urgency items
            if item.get("urgency_bucket") == "critical":
                continue

            # Skip critical priority items
            if item.get("priority") == "critical":
                continue

            price = Decimal(str(item.get("estimated_price") or 0))
            qty = Decimal(str(item.get("quantity", 1)))
            item_cost = price * qty

            removed.append({
                "item_id": item["id"],
                "name": item["name"],
                "estimated_cost": float(item_cost),
                "reason": f"Low priority ({item.get('priority')}, {item.get('urgency_bucket')})",
            })
            total_savings += item_cost
            current_total -= item_cost

        return {
            "items_removed": removed,
            "items_reduced": [],
            "total_savings": total_savings,
        }

    def _optimize_by_cost(
        self,
        items: list[dict[str, Any]],
        budget_limit: Decimal,
    ) -> dict[str, Any]:
        """
        Optimize by removing most expensive items first.
        """
        def item_cost(item: dict[str, Any]) -> Decimal:
            price = Decimal(str(item.get("estimated_price") or 0))
            qty = Decimal(str(item.get("quantity", 1)))
            return price * qty

        # Sort by cost (highest first)
        sorted_items = sorted(items, key=item_cost, reverse=True)

        removed = []
        total_savings = Decimal("0")
        current_total = self._calculate_total(items)

        for item in sorted_items:
            if current_total <= budget_limit:
                break

            # Skip critical items
            if item.get("priority") == "critical" or item.get("urgency_bucket") == "critical":
                continue

            cost = item_cost(item)

            removed.append({
                "item_id": item["id"],
                "name": item["name"],
                "estimated_cost": float(cost),
                "reason": "High cost item",
            })
            total_savings += cost
            current_total -= cost

        return {
            "items_removed": removed,
            "items_reduced": [],
            "total_savings": total_savings,
        }

    def _optimize_balanced(
        self,
        items: list[dict[str, Any]],
        budget_limit: Decimal,
    ) -> dict[str, Any]:
        """
        Balanced optimization that reduces quantities before removing items.
        """
        removed = []
        reduced = []
        total_savings = Decimal("0")
        current_total = self._calculate_total(items)

        priority_order = {"critical": 0, "high": 1, "normal": 2, "low": 3}
        urgency_order = {"critical": 0, "warning": 1, "normal": 2}

        sorted_items = sorted(
            items,
            key=lambda x: (
                urgency_order.get(x.get("urgency_bucket", "normal"), 2),
                priority_order.get(x.get("priority", "normal"), 2),
            ),
            reverse=True,
        )

        # First pass: reduce quantities by 50% for non-critical items
        for item in sorted_items:
            if current_total <= budget_limit:
                break

            if item.get("priority") in ("critical", "high"):
                continue
            if item.get("urgency_bucket") == "critical":
                continue

            price = Decimal(str(item.get("estimated_price") or 0))
            qty = Decimal(str(item.get("quantity", 1)))

            if qty > 1:
                new_qty = max(Decimal("1"), qty * Decimal("0.5"))
                reduction = (qty - new_qty) * price

                reduced.append({
                    "item_id": item["id"],
                    "name": item["name"],
                    "original_quantity": float(qty),
                    "new_quantity": float(new_qty),
                    "cost_reduction": float(reduction),
                })
                total_savings += reduction
                current_total -= reduction

        # Second pass: remove low priority items if still over budget
        for item in sorted_items:
            if current_total <= budget_limit:
                break

            if item.get("priority") != "low" and item.get("urgency_bucket") != "normal":
                continue

            price = Decimal(str(item.get("estimated_price") or 0))
            # Check if this item was already reduced
            reduced_item = next(
                (r for r in reduced if r["item_id"] == item["id"]),
                None,
            )
            qty = (
                Decimal(str(reduced_item["new_quantity"]))
                if reduced_item
                else Decimal(str(item.get("quantity", 1)))
            )
            item_cost = price * qty

            removed.append({
                "item_id": item["id"],
                "name": item["name"],
                "estimated_cost": float(item_cost),
                "reason": "Budget optimization",
            })

            # Remove from reduced list if present
            if reduced_item:
                reduced = [r for r in reduced if r["item_id"] != item["id"]]

            total_savings += item_cost
            current_total -= item_cost

        return {
            "items_removed": removed,
            "items_reduced": reduced,
            "total_savings": total_savings,
        }

    async def suggest_alternatives(
        self,
        shopping_list_id: UUID,
    ) -> dict[str, Any]:
        """
        Suggest cost-effective alternatives for items using LLM.
        """
        logger.info(
            "Generating alternative suggestions",
            list_id=str(shopping_list_id),
        )

        shopping_repo = await get_shopping_lists_repository()
        shopping_list = await shopping_repo.get_by_id(shopping_list_id)

        if not shopping_list:
            raise ValueError(f"Shopping list {shopping_list_id} not found")

        items_jsonb = shopping_list.get("items", {})
        items = items_jsonb.get("items", []) if isinstance(items_jsonb, dict) else items_jsonb

        if not items:
            return {
                "shopping_list_id": str(shopping_list_id),
                "suggestions": [],
                "potential_savings": 0,
                "message": "No items in list",
            }

        # Get LLM suggestions
        current_total = self._calculate_total(items)
        suggestions = await self._get_llm_suggestions(items, current_total * Decimal("0.8"))

        # Attach to shopping list
        await self._attach_suggestions_to_list(
            shopping_list_id,
            shopping_repo,
            savings=suggestions.get("total_potential_savings", "0"),
            suggestion=suggestions.get("summary", ""),
            alternatives=suggestions.get("alternatives", []),
        )

        return {
            "shopping_list_id": str(shopping_list_id),
            "suggestions": suggestions.get("alternatives", []),
            "bulk_opportunities": suggestions.get("bulk_opportunities", []),
            "potential_savings": suggestions.get("total_potential_savings", "0"),
            "summary": suggestions.get("summary", ""),
        }

    async def analyze_spending(
        self,
        property_id: UUID,
        days: int = 30,
    ) -> dict[str, Any]:
        """
        Analyze spending patterns for a property using LLM insights.
        """
        logger.info(
            "Analyzing spending patterns",
            property_id=str(property_id),
            days=days,
        )

        shopping_repo = await get_shopping_lists_repository()

        # Get recent completed lists
        from datetime import UTC, datetime, timedelta
        from_date = datetime.now(UTC) - timedelta(days=days)
        recent_lists = await shopping_repo.get_by_property(
            property_id,
            status="completed",
            from_date=from_date,
        )

        if not recent_lists:
            return {
                "property_id": str(property_id),
                "period_days": days,
                "analysis": {
                    "total_spent": 0,
                    "by_category": {},
                    "trends": [],
                },
                "message": "No completed shopping lists in period",
            }

        # Calculate totals and categories
        total_spent = Decimal("0")
        by_category: dict[str, Decimal] = {}

        for shopping_list in recent_lists:
            items_jsonb = shopping_list.get("items", {})
            items = items_jsonb.get("items", []) if isinstance(items_jsonb, dict) else items_jsonb

            for item in items:
                price = Decimal(str(item.get("estimated_price") or 0))
                qty = Decimal(str(item.get("quantity", 1)))
                item_cost = price * qty
                total_spent += item_cost

                category = item.get("category", "Other")
                by_category[category] = by_category.get(category, Decimal("0")) + item_cost

        # Use LLM to analyze trends
        prompt = f"""Analyze this spending data and provide insights:

Period: {days} days
Total spent: ${total_spent}
Lists completed: {len(recent_lists)}
Spending by category: { {k: float(v) for k, v in by_category.items()} }

Provide:
1. Key spending trends
2. Categories to watch/reduce
3. Cost-saving opportunities
4. Comparison to typical household spending"""

        task_payload = {"prompt": prompt}
        llm_result = await call_agent("BUDGET", task_payload)

        insights = llm_result.get("insights", []) if "error" not in llm_result else []
        recommendations = llm_result.get("recommendations", []) if "error" not in llm_result else []

        return {
            "property_id": str(property_id),
            "period_days": days,
            "analysis": {
                "total_spent": float(total_spent),
                "by_category": {k: float(v) for k, v in by_category.items()},
                "lists_completed": len(recent_lists),
                "average_per_list": float(total_spent / len(recent_lists)) if recent_lists else 0,
            },
            "insights": insights,
            "recommendations": recommendations,
        }


async def get_budget_agent() -> BudgetAgent:
    """Get budget agent instance."""
    return BudgetAgent()
