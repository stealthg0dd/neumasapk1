"""
Document routes — normalized document management and review workflow.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import TenantContext, get_tenant_context
from app.core.logging import get_logger
from app.schemas.documents import (
    DocumentApproveRequest,
    DocumentLineItemUpdate,
    DocumentListResponse,
)
from app.services.document_review_service import DocumentReviewService
from app.services.document_service import DocumentService

logger = get_logger(__name__)
router = APIRouter()

_document_service = DocumentService()
_review_service = DocumentReviewService()


@router.get(
    "/",
    response_model=DocumentListResponse,
    summary="List documents",
)
async def list_documents(
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
    status: str | None = None,
    review_needed: bool | None = None,
    page: int = 1,
    page_size: int = 20,
) -> DocumentListResponse:
    """List documents for the current tenant."""
    offset = (page - 1) * page_size
    docs = await _document_service.list_documents(
        tenant, status=status, review_needed=review_needed, limit=page_size, offset=offset
    )
    return DocumentListResponse(
        documents=docs,
        total=len(docs),
        page=page,
        page_size=page_size,
    )


@router.get(
    "/review-queue",
    summary="Get documents needing review",
)
async def review_queue(
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> list[dict]:
    """Return documents that need human review."""
    return await _document_service.get_review_queue(tenant)


@router.get(
    "/{document_id}",
    summary="Get document with line items",
)
async def get_document(
    document_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> dict:
    """Get a document with all its line items."""
    doc = await _document_service.get_with_line_items(tenant, document_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return doc


@router.post(
    "/{document_id}/approve",
    summary="Approve document and post to inventory",
)
async def approve_document(
    document_id: UUID,
    request: DocumentApproveRequest,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> dict:
    """Approve a document and post all line items as inventory movements."""
    try:
        result = await _review_service.approve_and_post(tenant, document_id, request.notes)
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error("Document approval failed", document_id=str(document_id), error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to approve document",
        )


@router.patch(
    "/{document_id}/line-items/{line_item_id}",
    summary="Edit extracted line item",
)
async def update_line_item(
    document_id: UUID,
    line_item_id: UUID,
    updates: DocumentLineItemUpdate,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> dict:
    """Apply an operator correction to a document line item."""
    result = await _review_service.correct_line_item(
        tenant, line_item_id, updates.model_dump(exclude_none=True)
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Line item not found",
        )
    return result
