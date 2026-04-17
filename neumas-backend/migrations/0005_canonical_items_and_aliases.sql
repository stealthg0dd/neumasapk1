-- =============================================================================
-- Migration 0005 — Canonical Items and Item Aliases
-- =============================================================================
-- Adds cross-property canonical item catalog and raw-to-canonical alias map.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- canonical_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS canonical_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  category        text,
  base_unit       text NOT NULL DEFAULT 'unit',
  -- unit conversion config: { "case": 12, "pack": 6 }
  unit_config     jsonb NOT NULL DEFAULT '{}',
  description     text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_canonical_items_org ON canonical_items(org_id);

ALTER TABLE canonical_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY canonical_items_select ON canonical_items FOR SELECT
  USING (org_id = auth.org_id());
CREATE POLICY canonical_items_insert ON canonical_items FOR INSERT
  WITH CHECK (org_id = auth.org_id());
CREATE POLICY canonical_items_update ON canonical_items FOR UPDATE
  USING (org_id = auth.org_id());

DO $$ BEGIN
  CREATE TRIGGER trg_canonical_items_updated_at
    BEFORE UPDATE ON canonical_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- item_aliases  (raw name → canonical item)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS item_aliases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_item_id uuid NOT NULL REFERENCES canonical_items(id) ON DELETE CASCADE,
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  raw_name          text NOT NULL,
  match_type        text NOT NULL DEFAULT 'manual', -- manual | fuzzy | exact
  confidence        numeric(5,4),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, raw_name)
);

CREATE INDEX IF NOT EXISTS idx_item_aliases_canonical ON item_aliases(canonical_item_id);
CREATE INDEX IF NOT EXISTS idx_item_aliases_org       ON item_aliases(org_id);

ALTER TABLE item_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY item_aliases_select ON item_aliases FOR SELECT
  USING (org_id = auth.org_id());
CREATE POLICY item_aliases_insert ON item_aliases FOR INSERT
  WITH CHECK (org_id = auth.org_id());

-- Add FK from document_line_items to canonical_items (deferred)
ALTER TABLE document_line_items
  ADD COLUMN IF NOT EXISTS canonical_item_id uuid REFERENCES canonical_items(id);
