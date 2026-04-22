-- =============================================================================
-- BLOCK 2 of 5: Tenant Model
-- Requires block 1. Creates: organizations, properties, users,
--   inventory_categories, inventory_items, inventory_movements
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

-- ADD COLUMN guards: must run BEFORE COMMENT ON COLUMN on existing databases.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan                text    NOT NULL DEFAULT 'free';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_status text    NOT NULL DEFAULT 'active';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS max_properties      integer NOT NULL DEFAULT 1;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS max_users           integer NOT NULL DEFAULT 5;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS settings            jsonb   NOT NULL DEFAULT '{}';

COMMENT ON COLUMN organizations.plan IS
  'Billing tier: free(50docs/2users/1prop) | pilot(500/10/5) | pro(5000/25/20) | enterprise(unlimited).';

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


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

-- ADD COLUMN guards: must run BEFORE CREATE INDEX that references these columns.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS type     text  NOT NULL DEFAULT 'restaurant';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS currency text  NOT NULL DEFAULT 'USD';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_properties_org  ON properties(organization_id);
CREATE INDEX IF NOT EXISTS idx_properties_type ON properties(type);
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE TRIGGER trg_properties_updated_at
  BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


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

DO $$ BEGIN CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


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
  vendor_id       uuid          REFERENCES vendors(id) ON DELETE SET NULL,
  supplier_name   text,
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

-- ADD COLUMN guards: must come BEFORE COMMENT ON TABLE and indexes.
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS organization_id uuid   REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS currency        text   NOT NULL DEFAULT 'USD';
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS tags            text[] NOT NULL DEFAULT '{}';
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS vendor_id       uuid   REFERENCES vendors(id) ON DELETE SET NULL;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS supplier_name   text;
-- Back-fill organization_id from parent property (idempotent)
UPDATE inventory_items ii
   SET organization_id = p.organization_id
  FROM properties p
 WHERE ii.property_id = p.id
   AND ii.organization_id IS NULL;

COMMENT ON TABLE inventory_items IS
  'Snapshot of current item state. For auditable history, query inventory_movements.';

CREATE INDEX IF NOT EXISTS idx_inventory_property ON inventory_items(property_id);
CREATE INDEX IF NOT EXISTS idx_inventory_org      ON inventory_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_name     ON inventory_items(property_id, name);
CREATE INDEX IF NOT EXISTS idx_inventory_barcode  ON inventory_items(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_sku      ON inventory_items(sku)     WHERE sku     IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_vendor   ON inventory_items(vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_name_fts ON inventory_items USING gin(to_tsvector('english', name));
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE TRIGGER trg_inventory_items_updated_at
  BEFORE UPDATE ON inventory_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ---------------------------------------------------------------------------
-- inventory_movements
-- APPEND-ONLY LEDGER: every quantity-changing event is recorded here.
-- idempotency_key prevents duplicate rows on Celery retries.
-- ---------------------------------------------------------------------------

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
