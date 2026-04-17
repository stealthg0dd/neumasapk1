"""
Retrieval infrastructure — Postgres-first, pgvector-ready.

Current implementation uses tsvector full-text search (no ML dependency).
pgvector is enabled on the database (migration 0005) and the embedding
column is nullable — activate by populating `canonical_items.embedding`
via an async worker once the product reaches that maturity level.

Design intent:
- All retrieval goes through this module so the caller never has to know
  whether we're doing full-text or vector search.
- When pgvector is active, the module automatically routes queries to it.
- Operators never need to think about the switch.

To activate vector search:
  1. Populate `canonical_items.embedding` via an embedding pipeline.
  2. Set VECTOR_SEARCH_ENABLED=true in Railway environment.
  3. Deploy — no code change required.
"""

import os
from typing import Any

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.supabase_client import get_async_supabase_admin

logger = get_logger(__name__)

_VECTOR_SEARCH_ENABLED = os.getenv("VECTOR_SEARCH_ENABLED", "false").lower() == "true"


async def search_canonical_items(
    tenant: TenantContext,
    query: str,
    limit: int = 10,
    embedding: list[float] | None = None,
) -> list[dict[str, Any]]:
    """
    Search for canonical items using full-text or vector search.

    If VECTOR_SEARCH_ENABLED is True and an embedding is provided,
    performs pgvector cosine similarity search. Otherwise falls back to
    tsvector full-text search.

    Args:
        tenant: Multi-tenant context
        query: Natural language search query
        limit: Maximum number of results
        embedding: Optional pre-computed 1536-dim embedding vector.
                   If None, full-text search is used regardless of flag.

    Returns:
        List of canonical item dicts, ordered by relevance.
    """
    if _VECTOR_SEARCH_ENABLED and embedding is not None:
        return await _vector_search(tenant, embedding, limit)
    return await _fulltext_search(tenant, query, limit)


async def _fulltext_search(
    tenant: TenantContext,
    query: str,
    limit: int,
) -> list[dict[str, Any]]:
    """tsvector full-text search over canonical_items.canonical_name."""
    client = await get_async_supabase_admin()
    resp = await (
        client.table("canonical_items")
        .select("id, canonical_name, category, default_unit")
        .eq("org_id", str(tenant.org_id))
        .text_search("canonical_name_tsv", query, config="english")
        .limit(limit)
        .execute()
    )
    return resp.data or []


async def _vector_search(
    tenant: TenantContext,
    embedding: list[float],
    limit: int,
) -> list[dict[str, Any]]:
    """
    pgvector cosine similarity search.

    Requires the pgvector extension and the `canonical_items.embedding`
    column to be populated. Called only when VECTOR_SEARCH_ENABLED=true.
    """
    client = await get_async_supabase_admin()
    # Use Supabase RPC to call a custom Postgres function:
    #   create function match_canonical_items(query_embedding vector(1536), match_count int, p_org_id uuid)
    #   returns table(id uuid, canonical_name text, category text, similarity float)
    resp = await client.rpc(
        "match_canonical_items",
        {
            "query_embedding": embedding,
            "match_count": limit,
            "p_org_id": str(tenant.org_id),
        },
    ).execute()
    return resp.data or []


async def search_vendors(
    tenant: TenantContext,
    query: str,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Full-text search over vendor names."""
    client = await get_async_supabase_admin()
    resp = await (
        client.table("vendors")
        .select("id, name, contact_name, contact_email")
        .eq("org_id", str(tenant.org_id))
        .ilike("name", f"%{query}%")
        .limit(limit)
        .execute()
    )
    return resp.data or []


# ---------------------------------------------------------------------------
# Documents / line items
# ---------------------------------------------------------------------------

async def search_documents(
    tenant: TenantContext,
    query: str,
    document_type: str | None = None,
    vendor_name: str | None = None,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """
    Search documents by vendor name (ilike) scoped to the tenant.

    Args:
        tenant: Multi-tenant context
        query: Search query applied to raw_vendor_name when vendor_name is not set
        document_type: Optional document type filter
        vendor_name: Explicit vendor name fragment to match
        limit: Max results

    Returns:
        List of document dicts
    """
    client = await get_async_supabase_admin()
    if not client:
        return []
    try:
        q = (
            client.table("documents")
            .select("id, document_type, raw_vendor_name, overall_confidence, status, created_at")
            .eq("org_id", str(tenant.org_id))
        )
        if tenant.property_id:
            q = q.eq("property_id", str(tenant.property_id))
        if document_type:
            q = q.eq("document_type", document_type)
        match_query = vendor_name or query
        if match_query:
            q = q.ilike("raw_vendor_name", f"%{match_query}%")
        resp = await q.order("created_at", desc=True).limit(limit).execute()
        return resp.data or []
    except Exception as exc:
        logger.warning("search_documents failed", error=str(exc))
        return []


async def search_line_items(
    tenant: TenantContext,
    query: str,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Search normalised line item names (ilike)."""
    client = await get_async_supabase_admin()
    if not client:
        return []
    try:
        resp = await (
            client.table("document_line_items")
            .select(
                "id, document_id, raw_name, normalized_name, "
                "normalized_quantity, normalized_unit, confidence, review_needed"
            )
            .ilike("normalized_name", f"%{query}%")
            .order("confidence", desc=True)
            .limit(limit)
            .execute()
        )
        return resp.data or []
    except Exception as exc:
        logger.warning("search_line_items failed", error=str(exc))
        return []


async def list_recent_vendor_prices(
    tenant: TenantContext,
    item_name: str,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Return recent price data for a named item across all vendors."""
    client = await get_async_supabase_admin()
    if not client:
        return []
    try:
        resp = await (
            client.table("document_line_items")
            .select(
                "id, raw_name, normalized_name, raw_price, raw_total, "
                "normalized_quantity, normalized_unit, "
                "documents(raw_vendor_name, vendor_id, created_at)"
            )
            .ilike("normalized_name", f"%{item_name}%")
            .not_.is_("raw_price", "null")
            .order("documents.created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return resp.data or []
    except Exception as exc:
        logger.warning("list_recent_vendor_prices failed", error=str(exc))
        return []


async def get_latest_report(
    tenant: TenantContext,
    report_type: str,
) -> dict[str, Any] | None:
    """Return the most recent completed report of a given type."""
    client = await get_async_supabase_admin()
    if not client:
        return None
    try:
        resp = await (
            client.table("reports")
            .select("id, report_type, status, result_url, created_at, completed_at")
            .eq("org_id", str(tenant.org_id))
            .eq("report_type", report_type)
            .eq("status", "ready")
            .order("created_at", desc=True)
            .limit(1)
            .single()
            .execute()
        )
        return resp.data
    except Exception as exc:
        logger.debug("get_latest_report not found or failed", error=str(exc))
        return None
