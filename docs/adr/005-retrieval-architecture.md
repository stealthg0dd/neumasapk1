# ADR 005 — Retrieval Architecture

**Date:** 2026-04-17
**Status:** Accepted (Phase 1: Postgres only; pgvector future-proofed)
**Deciders:** Engineering

---

## Context

As Neumas grows, operators will want to ask questions like:
- "Why did we run out of salmon last Tuesday?"
- "Which vendor has the best price on chicken breast?"
- "What happened to our food cost this month?"

These questions require retrieval over structured data, documents, and potentially unstructured content (vendor notes, report summaries).

## Decision

### Phase 1 (current)

1. **Retrieval is Postgres-only.** No separate vector store or search service.

2. **`app/services/retrieval_service.py`** provides structured search methods:
   - `search_documents(query, org_id, filters)` — full-text search over document content
   - `explain_prediction(prediction_id, tenant)` — return prediction + contributing data
   - `compare_vendors(vendor_ids, org_id)` — price and reliability comparison
   - `summarize_outlet_risk(property_id, tenant)` — aggregate risk signals
   - `generate_reorder_plan(property_id, tenant)` — reorder recommendations

3. **Postgres `tsvector` full-text search** is used for document content search. An index on documents is created in migration 0003.

4. **Graph-friendly relationships** are defined in the data model to support future graph traversal:
   - `vendor → vendor_supplied_items → canonical_item → category → outlet → price_observation`

### Phase 2 (future, not built now)

5. **pgvector extension** can be added to Supabase to enable semantic similarity search over document content, vendor notes, and report summaries. The retrieval service interface is designed to swap implementations.

6. **MCP tool exposure** is possible by wrapping retrieval methods as tool definitions in `app/services/copilot_tool_service.py`. MCP is NOT a runtime dependency for any operator-facing product flow.

## Consequences

- Operators can search their data without leaving the product.
- Future AI copilot can call retrieval tools without architectural changes.
- No new infrastructure required in Phase 1.
- pgvector migration is a single schema addition when needed.

## Alternatives Considered

- **Dedicated vector store (Pinecone, Weaviate):** Rejected for Phase 1. Adds operational complexity and cost. Postgres + pgvector provides 90% of the capability.
- **GraphRAG:** Rejected for now. Graph relationships are modeled in the schema but graph traversal queries are not built. Added when operator demand exists.
