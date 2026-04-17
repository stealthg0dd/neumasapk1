-- =============================================================================
-- FIXED SCHEMA - All functions moved to public schema - No more auth schema
-- permission errors (42501). Supabase best practice 2026.
-- =============================================================================
--
-- Neumas -- Consolidated Canonical Supabase Schema
-- =============================================================================
-- FIX SUMMARY:
--   • is_org_admin(), org_id(), can_access_property(), set_updated_at() moved
--     from auth.* to public.* with SECURITY DEFINER + SET search_path = public
--   • custom_access_token_hook() uncommented and live in public schema
--   • All RLS policies updated to call public.* helpers
--   • Explicit GRANTs for authenticated/anon on helper functions
--   • GRANT EXECUTE on hook to supabase_auth_admin; REVOKE from anon/authenticated
-- =============================================================================
--
-- CANONICAL SOURCE OF TRUTH: this file (supabase/schema.sql)
-- LEGACY BOOTSTRAP:           setup_schema.sql -- kept for reference ONLY.
--                             Do NOT run setup_schema.sql on any live database.
-- INCREMENTAL MIGRATIONS:     supabase/migrations/ -- for existing databases.
--
-- HOW TO APPLY
--   Fresh database:     Paste into Supabase SQL Editor or run `supabase db push`.
--   Existing database:  Run supabase/migrations/20260417_operational_model.sql
--                       (adds new tables + missing columns; fully idempotent).
--
-- MULTI-TENANCY MODEL
--   Every row is owned by an organization (organization_id).
--   Property-scoped rows also carry property_id.
--   RLS uses JWT custom claims injected by the Supabase Auth Hook:
--     auth.jwt() ->> 'org_id'         -> UUID string
--     auth.jwt() -> 'property_ids'    -> JSON array of UUID strings
--     auth.jwt() ->> 'role'           -> 'admin' | 'staff' | 'resident'
--   Service role (Celery, internal API) bypasses all RLS.
--
-- TABLE TAXONOMY
--   Tenant model:    organizations, properties, users
--   Product model:   inventory_categories, inventory_items, inventory_movements,
--                    scans, documents, document_line_items,
--                    vendors, vendor_aliases, canonical_items, item_aliases,
--                    consumption_patterns, predictions,
--                    shopping_lists, shopping_list_items
--   Operational:     alerts, audit_logs, usage_events, reports, feature_flags
--   Public content:  research_posts
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- trigram indexes for fuzzy search


-- =============================================================================
-- HELPER FUNCTIONS  (public schema, SECURITY DEFINER)
-- NOTE: These are intentionally in the public schema — NOT the auth schema.
--       Supabase restricts CREATE FUNCTION in the auth schema (error 42501).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT (auth.jwt() ->> 'role') = 'admin';
$$;

CREATE OR REPLACE FUNCTION public.org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT (auth.jwt() ->> 'org_id')::uuid;
$$;

