/**
 * Neumas API — TypeScript interfaces
 * Mirrors FastAPI Pydantic schemas exactly.
 */
import { z } from "zod";

// ============================================================================
// Auth
// ============================================================================

export interface ProfileResponse {
  user_id: string;
  email: string;
  full_name: string | null;
  org_id: string;
  org_name: string;
  property_id: string;
  property_name: string;
  role: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string | null;
  profile: ProfileResponse;
}

/** POST /api/auth/signup */
export interface SignupRequest {
  email: string;
  password: string;
  org_name: string;
  property_name: string;
  role?: string;
}

export interface SignupResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string | null;
  profile: ProfileResponse;
}

export interface DigestPreferencesResponse {
  email_digest_enabled: boolean;
  timezone: string;
  property_timezone: string;
  safety_buffer_days: number;
  preferred_currency: string;
}

export interface DigestPreferencesUpdateRequest {
  email_digest_enabled?: boolean;
  timezone?: string;
  safety_buffer_days?: number;
  preferred_currency?: string;
}

export interface PropertyStockHealth {
  property_id: string;
  name: string;
  region: string | null;
  country: string | null;
  low_stock: number;
  out_of_stock: number;
  predicted_stockout: number;
  risk_score: number;
  status: "green" | "amber" | "red";
}

export interface OrgPropertyStockHealthResponse {
  organization_id: string;
  red_count: number;
  properties: PropertyStockHealth[];
}

// ============================================================================
// Inventory
// ============================================================================

export interface CategorySummary {
  id: string;
  name: string;
}

export interface InventoryItem {
  id: string;
  property_id: string;
  name: string;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  unit: string;
  quantity: number;
  min_quantity: number;
  max_quantity: number | null;
  reorder_point: number | null;
  cost_per_unit: number | null;
  supplier_info: Record<string, unknown>;
  metadata: Record<string, unknown>;
  is_active: boolean;
  last_scanned_at: string | null;
  created_at: string;
  updated_at: string;
  category: CategorySummary | null;
  vendor_id?: string | null;
  average_daily_usage?: number | null;
  auto_reorder_enabled?: boolean;
  safety_buffer?: number;
  /** Computed: "normal" | "low_stock" | "out_of_stock" | "overstocked" */
  stock_status?: string;
  category_id?: string | null;
  /** Alias for min_quantity used for display */
  par_level?: number;
}

export interface InventoryItemCreate {
  property_id: string;
  name: string;
  description?: string;
  sku?: string;
  unit?: string;
  quantity?: number;
  min_quantity?: number;
  max_quantity?: number;
  reorder_point?: number;
  cost_per_unit?: number;
  category_id?: string;
}

export interface InventoryItemUpdate {
  name?: string;
  description?: string;
  sku?: string;
  unit?: string;
  min_quantity?: number;
  max_quantity?: number;
  reorder_point?: number;
  cost_per_unit?: number;
  is_active?: boolean;
  average_daily_usage?: number;
  auto_reorder_enabled?: boolean;
  safety_buffer?: number;
}

export interface InventoryListResponse {
  items: InventoryItem[];
  total: number;
  page: number;
  page_size: number;
  low_stock_count: number;
}

/** POST /api/inventory/update — upsert by name */
export interface InventoryUpdateRequest {
  property_id: string;
  item_name: string;
  new_qty: number;
  unit?: string;
  trigger_prediction?: boolean;
}

export interface InventoryUpdateResponse {
  item_id: string;
  item_name: string;
  previous_qty: number | null;
  new_qty: number;
  created?: boolean;
  prediction_task_id?: string | null;
}

export interface BurnRateRecomputeRequest {
  lookback_days?: number;
  auto_calculate_reorder_point?: boolean;
  safety_buffer?: number;
}

export interface BurnRateRecomputeResponse {
  items_updated: number;
  lookback_days: number;
  auto_calculate_reorder_point: boolean;
  safety_buffer: number;
}

export interface RestockPreviewItem {
  item_id: string;
  name: string;
  unit: string;
  current_quantity: number;
  average_daily_usage: number;
  runout_days: number;
  needed_quantity: number;
  unit_cost: number;
  estimated_cost: number;
  reorder_point: number;
  auto_reorder_enabled: boolean;
}

export interface RestockVendorContact {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  website: string | null;
}

export interface RestockVendorGroup {
  vendor: RestockVendorContact;
  items: RestockPreviewItem[];
  total_estimated_cost: number;
  item_count: number;
}

export interface RestockPreviewResponse {
  runout_threshold_days: number;
  vendors: RestockVendorGroup[];
  generated_at: string;
}

export interface VendorOrderExportResponse {
  vendor_id: string;
  vendor: RestockVendorContact | null;
  html: string;
  email_subject: string;
  email_body: string;
  total_estimated_cost: number | null;
  item_count: number | null;
  currency_code?: string | null;
  currency_symbol?: string | null;
}

// ============================================================================
// Scans
// ============================================================================

export type ScanStatus = "pending" | "queued" | "processing" | "completed" | "partial_failed" | "failed";
export type ScanType = "receipt" | "barcode" | "full";

export interface Scan {
  id: string;
  property_id: string;
  user_id: string;
  status: ScanStatus;
  scan_type: ScanType;
  image_urls: string[];
  items_detected: number;
  confidence_score: number | null;
  processing_time_ms: number | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  stage_details?: Record<string, unknown> | null;
  stage_errors?: Array<Record<string, unknown>>;
}

export interface ExecutiveBriefingResponse {
  period_days: number;
  generated_at: string;
  bullets: string[];
  log_count: number;
}

export interface ScanRerunResponse {
  scan_id: string;
  status: string;
  hint: string;
}

export interface ScanQueuedResponse {
  scan_id: string;
  id?: string; // alias used by some backend versions
  status: string;
  message: string;
}

