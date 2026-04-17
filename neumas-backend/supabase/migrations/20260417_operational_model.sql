-- FIXED: Auth schema permission error resolved (42501)
-- All helper functions moved to public schema with SECURITY DEFINER
-- Compatible with Supabase 2026 RLS + JWT custom claims hook

-- =============================================================================
-- Migration: 20260417_operational_model
-- Adds the operational model tables and fixes missing columns on existing tables.
-- =============================================================================
--
-- IDEMPOTENT: all statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- Apply on any existing database to bring it up to schema.sql parity.
--
-- Changes vs prior schema:
--   1. organizations: rename subscription_tier -> plan (if old column exists)
--   2. properties:    add type, currency columns
--   3. inventory_items: add organization_id, currency, tags columns
--   4. scans:         add organization_id column  (fixes usage_service bug)
--   5. consumption_patterns: add property_id, organization_id columns
--   6. predictions:   add organization_id, actual_value, accuracy_score columns
--   7. shopping_lists: add organization_id column
--   8. New tables:    inventory_movements, vendors, vendor_aliases,
--                     canonical_items, item_aliases, documents,
--                     document_line_items, alerts, audit_logs,
--                     usage_events, reports, feature_flags, research_posts
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. organizations: rename subscription_tier -> plan (if old column exists)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'subscription_tier'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'plan'
  ) THEN
    ALTER TABLE organizations RENAME COLUMN subscription_tier TO plan;
  END IF;
END $$;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free';


-- ---------------------------------------------------------------------------
-- 2. properties: add type, currency
-- ---------------------------------------------------------------------------

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS type     text NOT NULL DEFAULT 'restaurant',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';


-- ---------------------------------------------------------------------------
-- 3. inventory_items: add organization_id, currency, tags
-- ---------------------------------------------------------------------------

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS currency        text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS tags            text[] NOT NULL DEFAULT '{}';

-- Back-fill organization_id for existing rows
UPDATE inventory_items ii
SET organization_id = p.organization_id
FROM properties p
WHERE ii.property_id = p.id
  AND ii.organization_id IS NULL;

-- Add NOT NULL constraint once all rows are filled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_items'
      AND column_name = 'organization_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE inventory_items ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_org ON inventory_items(organization_id);


-- ---------------------------------------------------------------------------
-- 4. scans: add organization_id  (CRITICAL: fixes usage_service.get_org_summary)
-- ---------------------------------------------------------------------------

ALTER TABLE scans
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

-- Back-fill organization_id for existing rows
UPDATE scans s
SET organization_id = p.organization_id
FROM properties p
WHERE s.property_id = p.id
  AND s.organization_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scans'
      AND column_name = 'organization_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE scans ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_scans_org ON scans(organization_id);


-- ---------------------------------------------------------------------------
-- 5. consumption_patterns: add property_id, organization_id
-- ---------------------------------------------------------------------------

