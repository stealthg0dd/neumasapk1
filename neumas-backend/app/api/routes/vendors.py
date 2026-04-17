"""
Vendors routes — vendor management and normalisation endpoints.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import TenantContext, get_tenant_context
from app.core.logging import get_logger
from app.services.catalog_service import CatalogService
from app.services.vendor_service import VendorService

logger = get_logger(__name__)
router = APIRouter()

_vendor_service = VendorService()
_catalog_service = CatalogService()


class VendorMergeRequest(BaseModel):
    source_id: UUID
    target_id: UUID


class VendorCreateRequest(BaseModel):
    name: str
    contact_name: str | None = None
    contact_email: str | None = None
    phone: str | None = None
    address: str | None = None
    notes: str | None = None


class ItemAliasRequest(BaseModel):
    alias_name: str
    confidence: float = 1.0


# ---- Vendors ---------------------------------------------------------------


@router.get("/", summary="List vendors")
async def list_vendors(
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
    page: int = 1,
    page_size: int = 20,
) -> dict:
    offset = (page - 1) * page_size
    vendors = await _vendor_service.list_vendors(tenant, limit=page_size, offset=offset)
    return {"vendors": vendors, "page": page, "page_size": page_size}


@router.post("/", summary="Create vendor", status_code=status.HTTP_201_CREATED)
async def create_vendor(
    body: VendorCreateRequest,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> dict:
    from app.db.repositories.vendors import VendorsRepository

    repo = VendorsRepository()
    vendor = await repo.create(tenant, name=body.name, **body.model_dump(exclude={"name"}, exclude_none=True))
    if not vendor:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Create failed")
    return vendor


@router.get("/{vendor_id}", summary="Get vendor")
async def get_vendor(
    vendor_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> dict:
    vendor = await _vendor_service.get_vendor(tenant, vendor_id)
    if not vendor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    return vendor


@router.post("/merge", summary="Merge two vendor records")
async def merge_vendors(
    body: VendorMergeRequest,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> dict:
    result = await _vendor_service.merge_vendors(tenant, body.source_id, body.target_id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or both vendors not found")
    return result


@router.post("/normalise", summary="Normalise a raw vendor name")
async def normalise_vendor(
    raw_name: str,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> dict:
    vendor = await _vendor_service.normalise(tenant, raw_name)
    if not vendor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No match found")
    return vendor


# ---- Catalog (canonical items) ---------------------------------------------


@router.get("/catalog/items", summary="List canonical items")
async def list_catalog_items(
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
    category: str | None = None,
    q: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    if q:
        items = await _catalog_service.search(tenant, q, limit=page_size)
    else:
        offset = (page - 1) * page_size
        items = await _catalog_service.list_items(tenant, category=category, limit=page_size, offset=offset)
    return {"items": items, "page": page, "page_size": page_size}


@router.post("/catalog/items/{item_id}/aliases", summary="Add alias to canonical item")
async def add_item_alias(
    item_id: UUID,
    body: ItemAliasRequest,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
) -> dict:
    result = await _catalog_service.add_alias(tenant, item_id, body.alias_name, body.confidence)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found or alias conflict")
    return result
