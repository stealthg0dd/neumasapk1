-- FIXED: Auth schema permission error resolved (42501)
-- All helper functions moved to public schema with SECURITY DEFINER
-- Compatible with Supabase 2026 RLS + JWT custom claims hook

-- =============================================================================
-- Migration 0004 — Vendors and Vendor Aliases
-- =============================================================================
-- Adds vendor registry and raw-to-normalized alias mapping.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- vendors
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  normalized_name text NOT NULL,
  contact_info    jsonb NOT NULL DEFAULT '{}',
  notes           text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_vendors_org  ON vendors(org_id);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendors_select ON vendors FOR SELECT
  USING (org_id = public.org_id());
CREATE POLICY vendors_insert ON vendors FOR INSERT
  WITH CHECK (org_id = public.org_id());
CREATE POLICY vendors_update ON vendors FOR UPDATE
  USING (org_id = public.org_id());

DO $$ BEGIN
  CREATE TRIGGER trg_vendors_updated_at
    BEFORE UPDATE ON vendors
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- vendor_aliases  (raw name → vendor mapping)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_aliases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  raw_name    text NOT NULL,
  -- match metadata
  match_type  text NOT NULL DEFAULT 'manual', -- manual | fuzzy | exact
  confidence  numeric(5,4),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, raw_name)
);

CREATE INDEX IF NOT EXISTS idx_vendor_aliases_vendor ON vendor_aliases(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_aliases_org    ON vendor_aliases(org_id);

ALTER TABLE vendor_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_aliases_select ON vendor_aliases FOR SELECT
  USING (org_id = public.org_id());
CREATE POLICY vendor_aliases_insert ON vendor_aliases FOR INSERT
  WITH CHECK (org_id = public.org_id());

-- Add FK from documents to vendors (deferred — vendors table now exists)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES vendors(id);
ALTER TABLE document_line_items ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES vendors(id);

-- POST-FIX INSTRUCTIONS:
-- Run these GRANTs once after all migrations:
-- GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
-- GRANT EXECUTE ON FUNCTION public.is_org_admin(), public.org_id(), public.can_access_property(uuid), public.set_updated_at() TO supabase_auth_admin;
-- Set Custom Access Token Hook in Supabase Dashboard to: public.custom_access_token_hook
