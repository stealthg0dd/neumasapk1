from __future__ import annotations

"""
Catalog service — normalises raw item names to canonical_items records.

Normalisation pipeline:
1. Exact alias lookup
2. Fuzzy match against canonical names for this org
3. Create new canonical item if no match above threshold

Also handles unit normalisation via unit_conversion utilities.
"""

from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.repositories.canonical_items import CanonicalItemsRepository
from app.utils.fuzzy_match import best_match
from app.utils.unit_conversion import normalise_unit

logger = get_logger(__name__)

_MATCH_THRESHOLD = 0.80


class CatalogService:
    """Service for canonical item name normalisation."""

    def __init__(self) -> None:
        self._repo = CanonicalItemsRepository()

    async def normalise_item(
        self,
        tenant: TenantContext,
        raw_name: str,
        raw_unit: str | None = None,
        auto_create: bool = True,
    ) -> dict[str, Any] | None:
        """
        Normalise a raw item name to a canonical item record.

        Returns the matched or newly created canonical item dict,
        or None if auto_create is False and no match was found.
        Also normalises the unit if provided.
        """
        if not raw_name or not raw_name.strip():
            return None

        raw_name = raw_name.strip()

        # 1. Exact alias lookup
        item = await self._repo.find_by_alias(tenant, raw_name)
        if item:
            return item

        # 2. Exact canonical name match
        item = await self._repo.find_by_name(tenant, raw_name)
        if item:
            await self._repo.add_alias(tenant, UUID(item["id"]), raw_name, source="inferred")
            return item

        # 3. Fuzzy match
        all_items = await self._repo.list(tenant, limit=2000)
        candidate_names = [i["canonical_name"] for i in all_items]
        match = best_match(raw_name, candidate_names, threshold=_MATCH_THRESHOLD)
        if match:
            matched_name, score = match
            item = next((i for i in all_items if i["canonical_name"] == matched_name), None)
            if item:
                await self._repo.add_alias(
                    tenant, UUID(item["id"]), raw_name, source="fuzzy", confidence=score
                )
                logger.info(
                    "Item matched via fuzzy",
                    raw_name=raw_name,
                    matched_to=matched_name,
                    score=score,
                )
                return item

        # 4. Auto-create
        if auto_create:
            default_unit = normalise_unit(raw_unit) if raw_unit else "unit"
            item = await self._repo.create(
                tenant, canonical_name=raw_name, default_unit=default_unit
            )
            if item:
                await self._repo.add_alias(tenant, UUID(item["id"]), raw_name, source="inferred")
            return item

        return None

    async def search(
        self, tenant: TenantContext, query: str, limit: int = 10
    ) -> list[dict[str, Any]]:
        """Full-text search over canonical item names."""
        return await self._repo.search(tenant, query, limit=limit)

    async def list_items(
        self,
        tenant: TenantContext,
        category: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        return await self._repo.list(tenant, category=category, limit=limit, offset=offset)

    async def add_alias(
        self,
        tenant: TenantContext,
        canonical_item_id: UUID,
        alias_name: str,
        confidence: float = 1.0,
    ) -> dict[str, Any] | None:
        """Manually add an alias (e.g. from operator correction)."""
        return await self._repo.add_alias(
            tenant, canonical_item_id, alias_name, source="manual", confidence=confidence
        )
