-- =============================================================================
-- Neumas Database Schema Setup
-- =============================================================================
-- Run this SQL in Supabase SQL Editor to initialize the database schema.
-- 
-- This script creates:
-- 1. Organizations table (multi-tenant root)
-- 2. Properties table (hotels, restaurants within orgs)
-- 3. Users table (linked to Supabase Auth)
-- 4. Inventory Categories table
-- 5. Inventory Items table
-- 6. Consumption Patterns table (AI-analyzed usage patterns)
-- 7. Predictions table (demand forecasting)
-- 8. Scans table (receipt/barcode scan records)
-- 9. Shopping Lists + Items tables
--
-- Plus: RLS policies, triggers, indexes, and storage bucket
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "moddatetime";

-- =============================================================================
-- 1. ORGANIZATIONS
-- =============================================================================
-- Root tenant table - all data is scoped to an organization

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    settings JSONB DEFAULT '{}',
    subscription_tier VARCHAR(50) DEFAULT 'free',
    subscription_status VARCHAR(50) DEFAULT 'active',
    max_properties INTEGER DEFAULT 1,
    max_users INTEGER DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug ON organizations(slug);

-- =============================================================================
-- 2. PROPERTIES
-- =============================================================================
-- Properties within an organization (hotels, restaurants, etc.)

CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'hotel', -- hotel, restaurant, cafe, etc.
    address TEXT,
    timezone VARCHAR(50) DEFAULT 'UTC',
    currency VARCHAR(3) DEFAULT 'USD',
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_properties_org_id ON properties(org_id);
CREATE INDEX idx_properties_type ON properties(type);

-- =============================================================================
-- 3. USERS
-- =============================================================================
-- User profiles linked to Supabase Auth (auth.users)

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_id UUID UNIQUE NOT NULL, -- References auth.users(id)
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'staff', -- admin, manager, staff
    property_ids UUID[] DEFAULT '{}', -- Array of property IDs user can access
    permissions JSONB DEFAULT '{}',
    avatar_url TEXT,
    phone VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_auth_id ON users(auth_id);
CREATE INDEX idx_users_org_id ON users(org_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- =============================================================================
-- 4. INVENTORY CATEGORIES
-- =============================================================================
-- Categories for organizing inventory items

CREATE TABLE IF NOT EXISTS inventory_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(id) ON DELETE CASCADE, -- NULL = org-wide
    name VARCHAR(100) NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES inventory_categories(id) ON DELETE SET NULL,
    sort_order INTEGER DEFAULT 0,
    icon VARCHAR(50),
    color VARCHAR(7), -- Hex color code
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, property_id, name)
);

CREATE INDEX idx_inventory_categories_org_id ON inventory_categories(org_id);
CREATE INDEX idx_inventory_categories_property_id ON inventory_categories(property_id);

-- =============================================================================
-- 5. INVENTORY ITEMS
-- =============================================================================
-- Core inventory items table

CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    category_id UUID REFERENCES inventory_categories(id) ON DELETE SET NULL,
    
    -- Item identification
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    barcode VARCHAR(100),
    description TEXT,
    
    -- Quantities
    quantity DECIMAL(12, 3) NOT NULL DEFAULT 0,
    unit VARCHAR(50) NOT NULL DEFAULT 'unit', -- unit, kg, liter, etc.
    min_quantity DECIMAL(12, 3) DEFAULT 0, -- Reorder threshold
    max_quantity DECIMAL(12, 3), -- Max storage capacity
    
    -- Pricing
    unit_cost DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Supplier info
    supplier_name VARCHAR(255),
    supplier_sku VARCHAR(100),
    
    -- Status
    status VARCHAR(50) DEFAULT 'active', -- active, low_stock, out_of_stock, discontinued
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    image_url TEXT,
    notes TEXT,
    tags TEXT[],
    custom_fields JSONB DEFAULT '{}',
    
    -- Timestamps
    last_restocked_at TIMESTAMPTZ,
    last_counted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_inventory_items_org_id ON inventory_items(org_id);
CREATE INDEX idx_inventory_items_property_id ON inventory_items(property_id);
CREATE INDEX idx_inventory_items_category_id ON inventory_items(category_id);
CREATE INDEX idx_inventory_items_sku ON inventory_items(sku);
CREATE INDEX idx_inventory_items_barcode ON inventory_items(barcode);
CREATE INDEX idx_inventory_items_status ON inventory_items(status);
CREATE INDEX idx_inventory_items_name_search ON inventory_items USING gin(to_tsvector('english', name));

-- =============================================================================
-- 6. CONSUMPTION PATTERNS
-- =============================================================================
-- AI-analyzed consumption patterns for items

