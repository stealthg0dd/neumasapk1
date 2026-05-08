-- =============================================================================
-- Migration 20260422 -- Historical inventory valuation snapshots
-- =============================================================================

CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id     uuid          NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  total_value     numeric(14,2) NOT NULL DEFAULT 0,
  item_count      integer       NOT NULL DEFAULT 0,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_property_created
  ON inventory_snapshots(property_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_org_created
  ON inventory_snapshots(organization_id, created_at DESC);
