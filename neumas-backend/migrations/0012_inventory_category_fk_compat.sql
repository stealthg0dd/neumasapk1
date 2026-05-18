-- Migration 0012 -- Inventory category relation compatibility
-- Ensures category_id FK metadata exists so PostgREST category embedding works.

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS category_id uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'inventory_items'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'inventory_categories'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_class rt ON rt.oid = c.confrelid
    WHERE n.nspname = 'public'
      AND t.relname = 'inventory_items'
      AND rt.relname = 'inventory_categories'
      AND c.contype = 'f'
      AND array_length(c.conkey, 1) = 1
      AND EXISTS (
        SELECT 1
        FROM pg_attribute a
        WHERE a.attrelid = t.oid
          AND a.attnum = c.conkey[1]
          AND a.attname = 'category_id'
      )
  ) THEN
    ALTER TABLE inventory_items
      ADD CONSTRAINT fk_inventory_items_category_id
      FOREIGN KEY (category_id)
      REFERENCES inventory_categories(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_items_category_id
  ON inventory_items(category_id)
  WHERE category_id IS NOT NULL;