CREATE TABLE IF NOT EXISTS consumption_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    
    -- Pattern type and period
    pattern_type VARCHAR(50) NOT NULL, -- daily, weekly, monthly, seasonal, event
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Calculated metrics
    avg_daily_consumption DECIMAL(12, 3),
    peak_consumption DECIMAL(12, 3),
    low_consumption DECIMAL(12, 3),
    variance DECIMAL(10, 4),
    trend_direction VARCHAR(20), -- increasing, decreasing, stable
    trend_percentage DECIMAL(5, 2),
    
    -- Weekly patterns (index 0 = Monday)
    weekly_pattern DECIMAL(5, 2)[] DEFAULT '{1,1,1,1,1,1,1}',
    
    -- Monthly patterns (index 0 = Jan)
    monthly_pattern DECIMAL(5, 2)[] DEFAULT '{1,1,1,1,1,1,1,1,1,1,1,1}',
    
    -- AI insights
    insights TEXT,
    confidence_score DECIMAL(5, 4), -- 0-1 confidence in pattern
    data_points_count INTEGER DEFAULT 0,
    
    -- LLM provider that generated insights
    llm_provider VARCHAR(50),
    llm_model VARCHAR(100),
    
    -- Timestamps
    analyzed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(item_id, pattern_type, period_start, period_end)
);

CREATE INDEX idx_consumption_patterns_org_id ON consumption_patterns(org_id);
CREATE INDEX idx_consumption_patterns_property_id ON consumption_patterns(property_id);
CREATE INDEX idx_consumption_patterns_item_id ON consumption_patterns(item_id);
CREATE INDEX idx_consumption_patterns_type ON consumption_patterns(pattern_type);

-- =============================================================================
-- 7. PREDICTIONS
-- =============================================================================
-- Demand forecasting predictions

CREATE TABLE IF NOT EXISTS predictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    
    -- Prediction details
    prediction_type VARCHAR(50) NOT NULL, -- demand, stockout, reorder
    prediction_date DATE NOT NULL,
    
    -- Forecast values
    predicted_quantity DECIMAL(12, 3) NOT NULL,
    lower_bound DECIMAL(12, 3),
    upper_bound DECIMAL(12, 3),
    confidence_level DECIMAL(5, 4), -- 0-1 confidence
    
    -- Stockout prediction
    days_until_stockout INTEGER,
    stockout_probability DECIMAL(5, 4),
    stockout_risk_level VARCHAR(20), -- low, medium, high, critical
    
    -- Reorder recommendation
    recommended_order_qty DECIMAL(12, 3),
    recommended_order_date DATE,
    
    -- Factors considered
    factors_json JSONB DEFAULT '{}',
    
    -- Accuracy tracking (populated after actual data available)
    actual_quantity DECIMAL(12, 3),
    accuracy_score DECIMAL(5, 4),
    
    -- LLM metadata
    llm_provider VARCHAR(50),
    llm_model VARCHAR(100),
    
    -- Timestamps
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(item_id, prediction_type, prediction_date)
);

CREATE INDEX idx_predictions_org_id ON predictions(org_id);
CREATE INDEX idx_predictions_property_id ON predictions(property_id);
CREATE INDEX idx_predictions_item_id ON predictions(item_id);
CREATE INDEX idx_predictions_date ON predictions(prediction_date);
CREATE INDEX idx_predictions_type ON predictions(prediction_type);
CREATE INDEX idx_predictions_stockout_risk ON predictions(stockout_risk_level);

-- =============================================================================
-- 8. SCANS
-- =============================================================================
-- Receipt and barcode scan records

CREATE TABLE IF NOT EXISTS scans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Scan details
    scan_type VARCHAR(50) NOT NULL, -- receipt, barcode, manual
    status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed, approved
    
    -- Storage
    image_urls TEXT[] DEFAULT '{}',
    storage_paths TEXT[] DEFAULT '{}',
    
    -- Processing results
    raw_data JSONB, -- Raw OCR/barcode data
    processed_data JSONB, -- Parsed and structured data
    
    -- Detected items (summary)
    detected_items JSONB DEFAULT '[]', -- [{item_name, qty, confidence}]
    items_count INTEGER DEFAULT 0,
    
    -- Processing metadata
    processing_time_ms INTEGER,
    confidence_score DECIMAL(5, 4),
    
    -- LLM metadata
    llm_provider VARCHAR(50),
    llm_model VARCHAR(100),
    
    -- Error handling
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- User approval
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    approval_notes TEXT,
    
    -- Timestamps
    scanned_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scans_org_id ON scans(org_id);
