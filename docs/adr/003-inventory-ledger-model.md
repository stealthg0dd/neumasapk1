# ADR 003 — Inventory Ledger Model

**Date:** 2026-04-17
**Status:** Accepted
**Deciders:** Engineering

---

## Context

`inventory_items` currently stores only the current quantity snapshot. This means:
- There is no audit trail of how quantities changed.
- Duplicate task replays can silently double-write quantities.
- Operators cannot explain discrepancies between physical stock and system stock.
- Forecast evaluation cannot correlate predictions against actual consumption events.

## Decision

1. **Introduce an append-only `inventory_movements` ledger table.** Every quantity-changing action creates a movement row. The `inventory_items.quantity` field remains as a denormalized current-state cache for fast reads.

2. **Movement types:**
   - `purchase` — items received via scanned document
   - `manual_adjustment` — operator-entered correction
   - `usage` — consumption applied (manual or AI-inferred)
   - `waste` — discarded or spoiled items
   - `expiry` — expired items removed
   - `transfer` — moved between properties
   - `correction` — administrative correction with reason

3. **Every movement stores:** `item_id`, `property_id`, `org_id`, `movement_type`, `quantity_delta`, `quantity_before`, `quantity_after`, `reference_id` (document or task), `reference_type`, `idempotency_key`, `notes`, `created_by_id`, `created_at`.

4. **Idempotency:** The `idempotency_key` column has a unique constraint per item to prevent double-writes on Celery task retries.

5. **`inventory_items.quantity` is the current-state cache.** It is updated atomically after each movement write. If it ever drifts, it can be recomputed from movements.

6. **Document-sourced movements** are linked to `document_line_items` via `reference_id`.

## Consequences

- Full audit trail of every stock change.
- Safe Celery task retry (idempotency key prevents duplicates).
- Operators can explain stock discrepancies.
- Enables consumption-rate analytics from real movement data.
- Slightly more complex write path (movement + snapshot update).

## Alternatives Considered

- **Event sourcing with full recompute:** Rejected as overly complex for current scale. Snapshot cache + ledger provides 90% of the benefit with much lower operational overhead.
- **Keep snapshot only with soft deletes:** Rejected because it provides no audit trail.
