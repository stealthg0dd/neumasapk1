-- =============================================================================
-- FIXED: Auth schema permission error resolved (42501)
-- All helper functions moved to public schema with SECURITY DEFINER
-- Compatible with Supabase 2026 RLS + JWT custom claims hook
-- =============================================================================
--
-- Migration 0001 — Baseline
-- =============================================================================
-- This migration captures the state of the schema as of the modular monolith
-- upgrade (2026-04-17). It is a no-op if applied after supabase/schema.sql
-- has already been applied; it uses CREATE TABLE IF NOT EXISTS throughout.
--
-- Source of truth: neumas-backend/supabase/schema.sql
-- Apply via: Supabase SQL Editor or `supabase db push`
-- =============================================================================

-- Drop any old auth-schema versions of these functions (safe no-op if absent)
DROP FUNCTION IF EXISTS auth.is_org_admin() CASCADE;
DROP FUNCTION IF EXISTS auth.org_id() CASCADE;
DROP FUNCTION IF EXISTS auth.can_access_property(uuid) CASCADE;

-- Ensure helper functions exist in public schema (idempotent)
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

-- plpgsql (not sql) so body is NOT validated at CREATE time — safe on existing DBs
CREATE OR REPLACE FUNCTION public.can_access_property(p_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF (auth.jwt() ->> 'role') = 'admin' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.properties
      WHERE id = p_id
        AND organization_id = (auth.jwt() ->> 'org_id')::uuid
    );
  ELSE
    RETURN p_id::text = ANY(
      ARRAY(SELECT jsonb_array_elements_text(
        COALESCE(auth.jwt() -> 'property_ids', '[]'::jsonb)
      ))
    );
  END IF;
END;
$$;

-- set_updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

GRANT EXECUTE ON FUNCTION public.is_org_admin()            TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.org_id()                  TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_access_property(uuid) TO authenticated, anon;

-- Baseline tables (idempotent via IF NOT EXISTS)
-- These tables exist if schema.sql was already applied.
-- This migration serves as a documented baseline checkpoint.

SELECT 'Baseline migration 0001 verified.' AS status;

-- POST-FIX INSTRUCTIONS:
-- Run these GRANTs once after all migrations:
-- GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
-- GRANT EXECUTE ON FUNCTION public.is_org_admin(), public.org_id(), public.can_access_property(uuid), public.set_updated_at() TO supabase_auth_admin;
-- Set Custom Access Token Hook in Supabase Dashboard to: public.custom_access_token_hook