export interface ScanStatusResponse {
  scan_id: string;
  status: ScanStatus;
  processed: boolean;
  items_detected?: number;
  confidence_score?: number | null;
  error_message?: string | null;
  created_at: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  stage_details?: Record<string, unknown> | null;
  stage_errors?: Array<Record<string, unknown>>;
  /** Items extracted by AI (present when status === "completed") */
  extracted_items?: Record<string, unknown>[];
}

// ============================================================================
// Predictions
// ============================================================================

export type UrgencyLevel = "critical" | "urgent" | "soon" | "later";

/** Optional fields returned on stockout predictions (see backend `features_used`). */
export interface PredictionFeaturesUsed {
  urgency_bucket?: string;
  days_remaining?: number;
  avg_daily_consumption?: number;
  current_quantity?: number;
  pattern_confidence?: number;
  inventory_recency_days?: number | null;
  sample_size?: number;
  reason?: string;
}

export interface Prediction {
  id: string;
  property_id: string;
  item_id: string | null;
  prediction_type: string;
  prediction_date: string;
  predicted_value: number;
  confidence_interval_low: number | null;
  confidence_interval_high: number | null;
  confidence: number;
  model_version: string | null;
  actual_value: number | null;
  created_at: string;
  /** stockout urgency bucket */
  stockout_risk_level: UrgencyLevel | null;
  /** Denormalized item info */
  inventory_item: { id: string; name: string } | null;
  /** Present on stockout predictions from API when serialized */
  features_used?: PredictionFeaturesUsed | Record<string, unknown> | null;
  item_name?: string | null;
  days_until_runout?: number | null;
  time_horizon_days?: number | null;
  recommended_action?: string | null;
}

export interface ForecastQueuedResponse {
  job_id: string;
  status: string;
  message: string;
}

// ============================================================================
// Shopping Lists
// ============================================================================

export type ShoppingListStatus = "draft" | "approved" | "ordered" | "received";
export type ItemPriority = "critical" | "high" | "normal" | "low";

export interface ShoppingListItem {
  id: string;
  /** Present on ShoppingListDetailResponse items (full schema) */
  shopping_list_id?: string;
  inventory_item_id: string | null;
  name: string;
  quantity: number;
  unit: string;
  priority: ItemPriority;
  reason: string | null;
  estimated_price: number | null;
  actual_price: number | null;
  /** Standard field name used by full schema */
  is_purchased: boolean;
  /** Alias sent by ActiveShoppingListResponse (simplified schema) */
  checked?: boolean;
  purchased_at: string | null;
  created_at?: string;
}

/**
 * Normalises an item from either backend schema variant so that
 * `is_purchased` is always a reliable boolean regardless of which
 * endpoint returned the data (ActiveShoppingListResponse uses `checked`,
 * ShoppingListDetailResponse uses `is_purchased`).
 */
export function normalizeShoppingItem(item: ShoppingListItem): ShoppingListItem {
  return {
    ...item,
    is_purchased: item.checked ?? item.is_purchased ?? false,
  };
}

export interface ShoppingList {
  id: string;
  property_id: string;
  created_by_id: string;
  name: string;
  notes: string | null;
  status: ShoppingListStatus;
  total_estimated_cost: number | null;
  total_actual_cost: number | null;
  budget_limit: number | null;
  approved_at: string | null;
  approved_by_id: string | null;
  created_at: string;
  updated_at: string;
  item_count?: number | null;
}

export interface ShoppingListDetail extends ShoppingList {
  items: ShoppingListItem[];
}

export interface GenerateListRequest {
  property_id?: string;
  preferred_store?: string;
  /** If true, only include items with critical/urgent stockout risk */
  include_critical_only?: boolean;
  /** Minimum days of stock remaining before item is included */
  min_days_threshold?: number;
}

export interface GenerateListResponse {
  job_id: string;
  message: string;
  property_id: string;
}

export interface ApproveListResponse {
  id: string;
  status: ShoppingListStatus;
  approved_at: string;
}

// ============================================================================
// Zod runtime validators (for critical response shapes)
// ============================================================================

export const LoginResponseSchema = z.object({
  access_token: z.string(),
  token_type:   z.string(),
  expires_in:   z.number(),
  refresh_token: z.string().nullable().optional(),
  profile: z.object({
    user_id:       z.string(),
    email:         z.string().email(),
    full_name:     z.string().nullable().optional(),
    org_id:        z.string(),
    org_name:      z.string(),
    property_id:   z.string(),
    property_name: z.string(),
    role:          z.string(),
  }),
});

export const SignupResponseSchema = LoginResponseSchema;

// ============================================================================
// Generic API error shape
// ============================================================================

export interface ApiError {
  detail: string | Array<{ msg: string; loc: string[] }>;
  status?: number;
}

// ============================================================================
// Analytics
// ============================================================================

export interface SpendHistoryPoint {
  date:       string;
  amount:     number;
  cumulative: number;
}

export interface ConfidenceHistoryPoint {
  date:           string;
  avg_confidence: number;
  count:          number;
}

export interface CategoryBreakdownPoint {
  name:  string;
  value: number;
}

export interface UrgencyBreakdown {
  critical: number;
  urgent:   number;
  soon:     number;
  later:    number;
}

export interface AnalyticsSummary {
  spend_total:        number;
  avg_confidence_pct: number;
  items_tracked:      number;
  predictions_count:  number;
  scans_total:        number;
  spend_history:      SpendHistoryPoint[];
  inventory_value_history?: Array<{ date: string; value: number }>;
  confidence_history: ConfidenceHistoryPoint[];
  category_breakdown: CategoryBreakdownPoint[];
  urgency_breakdown:  UrgencyBreakdown;
}