-- Does the calling user have access to a given property?
-- Admins: any property in their org (DB check). Staff/residents: JWT property_ids only.
CREATE OR REPLACE FUNCTION public.can_access_property(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT CASE
    WHEN (auth.jwt() ->> 'role') = 'admin'
      THEN EXISTS (
        SELECT 1 FROM public.properties
        WHERE id = p_id AND organization_id = (auth.jwt() ->> 'org_id')::uuid
      )
    ELSE p_id::text = ANY(
      ARRAY(SELECT jsonb_array_elements_text(
        COALESCE(auth.jwt() -> 'property_ids', '[]'::jsonb)
      ))
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Grant helper functions to authenticated and anon so RLS policies can invoke them
GRANT EXECUTE ON FUNCTION public.is_org_admin()           TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.org_id()                 TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_access_property(uuid) TO authenticated, anon;


-- =============================================================================
-- TENANT MODEL
-- =============================================================================

-- ---------------------------------------------------------------------------
-- organizations
-- Root tenant. plan: free | pilot | pro | enterprise
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organizations (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text        NOT NULL,
  slug                text        NOT NULL UNIQUE,
  plan                text        NOT NULL DEFAULT 'free',
  subscription_status text        NOT NULL DEFAULT 'active',
  max_properties      integer     NOT NULL DEFAULT 1,
  max_users           integer     NOT NULL DEFAULT 5,
  settings            jsonb       NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN organizations.plan IS
  'Billing tier: free(50docs/2users/1prop) | pilot(500/10/5) | pro(5000/25/20) | enterprise(unlimited).';

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- properties
-- Outlets / locations within an org.
-- type: restaurant | cafe | hotel | catering | bar | other
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS properties (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  type            text        NOT NULL DEFAULT 'restaurant',
  address         text,
  timezone        text        NOT NULL DEFAULT 'UTC',
  currency        text        NOT NULL DEFAULT 'USD',
  settings        jsonb       NOT NULL DEFAULT '{}',
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_properties_org  ON properties(organization_id);
CREATE INDEX IF NOT EXISTS idx_properties_type ON properties(type);
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- users  (linked 1:1 with auth.users via auth_id)
-- role: admin | staff | resident
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id         uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           text        NOT NULL UNIQUE,
  full_name       text,
  role            text        NOT NULL DEFAULT 'staff',
  permissions     jsonb       NOT NULL DEFAULT '{}',
  preferences     jsonb       NOT NULL DEFAULT '{}',
  avatar_url      text,
  is_active       boolean     NOT NULL DEFAULT true,
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_org    ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_authid ON users(auth_id);
CREATE INDEX IF NOT EXISTS idx_users_email  ON users(email);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- PRODUCT MODEL -- Core procurement intelligence
-- =============================================================================

-- ---------------------------------------------------------------------------
-- inventory_categories  (org-scoped hierarchy; NULL parent_id = top level)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inventory_categories (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id       uuid    REFERENCES inventory_categories(id) ON DELETE SET NULL,
  name            text    NOT NULL,
  description     text,
  icon            text,
  sort_order      integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, parent_id, name)
);

CREATE INDEX IF NOT EXISTS idx_categories_org ON inventory_categories(organization_id);
ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- inventory_items
-- SNAPSHOT TABLE: current state. History lives in inventory_movements.
-- organization_id denormalized for fast org-wide queries.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inventory_items (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid          NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  organization_id uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id     uuid          REFERENCES inventory_categories(id) ON DELETE SET NULL,
  name            text          NOT NULL,
  description     text,
  sku             text,
  barcode         text,
  unit            text          NOT NULL DEFAULT 'unit',
  quantity        numeric(12,3) NOT NULL DEFAULT 0,
  min_quantity    numeric(12,3) NOT NULL DEFAULT 0,
  max_quantity    numeric(12,3),
  reorder_point   numeric(12,3),
  cost_per_unit   numeric(10,4),
  currency        text          NOT NULL DEFAULT 'USD',
  supplier_info   jsonb         NOT NULL DEFAULT '{}',
  metadata        jsonb         NOT NULL DEFAULT '{}',
  tags            text[]        NOT NULL DEFAULT '{}',
  is_active       boolean       NOT NULL DEFAULT true,
  last_scanned_at timestamptz,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT chk_inventory_quantity_non_negative CHECK (quantity >= 0)
);

COMMENT ON TABLE inventory_items IS
  'Snapshot of current item state. For auditable history, query inventory_movements.';

CREATE INDEX IF NOT EXISTS idx_inventory_property ON inventory_items(property_id);
CREATE INDEX IF NOT EXISTS idx_inventory_org      ON inventory_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_name     ON inventory_items(property_id, name);
CREATE INDEX IF NOT EXISTS idx_inventory_barcode  ON inventory_items(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_sku      ON inventory_items(sku)     WHERE sku     IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_name_fts ON inventory_items USING gin(to_tsvector('english', name));
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- inventory_movements
-- APPEND-ONLY LEDGER: every quantity-changing event is recorded here.
-- Never UPDATE or DELETE rows. Insert correction entries instead.
-- idempotency_key prevents duplicate rows on Celery retries.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inventory_movements (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         uuid          NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  property_id     uuid          NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  organization_id uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  movement_type   text          NOT NULL,
  -- purchase | consumption | adjustment | waste | transfer | return | count
  quantity_delta  numeric(12,3) NOT NULL,   -- positive=in, negative=out
  quantity_before numeric(12,3) NOT NULL,
  quantity_after  numeric(12,3) NOT NULL,
  unit            text          NOT NULL DEFAULT 'unit',
  reference_id    uuid,          -- scan/document/shopping_list per reference_type
  reference_type  text,          -- 'scan' | 'document' | 'shopping_list' | 'manual'
  created_by_id   uuid          REFERENCES users(id) ON DELETE SET NULL,
  notes           text,
  idempotency_key text          UNIQUE,
  created_at      timestamptz   NOT NULL DEFAULT now()
  -- No updated_at: append-only
);

COMMENT ON TABLE inventory_movements IS
  'Append-only ledger. Never UPDATE or DELETE. '
  'inventory_items.quantity is the snapshot; this table is the authoritative history.';
COMMENT ON COLUMN inventory_movements.idempotency_key IS
  'SHA-256(item_id||reference_id||delta). Prevents double-writes on Celery retries.';

CREATE INDEX IF NOT EXISTS idx_movements_item     ON inventory_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_movements_property ON inventory_movements(property_id);
CREATE INDEX IF NOT EXISTS idx_movements_org      ON inventory_movements(organization_id);
CREATE INDEX IF NOT EXISTS idx_movements_type     ON inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_movements_created  ON inventory_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_ref      ON inventory_movements(reference_id) WHERE reference_id IS NOT NULL;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- scans
-- Raw upload events before document extraction.
-- organization_id denormalized for org-level aggregate queries (usage_service).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS scans (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id        uuid        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  organization_id    uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id            uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status             text        NOT NULL DEFAULT 'pending',   -- pending | processing | completed | failed
  scan_type          text        NOT NULL DEFAULT 'receipt',   -- receipt | barcode | full | partial | spot_check
  image_urls         jsonb       NOT NULL DEFAULT '[]',
  raw_results        jsonb       NOT NULL DEFAULT '{}',
  processed_results  jsonb       NOT NULL DEFAULT '{}',
  items_detected     integer     NOT NULL DEFAULT 0,
  confidence_score   numeric(5,4),
  processing_time_ms integer,
  error_message      text,
  started_at         timestamptz,
  completed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN scans.organization_id IS
  'Denormalized from properties.organization_id. Used by usage_service.get_org_summary().';

CREATE INDEX IF NOT EXISTS idx_scans_property ON scans(property_id);
CREATE INDEX IF NOT EXISTS idx_scans_org      ON scans(organization_id);
CREATE INDEX IF NOT EXISTS idx_scans_user     ON scans(user_id);
CREATE INDEX IF NOT EXISTS idx_scans_status   ON scans(status);
CREATE INDEX IF NOT EXISTS idx_scans_created  ON scans(created_at DESC);
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- vendors
-- Known suppliers. normalized_name for case-insensitive deduplication.
-- ---------------------------------------------------------------------------

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


-- ---------------------------------------------------------------------------
-- vendor_aliases
-- Maps raw OCR vendor strings to canonical vendors.
-- Upserted on (organization_id, alias_name). source: manual | llm | import
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vendor_aliases (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id       uuid        NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  alias_name      text        NOT NULL,
  source          text        NOT NULL DEFAULT 'manual',
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, alias_name)
);

COMMENT ON TABLE vendor_aliases IS
  'Maps raw OCR vendor strings to canonical vendors. Upserted on (organization_id, alias_name).';

CREATE INDEX IF NOT EXISTS idx_vendor_aliases_vendor ON vendor_aliases(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_aliases_org    ON vendor_aliases(organization_id);
CREATE INDEX IF NOT EXISTS idx_vendor_aliases_name   ON vendor_aliases(organization_id, alias_name);
ALTER TABLE vendor_aliases ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- canonical_items
-- Master item dictionary. canonical_name_tsv for full-text search.
-- Used by CanonicalItemsRepository.search() and .find_by_alias().
-- ---------------------------------------------------------------------------

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

COMMENT ON COLUMN canonical_items.canonical_name_tsv IS
  'Auto-generated. Queried via .text_search("canonical_name_tsv", q) in CanonicalItemsRepository.';

CREATE INDEX IF NOT EXISTS idx_canonical_items_org  ON canonical_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_canonical_items_tsv  ON canonical_items USING gin(canonical_name_tsv);
CREATE INDEX IF NOT EXISTS idx_canonical_items_name ON canonical_items(organization_id, canonical_name);
ALTER TABLE canonical_items ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- item_aliases
-- Maps raw OCR item strings to canonical_items.
-- Upserted on (organization_id, alias_name). confidence from LLM scoring.
-- ---------------------------------------------------------------------------

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


-- ---------------------------------------------------------------------------
-- documents
-- Normalized document records extracted from scans.
-- One scan -> zero or one document. One document -> many document_line_items.
-- raw_extraction is immutable after creation.
-- vendor_id is NULL until alias-resolution step completes.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS documents (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id        uuid          REFERENCES properties(id) ON DELETE CASCADE,
  organization_id    uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scan_id            uuid          REFERENCES scans(id) ON DELETE SET NULL,
  document_type      text          NOT NULL DEFAULT 'receipt',
  -- receipt | invoice | delivery_note | credit_note | other
  status             text          NOT NULL DEFAULT 'pending',
  -- pending | processing | review | approved | rejected
  raw_extraction     jsonb         NOT NULL DEFAULT '{}',  -- verbatim LLM output; never modified
  normalized_data    jsonb         NOT NULL DEFAULT '{}',  -- updated by pipeline
  raw_vendor_name    text,
  vendor_id          uuid,          -- resolved FK; NULL until alias-resolution runs
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

COMMENT ON COLUMN documents.raw_extraction IS
  'Verbatim JSON from vision/LLM pipeline. Treat as immutable once written.';
COMMENT ON COLUMN documents.vendor_id IS
  'Set by VendorsRepository.find_by_alias(). NULL until vendor matching step runs.';

ALTER TABLE documents
  ADD CONSTRAINT fk_documents_vendor
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_org      ON documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_property ON documents(property_id);
CREATE INDEX IF NOT EXISTS idx_documents_scan     ON documents(scan_id);
CREATE INDEX IF NOT EXISTS idx_documents_status   ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_vendor   ON documents(vendor_id);
CREATE INDEX IF NOT EXISTS idx_documents_created  ON documents(created_at DESC);
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- document_line_items
-- Individual line items extracted from a document.
-- raw_* fields are immutable after creation.
-- normalized_* and resolution FKs are set by the matching pipeline.
-- ---------------------------------------------------------------------------

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
  -- No updated_at: raw fields immutable; normalized fields set once by pipeline
);

COMMENT ON TABLE document_line_items IS
  'raw_* fields immutable post-creation. normalized_* set once by matching pipeline.';

CREATE INDEX IF NOT EXISTS idx_dli_document  ON document_line_items(document_id);
CREATE INDEX IF NOT EXISTS idx_dli_org       ON document_line_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_dli_property  ON document_line_items(property_id);
CREATE INDEX IF NOT EXISTS idx_dli_canonical ON document_line_items(canonical_item_id);
CREATE INDEX IF NOT EXISTS idx_dli_vendor    ON document_line_items(vendor_id);
ALTER TABLE document_line_items ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- consumption_patterns
-- AI-analyzed usage patterns per item.
-- UNIQUE (item_id, pattern_type): one pattern type per item.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS consumption_patterns (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         uuid          NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  property_id     uuid          NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  organization_id uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pattern_type    text          NOT NULL,  -- daily | weekly | seasonal | event
  pattern_data    jsonb         NOT NULL,
  confidence      numeric(5,4)  NOT NULL DEFAULT 0,
  sample_size     integer       NOT NULL DEFAULT 0,
  valid_from      timestamptz,
  valid_until     timestamptz,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (item_id, pattern_type)
);

CREATE INDEX IF NOT EXISTS idx_patterns_item     ON consumption_patterns(item_id);
CREATE INDEX IF NOT EXISTS idx_patterns_property ON consumption_patterns(property_id);
CREATE INDEX IF NOT EXISTS idx_patterns_org      ON consumption_patterns(organization_id);
ALTER TABLE consumption_patterns ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- predictions
-- Demand/stockout/reorder forecasts.
-- actual_value retroactively populated; accuracy_score computed by Celery.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS predictions (
  id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id              uuid          NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  organization_id          uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id                  uuid          REFERENCES inventory_items(id) ON DELETE SET NULL,
  prediction_type          text          NOT NULL,   -- demand | stockout | reorder
  prediction_date          timestamptz   NOT NULL,
  predicted_value          numeric(12,3) NOT NULL,
  confidence_interval_low  numeric(12,3),
  confidence_interval_high numeric(12,3),
  confidence               numeric(5,4)  NOT NULL DEFAULT 0,
  model_version            text,
  features_used            jsonb         NOT NULL DEFAULT '{}',
  actual_value             numeric(12,3),   -- NULL until ground-truth observed
  accuracy_score           numeric(5,4),    -- NULL until actual_value is set
  days_until_stockout      integer,
  stockout_probability     numeric(5,4),
  stockout_risk_level      text,            -- low | medium | high | critical
  expires_at               timestamptz,
  created_at               timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON COLUMN predictions.actual_value IS
  'Retroactively set when actual consumption is observed. Used for accuracy_score and model retraining.';

CREATE INDEX IF NOT EXISTS idx_predictions_property ON predictions(property_id);
CREATE INDEX IF NOT EXISTS idx_predictions_org      ON predictions(organization_id);
CREATE INDEX IF NOT EXISTS idx_predictions_item     ON predictions(item_id);
CREATE INDEX IF NOT EXISTS idx_predictions_date     ON predictions(prediction_date);
CREATE INDEX IF NOT EXISTS idx_predictions_type     ON predictions(prediction_type);
CREATE INDEX IF NOT EXISTS idx_predictions_risk     ON predictions(stockout_risk_level) WHERE stockout_risk_level IS NOT NULL;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- shopping_lists
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS shopping_lists (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id          uuid          NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  organization_id      uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_id        uuid          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name                 text          NOT NULL,
  status               text          NOT NULL DEFAULT 'draft',
  -- draft | active | approved | ordered | received
  total_estimated_cost numeric(12,4),
  total_actual_cost    numeric(12,4),
  budget_limit         numeric(12,4),
  currency             text          NOT NULL DEFAULT 'USD',
  notes                text,
  generation_params    jsonb         NOT NULL DEFAULT '{}',
  approved_at          timestamptz,
  approved_by_id       uuid          REFERENCES users(id) ON DELETE SET NULL,
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopping_lists_property ON shopping_lists(property_id);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_org      ON shopping_lists(organization_id);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_status   ON shopping_lists(organization_id, status);
ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- shopping_list_items
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS shopping_list_items (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  shopping_list_id  uuid          NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  inventory_item_id uuid          REFERENCES inventory_items(id) ON DELETE SET NULL,
  prediction_id     uuid          REFERENCES predictions(id) ON DELETE SET NULL,
  name              text          NOT NULL,
  quantity          numeric(12,3) NOT NULL,
  unit              text          NOT NULL DEFAULT 'unit',
  estimated_price   numeric(12,4),
  actual_price      numeric(12,4),
  currency          text          NOT NULL DEFAULT 'USD',
  priority          text          NOT NULL DEFAULT 'normal',  -- critical | high | normal | low
  reason            text,
  source            text          DEFAULT 'manual',  -- manual | prediction | low_stock | ai_suggestion
  is_purchased      boolean       NOT NULL DEFAULT false,
  purchased_at      timestamptz,
  created_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sli_list ON shopping_list_items(shopping_list_id);
CREATE INDEX IF NOT EXISTS idx_sli_item ON shopping_list_items(inventory_item_id);
ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- OPERATIONAL MODEL -- Alerts, audit, usage, reports, feature flags
-- =============================================================================

-- ---------------------------------------------------------------------------
-- alerts
-- State: open -> acknowledged -> resolved | dismissed
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS alerts (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id        uuid        REFERENCES properties(id) ON DELETE CASCADE,
  item_id            uuid        REFERENCES inventory_items(id) ON DELETE SET NULL,
  alert_type         text        NOT NULL,  -- low_stock | stockout | price_spike | unusual_consumption | expiry | system
  severity           text        NOT NULL,  -- info | warning | critical
  state              text        NOT NULL DEFAULT 'open',  -- open | acknowledged | resolved | dismissed
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


-- ---------------------------------------------------------------------------
-- audit_logs
-- IMMUTABLE APPEND-ONLY. actor_id is NOT a FK (allows service-account entries).
-- No INSERT/UPDATE/DELETE policies exist for non-service-role callers.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_logs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id     uuid        REFERENCES properties(id) ON DELETE SET NULL,
  actor_id        uuid,        -- intentionally NOT a FK; allows service-account entries
  actor_role      text,
  action          text        NOT NULL,
  resource_type   text        NOT NULL,
  resource_id     text,
  before_state    jsonb,       -- NULL for CREATE actions
  after_state     jsonb,
  metadata        jsonb       NOT NULL DEFAULT '{}',
  ip_address      inet,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now()
  -- No updated_at: immutable
);

COMMENT ON TABLE audit_logs IS
  'Append-only. No UPDATE/DELETE policies for non-service-role. actor_id is not a FK.';
COMMENT ON COLUMN audit_logs.before_state IS
  'NULL for CREATE. Populated for UPDATE/DELETE to enable point-in-time reconstruction.';

CREATE INDEX IF NOT EXISTS idx_audit_org      ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor    ON audit_logs(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_action   ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_created  ON audit_logs(created_at DESC);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- usage_events  (append-only; service-role writes; admin reads)
-- Table name: usage_events (the repository class is UsageMeteringRepository).
-- ---------------------------------------------------------------------------

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
  -- No updated_at: append-only
);

COMMENT ON TABLE usage_events IS 'Append-only cost telemetry. Written by service-role only.';

CREATE INDEX IF NOT EXISTS idx_usage_org     ON usage_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_usage_feature ON usage_events(organization_id, feature);
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_user    ON usage_events(user_id) WHERE user_id IS NOT NULL;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- reports  (async generation jobs; params_hash enables deduplication)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reports (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id        uuid        REFERENCES properties(id) ON DELETE CASCADE,
  requested_by_id    uuid        REFERENCES users(id) ON DELETE SET NULL,
  report_type        text        NOT NULL,
  status             text        NOT NULL DEFAULT 'queued',  -- queued | generating | ready | failed
  params             jsonb       NOT NULL DEFAULT '{}',
  params_hash        text,        -- SHA-256 of canonicalized params; for dedup
  result             jsonb,
  download_url       text,
  error_message      text,
  processing_time_ms integer,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN reports.params_hash IS
  'SHA-256(canonical params JSON). ReportsRepository.find_existing() avoids redundant generation.';

CREATE INDEX IF NOT EXISTS idx_reports_org      ON reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_reports_status   ON reports(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_reports_hash     ON reports(organization_id, params_hash) WHERE params_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_property ON reports(property_id);
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- feature_flags
-- NULL org_id = global default. Org rows override global.
-- Upserted on (name, org_id) by admin API.
-- Query pattern: .or("org_id.eq.{id},org_id.is.null")
-- ---------------------------------------------------------------------------

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

COMMENT ON COLUMN feature_flags.org_id IS
  'NULL = global default. Org rows override. Query: .or("org_id.eq.{org},org_id.is.null").';

CREATE INDEX IF NOT EXISTS idx_feature_flags_name ON feature_flags(name);
CREATE INDEX IF NOT EXISTS idx_feature_flags_org  ON feature_flags(org_id) WHERE org_id IS NOT NULL;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- PUBLIC CONTENT
-- =============================================================================

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


-- =============================================================================
-- TRIGGERS  (updated_at)
-- =============================================================================

DO $$ BEGIN CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TRIGGER trg_properties_updated_at
  BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TRIGGER trg_inventory_items_updated_at
  BEFORE UPDATE ON inventory_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TRIGGER trg_consumption_patterns_updated_at
  BEFORE UPDATE ON consumption_patterns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TRIGGER trg_shopping_lists_updated_at
  BEFORE UPDATE ON shopping_lists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TRIGGER trg_vendors_updated_at
  BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TRIGGER trg_canonical_items_updated_at
  BEFORE UPDATE ON canonical_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TRIGGER trg_alerts_updated_at
  BEFORE UPDATE ON alerts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TRIGGER trg_feature_flags_updated_at
  BEFORE UPDATE ON feature_flags FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TRIGGER trg_research_posts_updated_at
  BEFORE UPDATE ON research_posts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- organizations
CREATE POLICY svc_organizations ON organizations FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY org_select ON organizations FOR SELECT USING (id = public.org_id());
CREATE POLICY org_update ON organizations FOR UPDATE
  USING (id = public.org_id() AND public.is_org_admin());

-- properties
CREATE POLICY svc_properties ON properties FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY prop_select ON properties FOR SELECT USING (organization_id = public.org_id());
CREATE POLICY prop_insert ON properties FOR INSERT
  WITH CHECK (organization_id = public.org_id() AND public.is_org_admin());
CREATE POLICY prop_update ON properties FOR UPDATE
  USING (organization_id = public.org_id() AND public.is_org_admin());
CREATE POLICY prop_delete ON properties FOR DELETE
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- users  (admins update anyone; staff update own row)
CREATE POLICY svc_users ON users FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY user_select ON users FOR SELECT USING (organization_id = public.org_id());
CREATE POLICY user_insert ON users FOR INSERT
  WITH CHECK (organization_id = public.org_id() AND public.is_org_admin());
CREATE POLICY user_update ON users FOR UPDATE
  USING (organization_id = public.org_id() AND (public.is_org_admin() OR auth_id = auth.uid()));
CREATE POLICY user_delete ON users FOR DELETE
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- inventory_categories
CREATE POLICY svc_categories ON inventory_categories FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY cat_select ON inventory_categories FOR SELECT USING (organization_id = public.org_id());
CREATE POLICY cat_insert ON inventory_categories FOR INSERT WITH CHECK (organization_id = public.org_id());
CREATE POLICY cat_update ON inventory_categories FOR UPDATE USING (organization_id = public.org_id());
CREATE POLICY cat_delete ON inventory_categories FOR DELETE
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- inventory_items  (property-scoped; prefer soft-delete via is_active=false)
CREATE POLICY svc_inventory ON inventory_items FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY inv_select ON inventory_items FOR SELECT USING (public.can_access_property(property_id));
CREATE POLICY inv_insert ON inventory_items FOR INSERT WITH CHECK (public.can_access_property(property_id));
CREATE POLICY inv_update ON inventory_items FOR UPDATE USING (public.can_access_property(property_id));
CREATE POLICY inv_delete ON inventory_items FOR DELETE
  USING (public.can_access_property(property_id) AND public.is_org_admin());

-- inventory_movements  (users read; no client writes -- service role only)
CREATE POLICY svc_movements ON inventory_movements FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY mov_select ON inventory_movements FOR SELECT
  USING (public.can_access_property(property_id));

-- scans
CREATE POLICY svc_scans ON scans FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY scan_select ON scans FOR SELECT USING (public.can_access_property(property_id));
CREATE POLICY scan_insert ON scans FOR INSERT WITH CHECK (public.can_access_property(property_id));
CREATE POLICY scan_update ON scans FOR UPDATE USING (public.can_access_property(property_id));
CREATE POLICY scan_delete ON scans FOR DELETE
  USING (public.can_access_property(property_id)
    AND (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()) OR public.is_org_admin()));

-- vendors
CREATE POLICY svc_vendors ON vendors FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY vendor_select ON vendors FOR SELECT USING (organization_id = public.org_id());
CREATE POLICY vendor_insert ON vendors FOR INSERT WITH CHECK (organization_id = public.org_id());
CREATE POLICY vendor_update ON vendors FOR UPDATE USING (organization_id = public.org_id());
CREATE POLICY vendor_delete ON vendors FOR DELETE
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- vendor_aliases
CREATE POLICY svc_vendor_aliases ON vendor_aliases FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY vendor_alias_select ON vendor_aliases FOR SELECT USING (organization_id = public.org_id());
CREATE POLICY vendor_alias_insert ON vendor_aliases FOR INSERT WITH CHECK (organization_id = public.org_id());
CREATE POLICY vendor_alias_delete ON vendor_aliases FOR DELETE
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- canonical_items
CREATE POLICY svc_canonical_items ON canonical_items FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY canonical_select ON canonical_items FOR SELECT USING (organization_id = public.org_id());
CREATE POLICY canonical_insert ON canonical_items FOR INSERT WITH CHECK (organization_id = public.org_id());
CREATE POLICY canonical_update ON canonical_items FOR UPDATE USING (organization_id = public.org_id());
CREATE POLICY canonical_delete ON canonical_items FOR DELETE
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- item_aliases
CREATE POLICY svc_item_aliases ON item_aliases FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY item_alias_select ON item_aliases FOR SELECT USING (organization_id = public.org_id());
CREATE POLICY item_alias_insert ON item_aliases FOR INSERT WITH CHECK (organization_id = public.org_id());
CREATE POLICY item_alias_delete ON item_aliases FOR DELETE
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- documents  (financial trail; hard delete admin-only)
CREATE POLICY svc_documents ON documents FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY doc_select ON documents FOR SELECT USING (organization_id = public.org_id());
CREATE POLICY doc_insert ON documents FOR INSERT WITH CHECK (organization_id = public.org_id());
CREATE POLICY doc_update ON documents FOR UPDATE USING (organization_id = public.org_id());
CREATE POLICY doc_delete ON documents FOR DELETE
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- document_line_items
CREATE POLICY svc_dli ON document_line_items FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY dli_select ON document_line_items FOR SELECT USING (organization_id = public.org_id());
CREATE POLICY dli_insert ON document_line_items FOR INSERT WITH CHECK (organization_id = public.org_id());
CREATE POLICY dli_update ON document_line_items FOR UPDATE USING (organization_id = public.org_id());
CREATE POLICY dli_delete ON document_line_items FOR DELETE
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- consumption_patterns
CREATE POLICY svc_patterns ON consumption_patterns FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY pattern_select ON consumption_patterns FOR SELECT
  USING (public.can_access_property(property_id));
CREATE POLICY pattern_insert ON consumption_patterns FOR INSERT
  WITH CHECK (public.can_access_property(property_id));
CREATE POLICY pattern_update ON consumption_patterns FOR UPDATE
  USING (public.can_access_property(property_id));

-- predictions
CREATE POLICY svc_predictions ON predictions FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY pred_select ON predictions FOR SELECT USING (public.can_access_property(property_id));
CREATE POLICY pred_insert ON predictions FOR INSERT WITH CHECK (public.can_access_property(property_id));
CREATE POLICY pred_update ON predictions FOR UPDATE USING (public.can_access_property(property_id));

-- shopping_lists  (admin-only delete: approved procurement records)
CREATE POLICY svc_shopping_lists ON shopping_lists FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY sl_select ON shopping_lists FOR SELECT USING (public.can_access_property(property_id));
CREATE POLICY sl_insert ON shopping_lists FOR INSERT WITH CHECK (public.can_access_property(property_id));
CREATE POLICY sl_update ON shopping_lists FOR UPDATE USING (public.can_access_property(property_id));
CREATE POLICY sl_delete ON shopping_lists FOR DELETE
  USING (public.can_access_property(property_id) AND public.is_org_admin());

-- shopping_list_items  (access derived from parent list)
CREATE POLICY svc_sli ON shopping_list_items FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY sli_select ON shopping_list_items FOR SELECT
  USING (shopping_list_id IN (SELECT id FROM shopping_lists WHERE public.can_access_property(property_id)));
CREATE POLICY sli_insert ON shopping_list_items FOR INSERT
  WITH CHECK (shopping_list_id IN (SELECT id FROM shopping_lists WHERE public.can_access_property(property_id)));
CREATE POLICY sli_update ON shopping_list_items FOR UPDATE
  USING (shopping_list_id IN (SELECT id FROM shopping_lists WHERE public.can_access_property(property_id)));
CREATE POLICY sli_delete ON shopping_list_items FOR DELETE
  USING (shopping_list_id IN (SELECT id FROM shopping_lists WHERE public.can_access_property(property_id)));

-- alerts
CREATE POLICY svc_alerts ON alerts FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY alert_select ON alerts FOR SELECT USING (organization_id = public.org_id());
CREATE POLICY alert_insert ON alerts FOR INSERT WITH CHECK (organization_id = public.org_id());
CREATE POLICY alert_update ON alerts FOR UPDATE USING (organization_id = public.org_id());
CREATE POLICY alert_delete ON alerts FOR DELETE
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- audit_logs  (append-only; admin SELECT; no client writes)
CREATE POLICY svc_audit ON audit_logs FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY audit_select ON audit_logs FOR SELECT
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- usage_events  (service-role writes; admin reads)
CREATE POLICY svc_usage ON usage_events FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY usage_select ON usage_events FOR SELECT
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- reports
CREATE POLICY svc_reports ON reports FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY report_select ON reports FOR SELECT USING (organization_id = public.org_id());
CREATE POLICY report_insert ON reports FOR INSERT WITH CHECK (organization_id = public.org_id());
CREATE POLICY report_update ON reports FOR UPDATE
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- feature_flags  (admin reads: own org + global; service-role writes)
CREATE POLICY svc_feature_flags ON feature_flags FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY ff_select ON feature_flags FOR SELECT
  USING (public.is_org_admin() AND (org_id = public.org_id() OR org_id IS NULL));

-- research_posts  (public read; service-role write)
CREATE POLICY svc_research ON research_posts FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY research_public_read ON research_posts FOR SELECT USING (published = true);


-- =============================================================================
-- STORAGE
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('scans', 'scans', FALSE, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/jpg'])
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "storage_service_role_all" ON storage.objects FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "storage_users_upload_receipts" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'scans' AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'org_id'));

CREATE POLICY "storage_users_read_receipts" ON storage.objects FOR SELECT
  USING (bucket_id = 'scans' AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'org_id'));


-- =============================================================================
-- JWT CUSTOM CLAIMS HOOK
-- =============================================================================
-- After running this schema:
--   Dashboard → Authentication → Hooks → Custom Access Token Hook
--   Set function to: public.custom_access_token_hook
-- =============================================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  claims   jsonb;
  usr      record;
  prop_ids text[];
BEGIN
  SELECT u.organization_id, u.role INTO usr
    FROM public.users u
   WHERE u.auth_id = (event->>'user_id')::uuid;

  IF FOUND THEN
    SELECT ARRAY(
      SELECT p.id::text FROM public.properties p
       WHERE p.organization_id = usr.organization_id
         AND p.is_active = true
    ) INTO prop_ids;

    claims := event->'claims';
    claims := jsonb_set(claims, '{org_id}',       to_jsonb(usr.organization_id::text));
    claims := jsonb_set(claims, '{role}',         to_jsonb(usr.role));
    claims := jsonb_set(claims, '{property_ids}', to_jsonb(prop_ids));
    RETURN jsonb_set(event, '{claims}', claims);
  END IF;

  RETURN event;
END;
$$;

-- Required: supabase_auth_admin must be able to invoke the hook
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
-- Security: regular client roles must NOT be able to call the hook directly
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon;


-- =============================================================================
-- IMPLEMENTATION NOTES
-- =============================================================================
--
-- 1. HOW TO APPLY
--    Fresh database:
--      Paste this entire file into Supabase SQL Editor and click Run.
--      Or: supabase db push (with supabase CLI linked to your project).
--    Existing database:
--      Run supabase/migrations/20260417_operational_model.sql first,
--      then re-run only the HELPER FUNCTIONS + JWT HOOK sections of this file
--      to update the function definitions in place.
--
-- 2. ENABLE THE CUSTOM ACCESS TOKEN HOOK
--    After applying the schema:
--      a. Go to Supabase Dashboard → Authentication → Hooks
--      b. Find "Custom Access Token Hook"
--      c. Toggle it ON
--      d. Select function: public.custom_access_token_hook
--      e. Save. All new JWTs will now include org_id, role, property_ids claims.
--
-- 3. VERIFICATION QUERIES
--    -- Confirm functions are in public schema:
--    SELECT routine_schema, routine_name, security_type
--      FROM information_schema.routines
--     WHERE routine_schema = 'public'
--       AND routine_name IN (
--         'is_org_admin','org_id','can_access_property',
--         'set_updated_at','custom_access_token_hook'
--       );
--
--    -- Confirm 23 tables with RLS enabled:
--    SELECT tablename, rowsecurity
--      FROM pg_tables
--     WHERE schemaname = 'public'
--     ORDER BY tablename;
--
--    -- Confirm hook grant:
--    SELECT grantee, privilege_type
--      FROM information_schema.routine_privileges
--     WHERE routine_name = 'custom_access_token_hook';
-- =============================================================================
