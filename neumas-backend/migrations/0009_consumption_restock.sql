-- =============================================================================
-- Migration 20260422 -- Consumption tracking + predictive restock columns
-- =============================================================================

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS average_daily_usage numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_reorder_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS safety_buffer numeric(12,3) NOT NULL DEFAULT 0;

COMMENT ON COLUMN inventory_items.average_daily_usage IS
  'Computed burn rate (average daily usage) from 30-day manual adjustments minus scan restocks.';
COMMENT ON COLUMN inventory_items.auto_reorder_enabled IS
  'When true, reorder_point is auto-computed from burn rate and safety buffer.';
COMMENT ON COLUMN inventory_items.safety_buffer IS
  'Absolute quantity buffer added on top of 7-day burn rate target.';

CREATE INDEX IF NOT EXISTS idx_inventory_avg_daily_usage
  ON inventory_items(property_id, average_daily_usage)
  WHERE is_active = true;