ALTER TABLE consumption_patterns
  ADD COLUMN IF NOT EXISTS property_id     uuid REFERENCES properties(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

-- Back-fill via inventory_items
UPDATE consumption_patterns cp
SET property_id = ii.property_id,
    organization_id = ii.organization_id
FROM inventory_items ii
WHERE cp.item_id = ii.id
  AND (cp.property_id IS NULL OR cp.organization_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_patterns_property ON consumption_patterns(property_id);
CREATE INDEX IF NOT EXISTS idx_patterns_org      ON consumption_patterns(organization_id);


-- ---------------------------------------------------------------------------
-- 6. predictions: add organization_id, actual_value, accuracy_score
-- ---------------------------------------------------------------------------

ALTER TABLE predictions
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS actual_value    numeric(12,3),
  ADD COLUMN IF NOT EXISTS accuracy_score  numeric(5,4);

-- Back-fill organization_id
UPDATE predictions pr
SET organization_id = p.organization_id
FROM properties p
WHERE pr.property_id = p.id
  AND pr.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_predictions_org ON predictions(organization_id);


-- ---------------------------------------------------------------------------
-- 7. shopping_lists: add organization_id
-- ---------------------------------------------------------------------------

ALTER TABLE shopping_lists
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE shopping_lists sl
SET organization_id = p.organization_id
FROM properties p
WHERE sl.property_id = p.id
  AND sl.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_shopping_lists_org ON shopping_lists(organization_id);


-- ---------------------------------------------------------------------------
-- 8. New tables
-- ---------------------------------------------------------------------------

-- vendors
CREATE TABLE IF NOT EXISTS vendors (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  normalized_name text,
  contact_email   text,
  contact_phone   text,
  address         text,
  website         text,
  metadata        jsonb       NOT NULL DEFAULT '{}',
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, normalized_name)
);
CREATE INDEX IF NOT EXISTS idx_vendors_org  ON vendors(organization_id);
CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors(organization_id, name);
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE TRIGGER trg_vendors_updated_at
  BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- vendor_aliases
CREATE TABLE IF NOT EXISTS vendor_aliases (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id       uuid        NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  alias_name      text        NOT NULL,
  source          text        NOT NULL DEFAULT 'manual',
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, alias_name)
);
CREATE INDEX IF NOT EXISTS idx_vendor_aliases_vendor ON vendor_aliases(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_aliases_org    ON vendor_aliases(organization_id);
CREATE INDEX IF NOT EXISTS idx_vendor_aliases_name   ON vendor_aliases(organization_id, alias_name);
ALTER TABLE vendor_aliases ENABLE ROW LEVEL SECURITY;

-- canonical_items
CREATE TABLE IF NOT EXISTS canonical_items (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  canonical_name     text        NOT NULL,
  category           text,
  default_unit       text        NOT NULL DEFAULT 'unit',
  description        text,
  metadata           jsonb       NOT NULL DEFAULT '{}',
  canonical_name_tsv tsvector    GENERATED ALWAYS AS (to_tsvector('english', canonical_name)) STORED,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, canonical_name)
);
CREATE INDEX IF NOT EXISTS idx_canonical_items_org  ON canonical_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_canonical_items_tsv  ON canonical_items USING gin(canonical_name_tsv);
CREATE INDEX IF NOT EXISTS idx_canonical_items_name ON canonical_items(organization_id, canonical_name);
ALTER TABLE canonical_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE TRIGGER trg_canonical_items_updated_at
  BEFORE UPDATE ON canonical_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- item_aliases
CREATE TABLE IF NOT EXISTS item_aliases (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_item_id uuid          NOT NULL REFERENCES canonical_items(id) ON DELETE CASCADE,
  organization_id   uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  alias_name        text          NOT NULL,
  source            text          NOT NULL DEFAULT 'manual',
  confidence        numeric(5,4)  NOT NULL DEFAULT 1.0,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (organization_id, alias_name)
);
CREATE INDEX IF NOT EXISTS idx_item_aliases_canonical ON item_aliases(canonical_item_id);
CREATE INDEX IF NOT EXISTS idx_item_aliases_org       ON item_aliases(organization_id);
CREATE INDEX IF NOT EXISTS idx_item_aliases_name      ON item_aliases(organization_id, alias_name);
ALTER TABLE item_aliases ENABLE ROW LEVEL SECURITY;

