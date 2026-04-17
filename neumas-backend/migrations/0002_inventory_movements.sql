-- =============================================================================
-- Migration 0002 — Inventory Movements
-- =============================================================================
-- Adds the append-only inventory movements ledger.
-- Every quantity-changing action creates a row here.
-- inventory_items.quantity remains as a current-state snapshot/cache.
--
-- See docs/adr/003-inventory-ledger-model.md
-- =============================================================================

-- ---------------------------------------------------------------------------
-- inventory_movements  (append-only ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_movements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id          uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  property_id      uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- movement_type: purchase | manual_adjustment | usage | waste | expiry | transfer | correction
  movement_type    text NOT NULL CHECK (movement_type IN (
    'purchase', 'manual_adjustment', 'usage', 'waste', 'expiry', 'transfer', 'correction'
  )),
  quantity_delta   numeric(10,2) NOT NULL,     -- positive = increase, negative = decrease
  quantity_before  numeric(10,2) NOT NULL,
  quantity_after   numeric(10,2) NOT NULL,
  unit             text NOT NULL DEFAULT 'unit',
  -- reference links back to the source record (document_id, scan_id, etc.)
  reference_id     uuid,
  reference_type   text,                        -- 'document' | 'scan' | 'shopping_list' | 'manual'
  -- idempotency_key prevents double-write on Celery task retry
  idempotency_key  text UNIQUE,
  notes            text,
  created_by_id    uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movements_item      ON inventory_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_movements_property  ON inventory_movements(property_id);
CREATE INDEX IF NOT EXISTS idx_movements_org       ON inventory_movements(org_id);
CREATE INDEX IF NOT EXISTS idx_movements_created   ON inventory_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_reference ON inventory_movements(reference_id) WHERE reference_id IS NOT NULL;

ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

-- RLS: org members can read movements for their org's properties
CREATE POLICY movements_select ON inventory_movements FOR SELECT
  USING (org_id = auth.org_id() AND auth.can_access_property(property_id));

-- RLS: insert allowed for org members with property access
CREATE POLICY movements_insert ON inventory_movements FOR INSERT
  WITH CHECK (org_id = auth.org_id() AND auth.can_access_property(property_id));

-- No UPDATE/DELETE — ledger is append-only
