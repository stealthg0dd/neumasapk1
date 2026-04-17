"""
Document review service — handles the approve-and-post workflow.

When an operator approves a document:
1. All line items are posted as purchase inventory movements
2. inventory_items.quantity is updated for each item
3. Document status is set to 'approved'
4. Each line item is linked to its movement
"""

from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.repositories.document_line_items import DocumentLineItemsRepository
from app.db.repositories.documents import DocumentsRepository
from app.services.inventory_ledger_service import InventoryLedgerService
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)


class DocumentReviewService:
    """Service for document review and approval workflow."""

    def __init__(self) -> None:
        self._docs_repo = DocumentsRepository()
        self._line_items_repo = DocumentLineItemsRepository()
        self._ledger = InventoryLedgerService()

    async def approve_and_post(
        self,
        tenant: TenantContext,
        document_id: UUID,
        notes: str | None = None,
    ) -> dict[str, Any]:
        """
        Approve a document and post all line items as inventory movements.

        Returns a summary of what was posted.
        """
        document = await self._docs_repo.get_by_id(tenant, document_id)
        if not document:
            raise ValueError(f"Document {document_id} not found")

        if document.get("status") == "approved":
            return {"status": "already_approved", "document_id": str(document_id)}

        line_items = await self._line_items_repo.list_for_document(tenant, document_id)

        client = await get_async_supabase_admin()
        posted = []
        skipped = []

        for line_item in line_items:
            raw_name = line_item.get("normalized_name") or line_item.get("raw_name", "")
            quantity = float(line_item.get("normalized_quantity") or line_item.get("raw_quantity") or 0)
            unit = line_item.get("normalized_unit") or line_item.get("raw_unit") or "unit"

            if quantity <= 0:
                skipped.append({"line_item_id": line_item["id"], "reason": "zero_quantity"})
                continue

            # Find the inventory item by normalized name in this property
            item_resp = await (
                client.table("inventory_items")
                .select("id")
                .eq("property_id", str(tenant.property_id) if tenant.property_id else "")
                .ilike("name", raw_name)
                .limit(1)
                .execute()
            )
            if not item_resp.data:
                skipped.append({
                    "line_item_id": line_item["id"],
                    "reason": "item_not_found",
                    "name": raw_name,
                })
                continue

            item_id = UUID(item_resp.data[0]["id"])
            idempotency_key = f"doc:{document_id}:line:{line_item['id']}"

            movement = await self._ledger.apply_purchase(
                tenant=tenant,
                item_id=item_id,
                quantity=quantity,
                unit=unit,
                document_id=document_id,
                idempotency_key=idempotency_key,
            )

            if movement:
                await self._line_items_repo.link_movement(
                    tenant, UUID(line_item["id"]), UUID(movement["id"])
                )
                posted.append({"line_item_id": line_item["id"], "movement_id": movement["id"]})

        # Mark document as approved
        await self._docs_repo.update_status(
            tenant, document_id, "approved", approved_by_id=tenant.user_id
        )

        logger.info(
            "Document approved and posted",
            document_id=str(document_id),
            posted_count=len(posted),
            skipped_count=len(skipped),
        )

        return {
            "status": "approved",
            "document_id": str(document_id),
            "movements_created": len(posted),
            "items_skipped": len(skipped),
            "skipped": skipped,
        }

    async def correct_line_item(
        self,
        tenant: TenantContext,
        line_item_id: UUID,
        updates: dict[str, Any],
    ) -> dict[str, Any] | None:
        """Apply an operator correction to a line item."""
        updates["corrected_by_id"] = str(tenant.user_id)
        updates["corrected_at"] = "now()"
        updates["review_needed"] = False  # Operator reviewed it
        return await self._line_items_repo.update_line_item(tenant, line_item_id, updates)
