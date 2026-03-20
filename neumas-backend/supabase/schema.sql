-- =============================================================================
-- Neumas — Full Supabase Schema + RLS Policies
-- =============================================================================
-- Apply in the Supabase SQL Editor or via `supabase db push`.
-- Assumes Supabase Auth is enabled (auth.users table exists).
--
-- Multi-tenancy model:
--   • Every row is owned by an organization (org_id).
--   • Property-scoped rows also carry property_id.
--   • RLS uses JWT custom claims: org_id and property_ids (array of UUIDs).
--   • Admins see all properties in their org; staff/residents see only theirs.
--
-- Custom claim setup (run once via Supabase Auth Hooks or a trigger):
--   auth.jwt() ->> 'org_id'             → UUID string
--   auth.jwt() -> 'property_ids'        → JSON array of UUID strings
--   auth.jwt() ->> 'role'               → 'admin' | 'staff' | 'resident'
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Convenience function: is the calling user an admin for their org?
CREATE OR REPLACE FUNCTION auth.is_org_admin()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT (auth.jwt() ->> 'role') = 'admin';
$$;

-- Convenience function: org_id from the JWT
CREATE OR REPLACE FUNCTION auth.org_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT (auth.jwt() ->> 'org_id')::uuid;
$$;

-- Convenience function: does the calling user have access to a given property?
-- Admins: any property in their org. Staff/residents: listed in JWT claim.
CREATE OR REPLACE FUNCTION auth.can_access_property(p_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT
    CASE
      WHEN (auth.jwt() ->> 'role') = 'admin'
        THEN EXISTS (
          SELECT 1 FROM properties
          WHERE id = p_id
            AND organization_id = (auth.jwt() ->> 'org_id')::uuid
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


-- =============================================================================
-- TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  slug                text NOT NULL UNIQUE,
  settings            jsonb NOT NULL DEFAULT '{}',
  subscription_tier   text NOT NULL DEFAULT 'free',
  subscription_status text NOT NULL DEFAULT 'active',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- properties
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS properties (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  address         text,
  settings        jsonb NOT NULL DEFAULT '{}',
  timezone        text NOT NULL DEFAULT 'UTC',
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_properties_org ON properties(organization_id);

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- users  (mirrors auth.users; linked by auth_id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id         uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           text NOT NULL UNIQUE,
  full_name       text,
  role            text NOT NULL DEFAULT 'staff',  -- admin | staff | resident
  permissions     jsonb NOT NULL DEFAULT '{}',
  preferences     jsonb NOT NULL DEFAULT '{}',
  is_active       boolean NOT NULL DEFAULT true,
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_org    ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_authid ON users(auth_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- inventory_categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_categories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id       uuid REFERENCES inventory_categories(id),
  name            text NOT NULL,
  description     text,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_org ON inventory_categories(organization_id);

ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- inventory_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  category_id     uuid REFERENCES inventory_categories(id),
  name            text NOT NULL,
  description     text,
  sku             text,
  barcode         text,
  unit            text NOT NULL DEFAULT 'unit',
  quantity        numeric(10,2) NOT NULL DEFAULT 0,
  min_quantity    numeric(10,2) NOT NULL DEFAULT 0,
  max_quantity    numeric(10,2),
  reorder_point   numeric(10,2),
  cost_per_unit   numeric(10,2),
  supplier_info   jsonb NOT NULL DEFAULT '{}',
  metadata        jsonb NOT NULL DEFAULT '{}',
  is_active       boolean NOT NULL DEFAULT true,
  last_scanned_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_property  ON inventory_items(property_id);
CREATE INDEX IF NOT EXISTS idx_inventory_name      ON inventory_items(property_id, name);
CREATE INDEX IF NOT EXISTS idx_inventory_barcode   ON inventory_items(barcode) WHERE barcode IS NOT NULL;

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- scans
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scans (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id        uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES users(id),
  status             text NOT NULL DEFAULT 'pending', -- pending | processing | completed | failed
  scan_type          text NOT NULL DEFAULT 'receipt', -- receipt | barcode | full
  image_urls         jsonb NOT NULL DEFAULT '[]',
  raw_results        jsonb NOT NULL DEFAULT '{}',
  processed_results  jsonb NOT NULL DEFAULT '{}',
  items_detected     integer NOT NULL DEFAULT 0,
  confidence_score   numeric(5,4),
  processing_time_ms integer,
  error_message      text,
  started_at         timestamptz,
  completed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scans_property ON scans(property_id);
CREATE INDEX IF NOT EXISTS idx_scans_user     ON scans(user_id);
CREATE INDEX IF NOT EXISTS idx_scans_status   ON scans(status);

ALTER TABLE scans ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- consumption_patterns
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consumption_patterns (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  pattern_type text NOT NULL,  -- daily | weekly | seasonal | event
  pattern_data jsonb NOT NULL,
  confidence   numeric(5,4) NOT NULL DEFAULT 0,
  sample_size  integer NOT NULL DEFAULT 0,
  valid_from   timestamptz,
  valid_until  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, pattern_type)
);

CREATE INDEX IF NOT EXISTS idx_patterns_item ON consumption_patterns(item_id);

ALTER TABLE consumption_patterns ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- predictions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS predictions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id              uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  item_id                  uuid REFERENCES inventory_items(id) ON DELETE CASCADE,
  prediction_type          text NOT NULL,  -- demand | stockout | reorder
  prediction_date          timestamptz NOT NULL,
  predicted_value          numeric(10,2) NOT NULL,
  confidence_interval_low  numeric(10,2),
  confidence_interval_high numeric(10,2),
  confidence               numeric(5,4) NOT NULL DEFAULT 0,
  model_version            text,
  features_used            jsonb NOT NULL DEFAULT '{}',
  actual_value             numeric(10,2),
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_predictions_property ON predictions(property_id);
CREATE INDEX IF NOT EXISTS idx_predictions_item     ON predictions(item_id);

ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- shopping_lists
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shopping_lists (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id          uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  created_by_id        uuid NOT NULL REFERENCES users(id),
  name                 text NOT NULL,
  status               text NOT NULL DEFAULT 'active',  -- active | draft | approved | ordered | received
  total_estimated_cost numeric(10,2),
  total_actual_cost    numeric(10,2),
  budget_limit         numeric(10,2),
  notes                text,
  generation_params    jsonb NOT NULL DEFAULT '{}',
  approved_at          timestamptz,
  approved_by_id       uuid REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopping_lists_property ON shopping_lists(property_id);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_status   ON shopping_lists(property_id, status);

ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- shopping_list_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shopping_list_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopping_list_id  uuid NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES inventory_items(id),
  name              text NOT NULL,
  quantity          numeric(10,2) NOT NULL,
  unit              text NOT NULL DEFAULT 'unit',
  estimated_price   numeric(10,2),
  actual_price      numeric(10,2),
  priority          text NOT NULL DEFAULT 'normal',  -- critical | high | normal | low
  reason            text,
  is_purchased      boolean NOT NULL DEFAULT false,
  purchased_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sli_list ON shopping_list_items(shopping_list_id);

ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- updated_at triggers
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_properties_updated_at
    BEFORE UPDATE ON properties
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_inventory_updated_at
    BEFORE UPDATE ON inventory_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_patterns_updated_at
    BEFORE UPDATE ON consumption_patterns
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_shopping_lists_updated_at
    BEFORE UPDATE ON shopping_lists
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- RLS POLICIES
-- =============================================================================
-- Pattern:
--   SELECT: user must belong to same org (org_id match via JWT claim).
--   INSERT/UPDATE/DELETE: same org check + property access where applicable.
--   Admins: full access within their org on all tables.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- organizations
-- Rule: a user can only see and update the single org they belong to.
-- Admins: can update org settings. No one can insert/delete via API (done
-- via service-role during onboarding only).
-- ---------------------------------------------------------------------------
-- SELECT: JWT org_id matches this row's id.
CREATE POLICY org_select ON organizations FOR SELECT
  USING (id = auth.org_id());

-- UPDATE: same org AND caller must be an admin.
CREATE POLICY org_update ON organizations FOR UPDATE
  USING (id = auth.org_id() AND auth.is_org_admin());

-- ---------------------------------------------------------------------------
-- properties
-- Rule: all org members can read any property in their org.
-- Only admins can create, update, or delete properties.
-- ---------------------------------------------------------------------------
-- SELECT: property belongs to caller's org.
CREATE POLICY prop_select ON properties FOR SELECT
  USING (organization_id = auth.org_id());

-- INSERT: must be admin AND property is in caller's org.
CREATE POLICY prop_insert ON properties FOR INSERT
  WITH CHECK (organization_id = auth.org_id() AND auth.is_org_admin());

-- UPDATE: admin only, within same org.
CREATE POLICY prop_update ON properties FOR UPDATE
  USING (organization_id = auth.org_id() AND auth.is_org_admin());

-- DELETE: admin only, within same org.
CREATE POLICY prop_delete ON properties FOR DELETE
  USING (organization_id = auth.org_id() AND auth.is_org_admin());

-- ---------------------------------------------------------------------------
-- users
-- Rule: org members can list colleagues. Admins can invite/deactivate.
-- Any user can update their own profile regardless of role.
-- ---------------------------------------------------------------------------
-- SELECT: caller is in the same org.
CREATE POLICY user_select ON users FOR SELECT
  USING (organization_id = auth.org_id());

-- INSERT: admin only (new user provisioning).
CREATE POLICY user_insert ON users FOR INSERT
  WITH CHECK (organization_id = auth.org_id() AND auth.is_org_admin());

-- UPDATE: admin can update anyone in their org; staff/resident can only
--         update their own row (password changes, preferences, etc.).
CREATE POLICY user_update ON users FOR UPDATE
  USING (
    organization_id = auth.org_id()
    AND (auth.is_org_admin() OR auth_id = auth.uid())
  );

-- DELETE: admin only.
CREATE POLICY user_delete ON users FOR DELETE
  USING (organization_id = auth.org_id() AND auth.is_org_admin());

-- ---------------------------------------------------------------------------
-- inventory_categories
-- Rule: org-scoped. All users in the org can read and write categories.
-- Only admins can delete to prevent accidental removal.
-- ---------------------------------------------------------------------------
-- SELECT: category belongs to caller's org.
CREATE POLICY cat_select ON inventory_categories FOR SELECT
  USING (organization_id = auth.org_id());

-- INSERT: any org member can add a category.
CREATE POLICY cat_insert ON inventory_categories FOR INSERT
  WITH CHECK (organization_id = auth.org_id());

-- UPDATE: any org member can update categories.
CREATE POLICY cat_update ON inventory_categories FOR UPDATE
  USING (organization_id = auth.org_id());

-- DELETE: admin only (destructive — cascades to items).
CREATE POLICY cat_delete ON inventory_categories FOR DELETE
  USING (organization_id = auth.org_id() AND auth.is_org_admin());

-- ---------------------------------------------------------------------------
-- inventory_items
-- Rule: property-scoped. Admins see all properties in the org; staff/residents
-- see only properties listed in their JWT property_ids claim.
-- Deletion is admin-only to prevent accidental data loss.
-- ---------------------------------------------------------------------------
-- SELECT: caller has access to this item's property (via JWT claim).
CREATE POLICY inv_select ON inventory_items FOR SELECT
  USING (auth.can_access_property(property_id));

-- INSERT: caller must have access to the target property.
CREATE POLICY inv_insert ON inventory_items FOR INSERT
  WITH CHECK (auth.can_access_property(property_id));

-- UPDATE: same property access check.
CREATE POLICY inv_update ON inventory_items FOR UPDATE
  USING (auth.can_access_property(property_id));

-- DELETE: property access AND admin role (prevents accidental removal).
CREATE POLICY inv_delete ON inventory_items FOR DELETE
  USING (auth.can_access_property(property_id) AND auth.is_org_admin());

-- ---------------------------------------------------------------------------
-- scans
-- Rule: property-scoped. Any user with property access can upload and view
-- scans. Deletion requires being the uploader OR an admin.
-- ---------------------------------------------------------------------------
-- SELECT: caller has access to this scan's property.
CREATE POLICY scan_select ON scans FOR SELECT
  USING (auth.can_access_property(property_id));

-- INSERT: caller must have access to the target property.
CREATE POLICY scan_insert ON scans FOR INSERT
  WITH CHECK (auth.can_access_property(property_id));

-- UPDATE: Celery workers use the service-role client (bypasses RLS) to
-- write processing results; user-facing updates just need property access.
CREATE POLICY scan_update ON scans FOR UPDATE
  USING (auth.can_access_property(property_id));

-- DELETE: property access AND (uploader OR admin).
CREATE POLICY scan_delete ON scans FOR DELETE
  USING (
    auth.can_access_property(property_id)
    AND (
      user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
      OR auth.is_org_admin()
    )
  );

-- ---------------------------------------------------------------------------
-- consumption_patterns
-- Rule: patterns have no direct property_id; access is derived via the
-- parent inventory_item → property chain. Celery workers write patterns
-- using the service-role client which bypasses these policies.
-- ---------------------------------------------------------------------------
-- SELECT: item is in a property the caller can access.
CREATE POLICY pattern_select ON consumption_patterns FOR SELECT
  USING (
    item_id IN (
      SELECT id FROM inventory_items WHERE auth.can_access_property(property_id)
    )
  );

-- INSERT: same derivation — item must be in an accessible property.
CREATE POLICY pattern_insert ON consumption_patterns FOR INSERT
  WITH CHECK (
    item_id IN (
      SELECT id FROM inventory_items WHERE auth.can_access_property(property_id)
    )
  );

-- UPDATE: same derivation.
CREATE POLICY pattern_update ON consumption_patterns FOR UPDATE
  USING (
    item_id IN (
      SELECT id FROM inventory_items WHERE auth.can_access_property(property_id)
    )
  );

-- ---------------------------------------------------------------------------
-- predictions
-- Rule: property-scoped. Celery workers write predictions via service-role.
-- Users can read predictions for properties they have access to.
-- ---------------------------------------------------------------------------
-- SELECT: caller has access to this prediction's property.
CREATE POLICY pred_select ON predictions FOR SELECT
  USING (auth.can_access_property(property_id));

-- INSERT: Celery service-role bypasses this; kept for completeness.
CREATE POLICY pred_insert ON predictions FOR INSERT
  WITH CHECK (auth.can_access_property(property_id));

-- UPDATE: same.
CREATE POLICY pred_update ON predictions FOR UPDATE
  USING (auth.can_access_property(property_id));

-- ---------------------------------------------------------------------------
-- shopping_lists
-- Rule: property-scoped. Any user with property access can create and manage
-- lists. Only admins can delete lists (they represent approved orders).
-- ---------------------------------------------------------------------------
-- SELECT: caller has access to this list's property.
CREATE POLICY sl_select ON shopping_lists FOR SELECT
  USING (auth.can_access_property(property_id));

-- INSERT: caller must have access to the target property.
CREATE POLICY sl_insert ON shopping_lists FOR INSERT
  WITH CHECK (auth.can_access_property(property_id));

-- UPDATE: any user with property access (for checking off items, etc.).
CREATE POLICY sl_update ON shopping_lists FOR UPDATE
  USING (auth.can_access_property(property_id));

-- DELETE: admin only — list deletion implies discarding a procurement record.
CREATE POLICY sl_delete ON shopping_lists FOR DELETE
  USING (auth.can_access_property(property_id) AND auth.is_org_admin());

-- ---------------------------------------------------------------------------
-- shopping_list_items
-- Rule: access derived from the parent shopping_list → property chain.
-- Any user with list access can manage items (add, check off, remove).
-- ---------------------------------------------------------------------------
-- SELECT: parent list is in an accessible property.
CREATE POLICY sli_select ON shopping_list_items FOR SELECT
  USING (
    shopping_list_id IN (
      SELECT id FROM shopping_lists WHERE auth.can_access_property(property_id)
    )
  );

-- INSERT: parent list must be in an accessible property.
CREATE POLICY sli_insert ON shopping_list_items FOR INSERT
  WITH CHECK (
    shopping_list_id IN (
      SELECT id FROM shopping_lists WHERE auth.can_access_property(property_id)
    )
  );

-- UPDATE: same parent list check.
CREATE POLICY sli_update ON shopping_list_items FOR UPDATE
  USING (
    shopping_list_id IN (
      SELECT id FROM shopping_lists WHERE auth.can_access_property(property_id)
    )
  );

-- DELETE: same parent list check (users can remove items they added).
CREATE POLICY sli_delete ON shopping_list_items FOR DELETE
  USING (
    shopping_list_id IN (
      SELECT id FROM shopping_lists WHERE auth.can_access_property(property_id)
    )
  );


-- =============================================================================
-- STORAGE
-- =============================================================================
-- Receipt/scan images are stored in the "scans" private bucket.
-- Objects are keyed as: {org_id}/{property_id}/{scan_id}.{ext}
-- Access is controlled by signed URLs (generated server-side, 1h default)
-- rather than public URLs so that raw receipt images are never world-readable.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'scans',
  'scans',
  FALSE,                   -- private bucket; access via signed URLs only
  10485760,                -- 10 MB per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage objects: service role has full access for server-side uploads.
-- Authenticated users may upload to paths that start with their org prefix
-- and download objects within properties they can access.
-- The actual URL generation (signing) is done server-side — these policies
-- are a secondary defence layer for the Supabase Storage API directly.

-- Service role: unrestricted (used by Celery scan workers).
CREATE POLICY "storage_service_role_all" ON storage.objects
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Authenticated upload: path must start with caller's org_id.
CREATE POLICY "storage_users_upload_receipts" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'scans'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'org_id')
  );

-- Authenticated read: path must start with caller's org_id.
CREATE POLICY "storage_users_read_receipts" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'scans'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'org_id')
  );


-- =============================================================================
-- JWT Custom Claims — Supabase Auth Hook
-- =============================================================================
-- Add this as a "Custom Access Token" hook in Supabase Dashboard →
-- Authentication → Hooks, pointing to a Postgres function:
--
-- CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
-- RETURNS jsonb LANGUAGE plpgsql AS $$
-- DECLARE
--   claims jsonb;
--   usr    record;
--   prop_ids text[];
-- BEGIN
--   SELECT u.organization_id, u.role
--     INTO usr
--     FROM public.users u
--    WHERE u.auth_id = (event->>'user_id')::uuid;
--
--   IF FOUND THEN
--     SELECT ARRAY(
--       SELECT p.id::text
--         FROM public.properties p
--        WHERE p.organization_id = usr.organization_id
--          AND p.is_active = true
--     ) INTO prop_ids;
--
--     claims := event->'claims';
--     claims := jsonb_set(claims, '{org_id}',    to_jsonb(usr.organization_id::text));
--     claims := jsonb_set(claims, '{role}',      to_jsonb(usr.role));
--     claims := jsonb_set(claims, '{property_ids}', to_jsonb(prop_ids));
--     RETURN jsonb_set(event, '{claims}', claims);
--   END IF;
--
--   RETURN event;
-- END;
-- $$;
--
-- Then grant execute:
-- GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
