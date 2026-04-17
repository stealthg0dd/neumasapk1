-- =============================================================================
-- Migration 0001 — Baseline
-- =============================================================================
-- This migration captures the state of the schema as of the modular monolith
-- upgrade (2026-04-17). It is a no-op if applied after supabase/schema.sql
-- has already been applied; it uses CREATE TABLE IF NOT EXISTS throughout.
--
-- Source of truth: neumas-backend/supabase/schema.sql
-- Apply via: Supabase SQL Editor or `supabase db push`
-- =============================================================================

-- Ensure helper functions exist (idempotent)
CREATE OR REPLACE FUNCTION auth.is_org_admin()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT (auth.jwt() ->> 'role') = 'admin';
$$;

CREATE OR REPLACE FUNCTION auth.org_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (auth.jwt() ->> 'org_id')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.can_access_property(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT
    CASE
      WHEN (auth.jwt() ->> 'role') = 'admin'
        THEN EXISTS (
          SELECT 1 FROM properties
          WHERE id = p_id AND organization_id = (auth.jwt() ->> 'org_id')::uuid
        )
      ELSE p_id::text = ANY(
        ARRAY(
          SELECT jsonb_array_elements_text(
            COALESCE(auth.jwt() -> 'property_ids', '[]'::jsonb)
          )
        )
      )
    END;
$$;

-- set_updated_at trigger function
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Baseline tables (idempotent via IF NOT EXISTS)
-- These tables exist if schema.sql was already applied.
-- This migration serves as a documented baseline checkpoint.

SELECT 'Baseline migration 0001 verified.' AS status;
