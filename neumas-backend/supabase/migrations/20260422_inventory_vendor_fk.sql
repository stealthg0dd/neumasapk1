-- =============================================================================
-- Migration 20260422 — inventory_items: vendor FK, supplier_name kept, org_id dropped
-- =============================================================================
-- Depends on: vendors and vendor_aliases tables (schema_03 / migration 0004).
--
-- Changes:
--   1. Add vendor_id FK column to inventory_items (nullable, ON DELETE SET NULL).
--   2. Backfill vendor_id by matching supplier_name → vendors and vendor_aliases
--      (case-insensitive), then fall back to supplier_info->>'name'.
--   3. supplier_name is KEPT as a read-only historical reference column.
--   4. Drop the legacy org_id column (and its index) from inventory_items.
--      All application code uses organization_id; org_id is dead weight.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Step 1 — Add vendor_id column
-- ---------------------------------------------------------------------------

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS vendor_id uuid
    REFERENCES vendors(id) ON DELETE SET NULL;

COMMENT ON COLUMN inventory_items.vendor_id IS
  'FK to vendors.id. Resolved during scan ingestion via alias lookup.
   supplier_name is kept as the immutable raw string from the original receipt.';

CREATE INDEX IF NOT EXISTS idx_inventory_vendor
  ON inventory_items(vendor_id)
  WHERE vendor_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inventory_items'
      AND column_name = 'supplier_name'
  ) THEN
    UPDATE inventory_items ii
       SET vendor_id = v.id
      FROM vendors v
     WHERE ii.organization_id IS NOT NULL
       AND ii.organization_id = v.organization_id
       AND ii.vendor_id       IS NULL
       AND ii.supplier_name   IS NOT NULL
       AND lower(trim(ii.supplier_name)) = lower(trim(v.name));
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inventory_items'
      AND column_name = 'supplier_name'
  ) THEN
    UPDATE inventory_items ii
       SET vendor_id = va.vendor_id
      FROM vendor_aliases va
     WHERE ii.organization_id IS NOT NULL
       AND ii.organization_id = va.organization_id
       AND ii.vendor_id       IS NULL
       AND ii.supplier_name   IS NOT NULL
       AND lower(trim(ii.supplier_name)) = lower(trim(va.alias_name));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Step 4 — Backfill from supplier_info->>'name' via vendors.name
--          (canonical schema stored vendor name inside the JSONB blob)
-- ---------------------------------------------------------------------------

UPDATE inventory_items ii
   SET vendor_id = v.id
  FROM vendors v
 WHERE ii.organization_id         IS NOT NULL
   AND ii.organization_id         = v.organization_id
   AND ii.vendor_id               IS NULL
   AND (ii.supplier_info ->> 'name') IS NOT NULL
   AND lower(trim(ii.supplier_info ->> 'name')) = lower(trim(v.name));

-- ---------------------------------------------------------------------------
-- Step 5 — Backfill from supplier_info->>'name' via vendor_aliases
-- ---------------------------------------------------------------------------

UPDATE inventory_items ii
   SET vendor_id = va.vendor_id
  FROM vendor_aliases va
 WHERE ii.organization_id         IS NOT NULL
   AND ii.organization_id         = va.organization_id
   AND ii.vendor_id               IS NULL
   AND (ii.supplier_info ->> 'name') IS NOT NULL
   AND lower(trim(ii.supplier_info ->> 'name')) = lower(trim(va.alias_name));

-- ---------------------------------------------------------------------------
-- Step 6 — Drop legacy org_id column from inventory_items
--          (organization_id is the canonical column everywhere in the codebase)
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS idx_inventory_items_org_id;

ALTER TABLE inventory_items DROP COLUMN IF EXISTS org_id;
