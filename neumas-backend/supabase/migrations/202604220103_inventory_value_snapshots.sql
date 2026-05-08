-- =============================================================================
-- Migration 20260422 -- Inventory value snapshots for command-center trends
-- =============================================================================

CREATE TABLE IF NOT EXISTS inventory_value_snapshots (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id     uuid          NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  snapshot_date   date          NOT NULL,
  inventory_value numeric(14,2) NOT NULL DEFAULT 0,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (organization_id, property_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_inventory_value_snapshots_property_date
  ON inventory_value_snapshots(property_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_value_snapshots_org_date
  ON inventory_value_snapshots(organization_id, snapshot_date DESC);
