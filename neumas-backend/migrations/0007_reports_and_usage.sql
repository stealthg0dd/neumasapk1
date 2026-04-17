-- FIXED: Auth schema permission error resolved (42501)
-- All helper functions moved to public schema with SECURITY DEFINER
-- Compatible with Supabase 2026 RLS + JWT custom claims hook

-- =============================================================================
-- Migration 0007 — Reports and Usage Metering
-- =============================================================================
-- Adds report generation metadata and usage metering events.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- report_type: weekly_summary | inventory_snapshot | vendor_comparison |
  --   consumption_analysis | forecast_accuracy
  report_type     text NOT NULL,
  status          text NOT NULL DEFAULT 'pending', -- pending | generating | completed | failed | stale
  title           text NOT NULL,
  period_start    timestamptz,
  period_end      timestamptz,
  -- generation params used (for idempotency check)
  params_hash     text,
  -- output locations
  csv_url         text,
  pdf_url         text,
  -- report data (for API delivery without file download)
  summary_data    jsonb NOT NULL DEFAULT '{}',
  error_message   text,
  generated_by_id uuid REFERENCES users(id),
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_property ON reports(property_id);
CREATE INDEX IF NOT EXISTS idx_reports_org      ON reports(org_id);
CREATE INDEX IF NOT EXISTS idx_reports_status   ON reports(property_id, status);
-- Idempotency: prevent duplicate generation for same period+type within 24h
CREATE INDEX IF NOT EXISTS idx_reports_params   ON reports(property_id, report_type, params_hash);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY reports_select ON reports FOR SELECT
  USING (org_id = public.org_id() AND public.can_access_property(property_id));
CREATE POLICY reports_insert ON reports FOR INSERT
  WITH CHECK (org_id = public.org_id() AND public.can_access_property(property_id));
CREATE POLICY reports_update ON reports FOR UPDATE
  USING (org_id = public.org_id() AND public.can_access_property(property_id));

DO $$ BEGIN
  CREATE TRIGGER trg_reports_updated_at
    BEFORE UPDATE ON reports
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- usage_events  (metering — append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id         uuid REFERENCES properties(id) ON DELETE SET NULL,
  user_id             uuid REFERENCES users(id) ON DELETE SET NULL,
  -- event_type: document_scanned | line_items_processed | report_exported |
  --   ai_operation | active_user_session
  event_type          text NOT NULL,
  -- quantity for this event (e.g. number of line items)
  quantity            integer NOT NULL DEFAULT 1,
  -- AI-specific fields (null for non-AI events)
  model_provider      text,
  model_name          text,
  input_tokens        integer,
  output_tokens       integer,
  estimated_cost_usd  numeric(10,6),
  -- reference to the operation that triggered this
  operation_id        uuid,
  operation_type      text,
  metadata            jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_org     ON usage_events(org_id);
CREATE INDEX IF NOT EXISTS idx_usage_type    ON usage_events(org_id, event_type);
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_events(created_at DESC);

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

-- Only admins can read raw usage events; others get aggregated via admin API
CREATE POLICY usage_select ON usage_events FOR SELECT
  USING (org_id = public.org_id() AND public.is_org_admin());

-- Insert via service-role only

-- POST-FIX INSTRUCTIONS:
-- Run these GRANTs once after all migrations:
-- GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
-- GRANT EXECUTE ON FUNCTION public.is_org_admin(), public.org_id(), public.can_access_property(uuid), public.set_updated_at() TO supabase_auth_admin;
-- Set Custom Access Token Hook in Supabase Dashboard to: public.custom_access_token_hook
