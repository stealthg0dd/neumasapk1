from __future__ import annotations

"""
Vendor service — normalises raw vendor names to canonical vendor records.

Normalisation pipeline:
1. Exact alias lookup (fastest path, learned from past operator corrections)
2. Fuzzy match against existing vendor canonical names
3. Create new vendor if no match above threshold

Threshold is conservative (0.80) to avoid bad merges; operators see
unmatched vendors in the review queue and can merge or confirm.
"""

from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.repositories.vendors import VendorsRepository
from app.utils.fuzzy_match import best_match

logger = get_logger(__name__)

_MATCH_THRESHOLD = 0.80


class VendorService:
    """Service for vendor normalisation and management."""

    def __init__(self) -> None:
        self._repo = VendorsRepository()

    async def normalise(
        self,
        tenant: TenantContext,
        raw_name: str,
        auto_create: bool = True,
    ) -> dict[str, Any] | None:
        """
        Normalise a raw vendor name to a canonical vendor record.

        Returns the matched or newly created vendor dict, or None if
        auto_create is False and no match was found.
        """
        if not raw_name or not raw_name.strip():
            return None

        raw_name = raw_name.strip()

        # 1. Exact alias lookup
        vendor = await self._repo.find_by_alias(tenant, raw_name)
        if vendor:
            logger.debug("Vendor matched via alias", raw_name=raw_name, vendor_id=vendor["id"])
            return vendor

        # 2. Exact canonical name match (case-insensitive)
        vendor = await self._repo.find_by_name(tenant, raw_name)
        if vendor:
            # Register as alias for future exact hits
            await self._repo.add_alias(tenant, UUID(vendor["id"]), raw_name, source="inferred")
            return vendor

        # 3. Fuzzy match against all vendor names for this org
        all_vendors = await self._repo.list(tenant, limit=500)
        candidate_names = [v["name"] for v in all_vendors]

        match = best_match(raw_name, candidate_names, threshold=_MATCH_THRESHOLD)
        if match:
            matched_name, score = match
            vendor = next((v for v in all_vendors if v["name"] == matched_name), None)
            if vendor:
                await self._repo.add_alias(tenant, UUID(vendor["id"]), raw_name, source="fuzzy")
                logger.info(
                    "Vendor matched via fuzzy",
                    raw_name=raw_name,
                    matched_to=matched_name,
                    score=score,
                )
                return vendor

        # 4. No match — create new if permitted
        if auto_create:
            vendor = await self._repo.create(tenant, name=raw_name)
            if vendor:
                await self._repo.add_alias(tenant, UUID(vendor["id"]), raw_name, source="inferred")
            return vendor

        logger.info("No vendor match found, auto_create=False", raw_name=raw_name)
        return None

    async def list_vendors(
        self, tenant: TenantContext, limit: int = 50, offset: int = 0
    ) -> list[dict[str, Any]]:
        return await self._repo.list(tenant, limit=limit, offset=offset)

    async def get_vendor(self, tenant: TenantContext, vendor_id: UUID) -> dict[str, Any] | None:
        return await self._repo.get_by_id(tenant, vendor_id)

    async def merge_vendors(
        self,
        tenant: TenantContext,
        source_id: UUID,
        target_id: UUID,
    ) -> dict[str, Any] | None:
        """
        Merge source vendor into target vendor.

        All aliases from source are re-pointed to target; source is deleted.
        """
        source = await self._repo.get_by_id(tenant, source_id)
        target = await self._repo.get_by_id(tenant, target_id)
        if not source or not target:
            return None

        # Add source canonical name as alias on target
        await self._repo.add_alias(tenant, target_id, source["name"], source="merged")

        # Soft-delete source vendor (the aliases table will cascade or remain)
        await self._repo.update(tenant, source_id, {"is_active": False, "merged_into_id": str(target_id)})

        logger.info(
            "Vendors merged",
            source_id=str(source_id),
            target_id=str(target_id),
        )
        return target