CREATE INDEX idx_scans_property_id ON scans(property_id);
CREATE INDEX idx_scans_user_id ON scans(user_id);
CREATE INDEX idx_scans_status ON scans(status);
CREATE INDEX idx_scans_type ON scans(scan_type);
CREATE INDEX idx_scans_scanned_at ON scans(scanned_at);

-- =============================================================================
-- 9. SHOPPING LISTS
-- =============================================================================
-- Generated or manual shopping lists

CREATE TABLE IF NOT EXISTS shopping_lists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- List details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'draft', -- draft, active, completed, cancelled
    
    -- Generation info
    generation_type VARCHAR(50) DEFAULT 'manual', -- manual, auto, ai_suggested
    generation_params JSONB, -- Parameters used for auto-generation
    
    -- Budget
    budget_limit DECIMAL(12, 2),
    estimated_total DECIMAL(12, 2),
    actual_total DECIMAL(12, 2),
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Summary
    items_count INTEGER DEFAULT 0,
    items_checked INTEGER DEFAULT 0,
    
    -- Scheduling
    due_date DATE,
    reminder_at TIMESTAMPTZ,
    
    -- Timestamps
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shopping_lists_org_id ON shopping_lists(org_id);
CREATE INDEX idx_shopping_lists_property_id ON shopping_lists(property_id);
CREATE INDEX idx_shopping_lists_status ON shopping_lists(status);
CREATE INDEX idx_shopping_lists_created_by ON shopping_lists(created_by);

-- =============================================================================
-- 10. SHOPPING LIST ITEMS
-- =============================================================================
-- Items within shopping lists

CREATE TABLE IF NOT EXISTS shopping_list_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    list_id UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
    item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL, -- NULL for ad-hoc items
    
    -- Item details (copied or custom)
    item_name VARCHAR(255) NOT NULL,
    quantity DECIMAL(12, 3) NOT NULL,
    unit VARCHAR(50) NOT NULL DEFAULT 'unit',
    
    -- Pricing
    estimated_unit_price DECIMAL(10, 2),
    actual_unit_price DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Source
    source VARCHAR(50), -- prediction, low_stock, manual, ai_suggestion
    prediction_id UUID REFERENCES predictions(id) ON DELETE SET NULL,
    
    -- Status
    is_checked BOOLEAN DEFAULT FALSE,
    is_purchased BOOLEAN DEFAULT FALSE,
    purchased_quantity DECIMAL(12, 3),
    purchased_at TIMESTAMPTZ,
    
    -- Store/supplier info
    store_name VARCHAR(255),
    store_section VARCHAR(100),
    
    -- Notes
    notes TEXT,
    priority INTEGER DEFAULT 0, -- Higher = more important
    sort_order INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shopping_list_items_list_id ON shopping_list_items(list_id);
CREATE INDEX idx_shopping_list_items_item_id ON shopping_list_items(item_id);
CREATE INDEX idx_shopping_list_items_checked ON shopping_list_items(is_checked);

-- =============================================================================
-- AUTOMATED UPDATED_AT TRIGGERS
-- =============================================================================
-- Using moddatetime extension to auto-update updated_at columns

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at column
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT table_name FROM information_schema.columns 
               WHERE column_name = 'updated_at' 
               AND table_schema = 'public'
               AND table_name IN (
                   'organizations', 'properties', 'users', 
                   'inventory_categories', 'inventory_items',
                   'consumption_patterns', 'predictions', 'scans',
                   'shopping_lists', 'shopping_list_items'
               )
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS set_updated_at ON %I;
            CREATE TRIGGER set_updated_at
                BEFORE UPDATE ON %I
                FOR EACH ROW
                EXECUTE FUNCTION trigger_set_updated_at();
        ', tbl, tbl);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- INVENTORY STATUS UPDATE TRIGGER
-- =============================================================================
-- Automatically update inventory status based on quantity

CREATE OR REPLACE FUNCTION trigger_update_inventory_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.quantity <= 0 THEN
        NEW.status = 'out_of_stock';
    ELSIF NEW.quantity <= COALESCE(NEW.min_quantity, 0) THEN
        NEW.status = 'low_stock';
    ELSE
        NEW.status = 'active';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_inventory_status ON inventory_items;
CREATE TRIGGER update_inventory_status
    BEFORE INSERT OR UPDATE OF quantity, min_quantity ON inventory_items
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_inventory_status();

-- =============================================================================
-- SHOPPING LIST ITEM COUNT TRIGGER
-- =============================================================================
-- Automatically update items_count on shopping lists

