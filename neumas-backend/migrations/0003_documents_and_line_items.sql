-- =============================================================================
-- Migration 0003 — Documents and Document Line Items
-- =============================================================================
-- Adds normalized document records (receipts, invoices) and their
-- extracted line items with confidence scores and review flags.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scan_id          uuid REFERENCES scans(id),
  document_type    text NOT NULL DEFAULT 'receipt', -- receipt | invoice | delivery_note
  status           text NOT NULL DEFAULT 'pending', -- pending | processing | review | approved | rejected
  -- raw payload from VisionAgent
  raw_extraction   jsonb NOT NULL DEFAULT '{}',
  -- normalized extraction (post-vendor/item normalization)
  normalized_data  jsonb NOT NULL DEFAULT '{}',
  -- vendor info
  raw_vendor_name  text,
  vendor_id        uuid,                           -- FK to vendors (migration 0004)
  -- document-level confidence
  overall_confidence  numeric(5,4),
  review_needed    boolean NOT NULL DEFAULT false,
  review_reason    text,
  reviewed_by_id   uuid REFERENCES users(id),
  reviewed_at      timestamptz,
  -- audit
  approved_by_id   uuid REFERENCES users(id),
  approved_at      timestamptz,
  -- full-text search vector
  search_vector    tsvector,
  created_by_id    uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_property   ON documents(property_id);
CREATE INDEX IF NOT EXISTS idx_documents_org        ON documents(org_id);
CREATE INDEX IF NOT EXISTS idx_documents_scan       ON documents(scan_id) WHERE scan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_status     ON documents(property_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_review     ON documents(property_id, review_needed) WHERE review_needed = true;
CREATE INDEX IF NOT EXISTS idx_documents_search     ON documents USING gin(search_vector);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY documents_select ON documents FOR SELECT
  USING (org_id = auth.org_id() AND auth.can_access_property(property_id));
CREATE POLICY documents_insert ON documents FOR INSERT
  WITH CHECK (org_id = auth.org_id() AND auth.can_access_property(property_id));
CREATE POLICY documents_update ON documents FOR UPDATE
  USING (org_id = auth.org_id() AND auth.can_access_property(property_id));

DO $$ BEGIN
  CREATE TRIGGER trg_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- document_line_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_line_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  property_id         uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- raw extracted values
  raw_name            text NOT NULL,
  raw_quantity        numeric(10,3),
  raw_unit            text,
  raw_price           numeric(10,2),
  raw_total           numeric(10,2),
  -- normalized values
  normalized_name     text,
  normalized_quantity numeric(10,3),
  normalized_unit     text,
  unit_price          numeric(10,2),
  -- link to canonical item (migration 0005)
  canonical_item_id   uuid,
  -- link to vendor (migration 0004)
  vendor_id           uuid,
  -- extraction metadata
  confidence          numeric(5,4),
  review_needed       boolean NOT NULL DEFAULT false,
  review_reason       text,
  -- correction tracking
  original_raw_name   text,                        -- if operator edits the line
  corrected_by_id     uuid REFERENCES users(id),
  corrected_at        timestamptz,
  -- movement link (set after document approval)
  inventory_movement_id uuid REFERENCES inventory_movements(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dli_document    ON document_line_items(document_id);
CREATE INDEX IF NOT EXISTS idx_dli_property    ON document_line_items(property_id);
CREATE INDEX IF NOT EXISTS idx_dli_review      ON document_line_items(property_id, review_needed) WHERE review_needed = true;

ALTER TABLE document_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY dli_select ON document_line_items FOR SELECT
  USING (org_id = auth.org_id() AND auth.can_access_property(property_id));
CREATE POLICY dli_insert ON document_line_items FOR INSERT
  WITH CHECK (org_id = auth.org_id() AND auth.can_access_property(property_id));
CREATE POLICY dli_update ON document_line_items FOR UPDATE
  USING (org_id = auth.org_id() AND auth.can_access_property(property_id));

DO $$ BEGIN
  CREATE TRIGGER trg_dli_updated_at
    BEFORE UPDATE ON document_line_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
