-- FIXED: Auth schema permission error resolved (42501)
-- All helper functions moved to public schema with SECURITY DEFINER
-- Compatible with Supabase 2026 RLS + JWT custom claims hook

-- =============================================================================
-- Migration 0006 — Alerts and Audit Logs
-- =============================================================================
-- Adds alert state machine and immutable audit trail.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- alerts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alerts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- alert_type: low_stock | out_of_stock | expiry_risk | unusual_price_increase | no_recent_scan
  alert_type       text NOT NULL CHECK (alert_type IN (
    'low_stock', 'out_of_stock', 'expiry_risk', 'unusual_price_increase', 'no_recent_scan'
  )),
  severity         text NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  -- state machine: open | snoozed | resolved
  state            text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'snoozed', 'resolved')),
  title            text NOT NULL,
  message          text,
  -- item this alert is about (optional)
  item_id          uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  item_name        text,
  -- trigger metadata
  trigger_data     jsonb NOT NULL DEFAULT '{}',
  -- snooze/resolve tracking
  snoozed_until    timestamptz,
  snoozed_by_id    uuid REFERENCES users(id),
  resolved_at      timestamptz,
  resolved_by_id   uuid REFERENCES users(id),
  resolve_reason   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_property ON alerts(property_id);
CREATE INDEX IF NOT EXISTS idx_alerts_org      ON alerts(org_id);
CREATE INDEX IF NOT EXISTS idx_alerts_state    ON alerts(property_id, state);
CREATE INDEX IF NOT EXISTS idx_alerts_item     ON alerts(item_id) WHERE item_id IS NOT NULL;

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY alerts_select ON alerts FOR SELECT
  USING (org_id = public.org_id() AND public.can_access_property(property_id));
CREATE POLICY alerts_insert ON alerts FOR INSERT
  WITH CHECK (org_id = public.org_id());
CREATE POLICY alerts_update ON alerts FOR UPDATE
  USING (org_id = public.org_id() AND public.can_access_property(property_id));

DO $$ BEGIN
  CREATE TRIGGER trg_alerts_updated_at
    BEFORE UPDATE ON alerts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- audit_logs  (immutable — no UPDATE or DELETE)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id  uuid REFERENCES properties(id) ON DELETE SET NULL,
  user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  -- event_type: login | logout | item_created | item_updated | item_deleted |
  --   quantity_adjusted | document_approved | reorder_generated |
  --   report_exported | admin_action
  event_type   text NOT NULL,
  entity_type  text,          -- 'inventory_item' | 'document' | 'vendor' | etc.
  entity_id    uuid,
  description  text,
  metadata     jsonb NOT NULL DEFAULT '{}',
  ip_address   text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_org      ON audit_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_user     ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_type     ON audit_logs(org_id, event_type);
CREATE INDEX IF NOT EXISTS idx_audit_created  ON audit_logs(created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs
CREATE POLICY audit_select ON audit_logs FOR SELECT
  USING (org_id = public.org_id() AND public.is_org_admin());

-- Insert via service-role only (backend inserts, not client)
-- No UPDATE or DELETE policies — audit log is immutable

-- POST-FIX INSTRUCTIONS:
-- Run these GRANTs once after all migrations:
-- GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
-- GRANT EXECUTE ON FUNCTION public.is_org_admin(), public.org_id(), public.can_access_property(uuid), public.set_updated_at() TO supabase_auth_admin;
-- Set Custom Access Token Hook in Supabase Dashboard to: public.custom_access_token_hook