CREATE OR REPLACE FUNCTION trigger_update_shopping_list_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        UPDATE shopping_lists 
        SET items_count = (
            SELECT COUNT(*) FROM shopping_list_items WHERE list_id = NEW.list_id
        ),
        items_checked = (
            SELECT COUNT(*) FROM shopping_list_items WHERE list_id = NEW.list_id AND is_checked = TRUE
        )
        WHERE id = NEW.list_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE shopping_lists 
        SET items_count = (
            SELECT COUNT(*) FROM shopping_list_items WHERE list_id = OLD.list_id
        ),
        items_checked = (
            SELECT COUNT(*) FROM shopping_list_items WHERE list_id = OLD.list_id AND is_checked = TRUE
        )
        WHERE id = OLD.list_id;
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_shopping_list_count ON shopping_list_items;
CREATE TRIGGER update_shopping_list_count
    AFTER INSERT OR UPDATE OR DELETE ON shopping_list_items
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_shopping_list_count();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================
-- Enable RLS on all tables and create policies

-- Organizations: Only members can see their org
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_organizations" ON organizations
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "users_select_own_org" ON organizations
    FOR SELECT USING (
        id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
    );

-- Properties: Org members can see properties
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_properties" ON properties
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "users_select_org_properties" ON properties
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
    );

CREATE POLICY "admins_manage_properties" ON properties
    FOR ALL USING (
        org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid() AND role = 'admin')
    );

-- Users: Can see users in same org
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_users" ON users
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "users_select_org_users" ON users
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
    );

CREATE POLICY "users_update_self" ON users
    FOR UPDATE USING (auth_id = auth.uid());

-- Inventory Categories
ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_inventory_categories" ON inventory_categories
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "users_select_org_categories" ON inventory_categories
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
    );

CREATE POLICY "staff_manage_categories" ON inventory_categories
    FOR ALL USING (
        org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid() AND role IN ('admin', 'manager'))
    );

-- Inventory Items
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_inventory_items" ON inventory_items
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "users_select_org_items" ON inventory_items
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
    );

CREATE POLICY "staff_manage_items" ON inventory_items
    FOR ALL USING (
        org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
    );

-- Consumption Patterns
ALTER TABLE consumption_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_consumption_patterns" ON consumption_patterns
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "users_select_org_patterns" ON consumption_patterns
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
    );

-- Predictions
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_predictions" ON predictions
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "users_select_org_predictions" ON predictions
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
    );

-- Scans
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_scans" ON scans
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "users_select_org_scans" ON scans
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
    );

CREATE POLICY "users_insert_scans" ON scans
    FOR INSERT WITH CHECK (
        org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
    );

-- Shopping Lists
ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_shopping_lists" ON shopping_lists
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "users_select_org_lists" ON shopping_lists
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
    );

CREATE POLICY "users_manage_lists" ON shopping_lists
    FOR ALL USING (
        org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
    );

-- Shopping List Items
ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_shopping_list_items" ON shopping_list_items
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "users_select_list_items" ON shopping_list_items
    FOR SELECT USING (
        list_id IN (
            SELECT id FROM shopping_lists 
            WHERE org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
        )
    );

CREATE POLICY "users_manage_list_items" ON shopping_list_items
    FOR ALL USING (
        list_id IN (
            SELECT id FROM shopping_lists 
            WHERE org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
        )
    );

-- =============================================================================
-- STORAGE BUCKET FOR RECEIPTS
-- =============================================================================
-- Create the receipts bucket for storing scan images

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'receipts',
    'receipts',
    FALSE,
    10485760, -- 10MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage RLS policies
CREATE POLICY "service_role_storage_access" ON storage.objects
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "users_upload_receipts" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'receipts' AND 
        auth.uid() IS NOT NULL
    );

CREATE POLICY "users_view_own_receipts" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'receipts' AND 
        auth.uid() IS NOT NULL
    );

-- =============================================================================
-- SEED DATA (Optional - for testing)
-- =============================================================================
-- Uncomment the following to create test data

-- INSERT INTO organizations (name, slug, subscription_tier)
-- VALUES ('Demo Organization', 'demo-org', 'starter')
-- ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- Run these to verify the schema was created correctly

-- Check all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
    'organizations', 'properties', 'users',
    'inventory_categories', 'inventory_items',
    'consumption_patterns', 'predictions', 'scans',
    'shopping_lists', 'shopping_list_items'
)
ORDER BY table_name;

-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
    'organizations', 'properties', 'users',
    'inventory_categories', 'inventory_items',
    'consumption_patterns', 'predictions', 'scans',
    'shopping_lists', 'shopping_list_items'
);

-- Check triggers exist
SELECT trigger_name, event_object_table, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

COMMENT ON SCHEMA public IS 'Neumas inventory management schema - v1.0.0';