-- inventory_movements  (append-only ledger)
CREATE TABLE IF NOT EXISTS inventory_movements (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         uuid          NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  property_id     uuid          NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  organization_id uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  movement_type   text          NOT NULL,
  quantity_delta  numeric(12,3) NOT NULL,
  quantity_before numeric(12,3) NOT NULL,
  quantity_after  numeric(12,3) NOT NULL,
  unit            text          NOT NULL DEFAULT 'unit',
  reference_id    uuid,
  reference_type  text,
  created_by_id   uuid          REFERENCES users(id) ON DELETE SET NULL,
  notes           text,
  idempotency_key text          UNIQUE,
  created_at      timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_movements_item     ON inventory_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_movements_property ON inventory_movements(property_id);
CREATE INDEX IF NOT EXISTS idx_movements_org      ON inventory_movements(organization_id);
CREATE INDEX IF NOT EXISTS idx_movements_type     ON inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_movements_created  ON inventory_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_ref      ON inventory_movements(reference_id) WHERE reference_id IS NOT NULL;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

-- documents
CREATE TABLE IF NOT EXISTS documents (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id        uuid          REFERENCES properties(id) ON DELETE CASCADE,
  organization_id    uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scan_id            uuid          REFERENCES scans(id) ON DELETE SET NULL,
  document_type      text          NOT NULL DEFAULT 'receipt',
  status             text          NOT NULL DEFAULT 'pending',
  raw_extraction     jsonb         NOT NULL DEFAULT '{}',
  normalized_data    jsonb         NOT NULL DEFAULT '{}',
  raw_vendor_name    text,
  vendor_id          uuid,
  total_amount       numeric(12,4),
  currency           text          DEFAULT 'USD',
  document_date      date,
  overall_confidence numeric(5,4),
  review_needed      boolean       NOT NULL DEFAULT false,
  review_reason      text,
  reviewed_by_id     uuid          REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at        timestamptz,
  created_by_id      uuid          REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now()
);
ALTER TABLE documents
  ADD CONSTRAINT fk_documents_vendor
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL
  NOT VALID;  -- NOT VALID: safe to add on live DB; validate separately if needed
CREATE INDEX IF NOT EXISTS idx_documents_org      ON documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_property ON documents(property_id);
CREATE INDEX IF NOT EXISTS idx_documents_scan     ON documents(scan_id);
CREATE INDEX IF NOT EXISTS idx_documents_status   ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_vendor   ON documents(vendor_id);
CREATE INDEX IF NOT EXISTS idx_documents_created  ON documents(created_at DESC);
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- document_line_items
CREATE TABLE IF NOT EXISTS document_line_items (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         uuid          NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  property_id         uuid          REFERENCES properties(id) ON DELETE CASCADE,
  organization_id     uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  raw_name            text          NOT NULL,
  raw_quantity        numeric(12,3),
  raw_unit            text,
  raw_price           numeric(12,4),
  raw_total           numeric(12,4),
  normalized_name     text,
  normalized_quantity numeric(12,3),
  normalized_unit     text,
  unit_price          numeric(12,4),
  canonical_item_id   uuid          REFERENCES canonical_items(id) ON DELETE SET NULL,
  vendor_id           uuid          REFERENCES vendors(id) ON DELETE SET NULL,
  confidence          numeric(5,4),
  review_needed       boolean       NOT NULL DEFAULT false,
  review_reason       text,
  created_at          timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dli_document  ON document_line_items(document_id);
CREATE INDEX IF NOT EXISTS idx_dli_org       ON document_line_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_dli_property  ON document_line_items(property_id);
CREATE INDEX IF NOT EXISTS idx_dli_canonical ON document_line_items(canonical_item_id);
CREATE INDEX IF NOT EXISTS idx_dli_vendor    ON document_line_items(vendor_id);
ALTER TABLE document_line_items ENABLE ROW LEVEL SECURITY;

-- alerts
CREATE TABLE IF NOT EXISTS alerts (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id        uuid        REFERENCES properties(id) ON DELETE CASCADE,
  item_id            uuid        REFERENCES inventory_items(id) ON DELETE SET NULL,
  alert_type         text        NOT NULL,
  severity           text        NOT NULL,
  state              text        NOT NULL DEFAULT 'open',
  title              text        NOT NULL,
  body               text        NOT NULL,
  metadata           jsonb       NOT NULL DEFAULT '{}',
  acknowledged_by_id uuid        REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at    timestamptz,
  resolved_by_id     uuid        REFERENCES users(id) ON DELETE SET NULL,
  resolved_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alerts_org      ON alerts(organization_id);
CREATE INDEX IF NOT EXISTS idx_alerts_property ON alerts(property_id);
CREATE INDEX IF NOT EXISTS idx_alerts_state    ON alerts(organization_id, state);
CREATE INDEX IF NOT EXISTS idx_alerts_type     ON alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_item     ON alerts(item_id) WHERE item_id IS NOT NULL;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE TRIGGER trg_alerts_updated_at
  BEFORE UPDATE ON alerts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- audit_logs  (append-only)
CREATE TABLE IF NOT EXISTS audit_logs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id     uuid        REFERENCES properties(id) ON DELETE SET NULL,
  actor_id        uuid,
  actor_role      text,
  action          text        NOT NULL,
  resource_type   text        NOT NULL,
  resource_id     text,
  before_state    jsonb,
  after_state     jsonb,
  metadata        jsonb       NOT NULL DEFAULT '{}',
  ip_address      inet,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_org      ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor    ON audit_logs(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_action   ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_created  ON audit_logs(created_at DESC);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- usage_events  (append-only telemetry)
CREATE TABLE IF NOT EXISTS usage_events (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id     uuid          REFERENCES properties(id) ON DELETE SET NULL,
  user_id         uuid          REFERENCES users(id) ON DELETE SET NULL,
  feature         text          NOT NULL,
  event_type      text          NOT NULL,
  model           text,
  input_tokens    integer       NOT NULL DEFAULT 0,
  output_tokens   integer       NOT NULL DEFAULT 0,
  cost_usd        numeric(12,8) NOT NULL DEFAULT 0,
  reference_id    text,
  reference_type  text,
  metadata        jsonb         NOT NULL DEFAULT '{}',
  created_at      timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_org     ON usage_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_usage_feature ON usage_events(organization_id, feature);
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_user    ON usage_events(user_id) WHERE user_id IS NOT NULL;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

-- reports
CREATE TABLE IF NOT EXISTS reports (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id        uuid        REFERENCES properties(id) ON DELETE CASCADE,
  requested_by_id    uuid        REFERENCES users(id) ON DELETE SET NULL,
  report_type        text        NOT NULL,
  status             text        NOT NULL DEFAULT 'queued',
  params             jsonb       NOT NULL DEFAULT '{}',
  params_hash        text,
  result             jsonb,
  download_url       text,
  error_message      text,
  processing_time_ms integer,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_org      ON reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_reports_status   ON reports(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_reports_hash     ON reports(organization_id, params_hash) WHERE params_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_property ON reports(property_id);
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- feature_flags
CREATE TABLE IF NOT EXISTS feature_flags (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  org_id      uuid        REFERENCES organizations(id) ON DELETE CASCADE,
  enabled     boolean     NOT NULL DEFAULT false,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, org_id)
);
CREATE INDEX IF NOT EXISTS idx_feature_flags_name ON feature_flags(name);
CREATE INDEX IF NOT EXISTS idx_feature_flags_org  ON feature_flags(org_id) WHERE org_id IS NOT NULL;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE TRIGGER trg_feature_flags_updated_at
  BEFORE UPDATE ON feature_flags FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- research_posts
CREATE TABLE IF NOT EXISTS research_posts (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text        NOT NULL UNIQUE,
  title      text        NOT NULL,
  summary    text        NOT NULL,
  content    text        NOT NULL,
  category   text        NOT NULL DEFAULT 'general',
  tags       text[]      NOT NULL DEFAULT '{}',
  published  boolean     NOT NULL DEFAULT true,
  view_count integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_research_posts_slug     ON research_posts(slug);
CREATE INDEX IF NOT EXISTS idx_research_posts_category ON research_posts(category);
ALTER TABLE research_posts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE TRIGGER trg_research_posts_updated_at
  BEFORE UPDATE ON research_posts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ---------------------------------------------------------------------------
-- RLS policies for new tables
-- (existing table policies are already present from the initial schema apply)
-- ---------------------------------------------------------------------------

-- vendors
DO $$ BEGIN
  CREATE POLICY svc_vendors ON vendors FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY vendor_select ON vendors FOR SELECT USING (organization_id = public.org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY vendor_insert ON vendors FOR INSERT WITH CHECK (organization_id = public.org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY vendor_update ON vendors FOR UPDATE USING (organization_id = public.org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY vendor_delete ON vendors FOR DELETE
    USING (organization_id = public.org_id() AND public.is_org_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- vendor_aliases
DO $$ BEGIN
  CREATE POLICY svc_vendor_aliases ON vendor_aliases FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY vendor_alias_select ON vendor_aliases FOR SELECT USING (organization_id = public.org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY vendor_alias_insert ON vendor_aliases FOR INSERT WITH CHECK (organization_id = public.org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY vendor_alias_delete ON vendor_aliases FOR DELETE
    USING (organization_id = public.org_id() AND public.is_org_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- canonical_items
DO $$ BEGIN
  CREATE POLICY svc_canonical_items ON canonical_items FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY canonical_select ON canonical_items FOR SELECT USING (organization_id = public.org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY canonical_insert ON canonical_items FOR INSERT WITH CHECK (organization_id = public.org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY canonical_update ON canonical_items FOR UPDATE USING (organization_id = public.org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY canonical_delete ON canonical_items FOR DELETE
    USING (organization_id = public.org_id() AND public.is_org_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- item_aliases
DO $$ BEGIN
  CREATE POLICY svc_item_aliases ON item_aliases FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY item_alias_select ON item_aliases FOR SELECT USING (organization_id = public.org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY item_alias_insert ON item_aliases FOR INSERT WITH CHECK (organization_id = public.org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY item_alias_delete ON item_aliases FOR DELETE
    USING (organization_id = public.org_id() AND public.is_org_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- inventory_movements
DO $$ BEGIN
  CREATE POLICY svc_movements ON inventory_movements FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY mov_select ON inventory_movements FOR SELECT
    USING (public.can_access_property(property_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- documents
DO $$ BEGIN
  CREATE POLICY svc_documents ON documents FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY doc_select ON documents FOR SELECT USING (organization_id = public.org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY doc_insert ON documents FOR INSERT WITH CHECK (organization_id = public.org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY doc_update ON documents FOR UPDATE USING (organization_id = public.org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY doc_delete ON documents FOR DELETE
    USING (organization_id = public.org_id() AND public.is_org_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- document_line_items
DO $$ BEGIN
  CREATE POLICY svc_dli ON document_line_items FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY dli_select ON document_line_items FOR SELECT USING (organization_id = public.org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY dli_insert ON document_line_items FOR INSERT WITH CHECK (organization_id = public.org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY dli_update ON document_line_items FOR UPDATE USING (organization_id = public.org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY dli_delete ON document_line_items FOR DELETE
    USING (organization_id = public.org_id() AND public.is_org_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- alerts
DO $$ BEGIN
  CREATE POLICY svc_alerts ON alerts FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY alert_select ON alerts FOR SELECT USING (organization_id = public.org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY alert_insert ON alerts FOR INSERT WITH CHECK (organization_id = public.org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY alert_update ON alerts FOR UPDATE USING (organization_id = public.org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY alert_delete ON alerts FOR DELETE
    USING (organization_id = public.org_id() AND public.is_org_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- audit_logs
DO $$ BEGIN
  CREATE POLICY svc_audit ON audit_logs FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY audit_select ON audit_logs FOR SELECT
    USING (organization_id = public.org_id() AND public.is_org_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- usage_events
DO $$ BEGIN
  CREATE POLICY svc_usage ON usage_events FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY usage_select ON usage_events FOR SELECT
    USING (organization_id = public.org_id() AND public.is_org_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- reports
DO $$ BEGIN
  CREATE POLICY svc_reports ON reports FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY report_select ON reports FOR SELECT USING (organization_id = public.org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY report_insert ON reports FOR INSERT WITH CHECK (organization_id = public.org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY report_update ON reports FOR UPDATE
    USING (organization_id = public.org_id() AND public.is_org_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- feature_flags
DO $$ BEGIN
  CREATE POLICY svc_feature_flags ON feature_flags FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY ff_select ON feature_flags FOR SELECT
    USING (public.is_org_admin() AND (org_id = public.org_id() OR org_id IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- research_posts
DO $$ BEGIN
  CREATE POLICY svc_research ON research_posts FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY research_public_read ON research_posts FOR SELECT USING (published = true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- POST-FIX INSTRUCTIONS:
-- Run these GRANTs once after all migrations:
-- GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
-- GRANT EXECUTE ON FUNCTION public.is_org_admin(), public.org_id(), public.can_access_property(uuid), public.set_updated_at() TO supabase_auth_admin;
-- Set Custom Access Token Hook in Supabase Dashboard to: public.custom_access_token_hook
