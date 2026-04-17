/**
 * Neumas API — typed endpoint functions
 *
 * One function per backend route. All functions are fully typed against
 * the FastAPI schemas in types.ts.
 *
 * Auth: token is injected automatically by the Axios interceptor in client.ts
 */

import apiClient, { get, post, patch, del } from "./client";

/** Normalise GET /api/inventory/* list payloads (array or envelope). */
function normalizeInventoryListPayload(
  data: InventoryListResponse | Record<string, unknown>[]
): InventoryListResponse {
  if (Array.isArray(data)) {
    const items: InventoryItem[] = (data as Record<string, unknown>[]).map((item) => ({
      id: item.id as string,
      property_id: (item.property_id as string) ?? "",
      name: item.name as string,
      description: null,
      sku: (item.sku as string | null) ?? null,
      barcode: null,
      unit: (item.unit as string) ?? "unit",
      quantity: Number(item.quantity ?? 0),
      min_quantity: Number(item.min_quantity ?? 0),
      max_quantity: null,
      reorder_point: null,
      cost_per_unit: (item.cost_per_unit as number | null) ?? null,
      supplier_info: {},
      metadata: (item.metadata as Record<string, unknown>) ?? {},
      is_active: true,
      last_scanned_at: null,
      created_at: (item.created_at as string) ?? new Date().toISOString(),
      updated_at: (item.updated_at as string) ?? new Date().toISOString(),
      category: item.category
        ? (item.category as { id: string; name: string })
        : item.category_name
          ? { id: "", name: item.category_name as string }
          : null,
      stock_status: (item.stock_status as string) ?? "normal",
    }));
    return {
      items,
      total: items.length,
      page: 1,
      page_size: items.length,
      low_stock_count: items.filter(
        (i) => i.stock_status === "low_stock" || i.stock_status === "out_of_stock"
      ).length,
    };
  }
  return data as InventoryListResponse;
}
import type {
  LoginRequest,
  LoginResponse,
  SignupRequest,
  SignupResponse,
  ProfileResponse,
  InventoryItem,
  InventoryItemCreate,
  InventoryItemUpdate,
  InventoryListResponse,
  InventoryUpdateRequest,
  InventoryUpdateResponse,
  Scan,
  ScanQueuedResponse,
  ScanStatusResponse,
  Prediction,
  ForecastQueuedResponse,
  ShoppingList,
  ShoppingListDetail,
  GenerateListRequest,
  GenerateListResponse,
  AnalyticsSummary,
} from "./types";
import { LoginResponseSchema } from "./types";
/** POST /api/auth/google/complete — exchange Supabase JWT for Neumas JWT */
export async function googleComplete(supabaseAccessToken: string): Promise<LoginResponse> {
  // This endpoint expects the Supabase JWT as Bearer token, no body
  const data = await post<LoginResponse>(
    "/api/auth/google/complete",
    {},
    {
      headers: { Authorization: `Bearer ${supabaseAccessToken}` },
    }
  );
  return LoginResponseSchema.parse(data) as LoginResponse;
}
import { LoginResponseSchema, SignupResponseSchema } from "./types";

// ============================================================================
// Auth
// ============================================================================

/** POST /api/auth/login */
export async function login(req: LoginRequest): Promise<LoginResponse> {
  const data = await post<LoginResponse>("/api/auth/login", req);
  return LoginResponseSchema.parse(data) as LoginResponse;
}

/** POST /api/auth/signup */
export async function signup(req: SignupRequest): Promise<SignupResponse> {
  const data = await post<SignupResponse>("/api/auth/signup", req);
  return SignupResponseSchema.parse(data) as SignupResponse;
}

/** GET /api/auth/me */
export async function me(): Promise<ProfileResponse> {
  return get<ProfileResponse>("/api/auth/me");
}

/** POST /api/auth/logout */
export async function logout(): Promise<void> {
  await post<void>("/api/auth/logout");
}

/** POST /api/auth/refresh */
export async function refreshToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token?: string | null;
  expires_in: number;
  token_type: string;
}> {
  return post("/api/auth/refresh", { refresh_token: refreshToken });
}

// ============================================================================
// Scans
// ============================================================================

/** POST /api/scan/upload — multipart/form-data */
export async function uploadScan(
  file: File,
  scanType: "receipt" | "barcode" | "full",
): Promise<ScanQueuedResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("scan_type", scanType);

  const res = await apiClient.post<ScanQueuedResponse>("/api/scan/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

/** GET /api/scan/{scanId}/status */
export async function getScanStatus(scanId: string): Promise<ScanStatusResponse> {
  return get<ScanStatusResponse>(`/api/scan/${scanId}/status`);
}

/** GET /api/scan/{scanId} */
export async function getScan(scanId: string): Promise<Scan> {
  return get<Scan>(`/api/scan/${scanId}`);
}

/** GET /api/scan/ */
export async function listScans(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<Scan[]> {
  return get<Scan[]>("/api/scan/", params);
}

// ============================================================================
// Inventory
// ============================================================================

/** GET /api/inventory/ */
export async function listInventory(params?: {
  limit?: number;
  offset?: number;
  search?: string;
  stock_status?: string;
}): Promise<InventoryListResponse> {
  const data = await get<InventoryListResponse | Record<string, unknown>[]>("/api/inventory/", params);
  return normalizeInventoryListPayload(data);
}

/** GET /api/inventory/items — same payload as listInventory (proxied path). */
export async function listInventoryItems(params?: {
  limit?: number;
  offset?: number;
  search?: string;
  stock_status?: string;
}): Promise<InventoryListResponse> {
  const data = await get<InventoryListResponse | Record<string, unknown>[]>("/api/inventory/items", params);
  return normalizeInventoryListPayload(data);
}

/** GET /api/scan/recent */
export async function listRecentScans(params?: {
  limit?: number;
  offset?: number;
  status?: string;
}): Promise<Scan[]> {
  const data = await get<Scan[]>("/api/scan/recent", params);
  return Array.isArray(data) ? data : [];
}

/** POST /api/inventory/update — upsert by item name */
export async function upsertInventoryByName(
  req: InventoryUpdateRequest
): Promise<InventoryUpdateResponse> {
  return post<InventoryUpdateResponse>("/api/inventory/update", {
    ...req,
    unit: req.unit ?? "unit",
    trigger_prediction: req.trigger_prediction ?? true,
  });
}

/** PATCH /api/inventory/batch — chained upserts */
export async function batchInventoryUpdate(
  updates: InventoryUpdateRequest[]
): Promise<{ ok: boolean; results: InventoryUpdateResponse[] }> {
  return patch<{ ok: boolean; results: InventoryUpdateResponse[] }>("/api/inventory/batch", {
    updates,
  });
}

/** POST /api/scan — multipart (alias of upload path) */
export async function postScanUpload(
  file: File,
  scanType: "receipt" | "barcode" | "full"
): Promise<ScanQueuedResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("scan_type", scanType === "full" ? "receipt" : scanType);

  const res = await apiClient.post<ScanQueuedResponse>("/api/scan", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

/** GET /api/inventory/{itemId} */
export async function getInventoryItem(itemId: string): Promise<InventoryItem> {
  return get<InventoryItem>(`/api/inventory/${itemId}`);
}

/** POST /api/inventory/ */
export async function createInventoryItem(
  data: InventoryItemCreate
): Promise<InventoryItem> {
  return post<InventoryItem>("/api/inventory/", data);
}

/** PATCH /api/inventory/{itemId} */
export async function updateInventoryItem(
  itemId: string,
  data: InventoryItemUpdate
): Promise<InventoryItem> {
  return patch<InventoryItem>(`/api/inventory/${itemId}`, data);
}

/** DELETE /api/inventory/{itemId} */
export async function deleteInventoryItem(itemId: string): Promise<void> {
  return del<void>(`/api/inventory/${itemId}`);
}

/** PATCH /api/inventory/{itemId}/quantity/adjust — FastAPI uses query params */
export async function adjustQuantity(
  itemId: string,
  adjustment: number,
  reason?: string
): Promise<InventoryItem> {
  const res = await apiClient.patch<InventoryItem>(
    `/api/inventory/${itemId}/quantity/adjust`,
    {},
    { params: { adjustment, reason } }
  );
  return res.data;
}

// ============================================================================
// Predictions
// ============================================================================

/** GET /api/predictions/ */
export async function listPredictions(params?: {
  urgency?: string;
  limit?: number;
}): Promise<Prediction[]> {
  return get<Prediction[]>("/api/predictions/", params);
}

/** POST /api/predictions/forecast */
export async function triggerForecast(
  forecastDays = 7
): Promise<ForecastQueuedResponse> {
  return post<ForecastQueuedResponse>("/api/predictions/forecast", {
    forecast_days: forecastDays,
  });
}

// ============================================================================
// Shopping Lists
// ============================================================================

/** GET /api/shopping-list/ */
export async function listShoppingLists(params?: {
  status?: string;
  limit?: number;
}): Promise<ShoppingList[]> {
  return get<ShoppingList[]>("/api/shopping-list/", params);
}

/** GET /api/shopping-list/{listId} */
export async function getShoppingList(listId: string): Promise<ShoppingListDetail> {
  return get<ShoppingListDetail>(`/api/shopping-list/${listId}`);
}

/** POST /api/shopping-list/generate — enqueue Celery job */
export async function generateShoppingList(
  req: GenerateListRequest
): Promise<GenerateListResponse> {
  return post<GenerateListResponse>("/api/shopping-list/generate", req);
}

/** PATCH /api/shopping-list/{listId}/approve */
export async function approveShoppingList(listId: string): Promise<ShoppingList> {
  return patch<ShoppingList>(`/api/shopping-list/${listId}/approve`, {});
}

/** PATCH /api/shopping-list/{listId}/items/{itemId}/purchase */
export async function markItemPurchased(
  listId: string,
  itemId: string,
  actualPrice?: number
): Promise<void> {
  return patch<void>(`/api/shopping-list/${listId}/items/${itemId}/purchase`, {
    actual_price: actualPrice,
  });
}

// ============================================================================
// Analytics
// ============================================================================

/** GET /api/analytics/summary */
export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  return get<AnalyticsSummary>("/api/analytics/summary");
}

// ============================================================================
// Alerts
// ============================================================================

export interface Alert {
  id: string;
  org_id: string;
  property_id: string | null;
  item_id: string | null;
  alert_type: string;
  severity: "critical" | "high" | "medium" | "low";
  state: "open" | "snoozed" | "resolved";
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  snooze_until: string | null;
  resolved_at: string | null;
  resolved_by_id: string | null;
  created_at: string;
}

export interface AlertsResponse {
  alerts: Alert[];
  open_count: number;
  page: number;
  page_size: number;
}

/** GET /api/alerts/ */
export async function listAlerts(params?: {
  state?: string;
  alert_type?: string;
  page?: number;
  page_size?: number;
}): Promise<AlertsResponse> {
  return get<AlertsResponse>("/api/alerts/", params);
}

/** GET /api/alerts/{alertId} */
export async function getAlert(alertId: string): Promise<Alert> {
  return get<Alert>(`/api/alerts/${alertId}`);
}

/** POST /api/alerts/{alertId}/snooze */
export async function snoozeAlert(alertId: string, snoozeUntil: string): Promise<Alert> {
  return post<Alert>(`/api/alerts/${alertId}/snooze`, { snooze_until: snoozeUntil });
}

/** POST /api/alerts/{alertId}/resolve */
export async function resolveAlert(alertId: string): Promise<Alert> {
  return post<Alert>(`/api/alerts/${alertId}/resolve`, {});
}

// ============================================================================
// Reports
// ============================================================================

export interface Report {
  id: string;
  org_id: string;
  property_id: string | null;
  requested_by_id: string;
  report_type: string;
  params: Record<string, unknown>;
  status: "queued" | "processing" | "ready" | "failed";
  result_url: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  deduplicated?: boolean;
}

/** POST /api/reports/ */
export async function requestReport(
  reportType: string,
  params: Record<string, unknown> = {}
): Promise<Report> {
  return post<Report>("/api/reports/", { report_type: reportType, params });
}

/** GET /api/reports/ */
export async function listReports(params?: {
  report_type?: string;
  status?: string;
  page?: number;
  page_size?: number;
}): Promise<{ reports: Report[]; page: number; page_size: number }> {
  return get("/api/reports/", params);
}

/** GET /api/reports/{reportId} */
export async function getReport(reportId: string): Promise<Report> {
  return get<Report>(`/api/reports/${reportId}`);
}

// ============================================================================
// Documents
// ============================================================================

export interface DocumentLineItem {
  id: string;
  document_id: string;
  raw_name: string;
  raw_quantity: number | null;
  raw_unit: string | null;
  raw_price: number | null;
  raw_total: number | null;
  normalized_name: string | null;
  normalized_quantity: number | null;
  normalized_unit: string | null;
  canonical_item_id: string | null;
  confidence: number;
  review_needed: boolean;
  review_reason: string | null;
  movement_id: string | null;
}

export interface Document {
  id: string;
  org_id: string;
  property_id: string | null;
  scan_id: string | null;
  document_type: string;
  status: string;
  raw_vendor_name: string | null;
  vendor_id: string | null;
  overall_confidence: number | null;
  review_needed: boolean;
  review_reason: string | null;
  approved_by_id: string | null;
  approved_at: string | null;
  created_at: string;
  line_items?: DocumentLineItem[];
}

/** GET /api/documents/ */
export async function listDocuments(params?: {
  status?: string;
  review_needed?: boolean;
  page?: number;
  page_size?: number;
}): Promise<{ documents: Document[]; total: number; page: number; page_size: number }> {
  return get("/api/documents/", params);
}

/** GET /api/documents/review-queue */
export async function getDocumentReviewQueue(): Promise<Document[]> {
  return get<Document[]>("/api/documents/review-queue");
}

/** GET /api/documents/{documentId} */
export async function getDocument(documentId: string): Promise<Document> {
  return get<Document>(`/api/documents/${documentId}`);
}

/** POST /api/documents/{documentId}/approve */
export async function approveDocument(documentId: string, notes?: string): Promise<Record<string, unknown>> {
  return post(`/api/documents/${documentId}/approve`, { notes });
}

/** PATCH /api/documents/{documentId}/line-items/{lineItemId} */
export async function updateDocumentLineItem(
  documentId: string,
  lineItemId: string,
  updates: Partial<DocumentLineItem>
): Promise<DocumentLineItem> {
  return patch<DocumentLineItem>(`/api/documents/${documentId}/line-items/${lineItemId}`, updates);
}

// ============================================================================
// Vendors
// ============================================================================

export interface Vendor {
  id: string;
  org_id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

/** GET /api/vendors/ */
export async function listVendors(params?: {
  page?: number;
  page_size?: number;
}): Promise<{ vendors: Vendor[]; page: number; page_size: number }> {
  return get("/api/vendors/", params);
}

/** GET /api/vendors/{vendorId} */
export async function getVendor(vendorId: string): Promise<Vendor> {
  return get<Vendor>(`/api/vendors/${vendorId}`);
}

/** GET /api/vendors/catalog/items */
export async function listCatalogItems(params?: {
  category?: string;
  q?: string;
  page?: number;
  page_size?: number;
}): Promise<{ items: Record<string, unknown>[]; page: number; page_size: number }> {
  return get("/api/vendors/catalog/items", params);
}

// ============================================================================
// Admin
// ============================================================================

export interface AdminOrg {
  id: string;
  name: string;
  plan: string | null;
  created_at: string;
}

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

export interface AdminProperty {
  id: string;
  name: string;
  type: string | null;
  created_at: string;
}

export interface AdminUsage {
  documents_scanned: number;
  line_items_processed: number;
  exports_generated: number;
  active_users: number;
  active_properties: number;
  llm_calls: number;
  llm_cost_usd: number;
  period_days: number;
  period_start: string;
  period_end: string;
}

export interface SystemHealth {
  [key: string]: string | boolean | number;
}

export interface AuditEntry {
  id: string;
  org_id: string;
  property_id: string | null;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** GET /api/admin/org */
export async function getAdminOrg(): Promise<AdminOrg> {
  return get<AdminOrg>("/api/admin/org");
}

/** GET /api/admin/users */
export async function listAdminUsers(): Promise<AdminUser[]> {
  return get<AdminUser[]>("/api/admin/users");
}

/** GET /api/admin/properties */
export async function listAdminProperties(): Promise<AdminProperty[]> {
  return get<AdminProperty[]>("/api/admin/properties");
}

/** GET /api/admin/usage */
export async function getAdminUsage(params?: { days?: number }): Promise<AdminUsage> {
  return get<AdminUsage>("/api/admin/usage", params);
}

/** GET /api/admin/system-health */
export async function getSystemHealth(): Promise<SystemHealth> {
  return get<SystemHealth>("/api/admin/system-health");
}

/** GET /api/admin/audit-log */
export async function listAuditLog(params?: {
  resource_type?: string;
  resource_id?: string;
  actor_id?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: AuditEntry[]; total: number }> {
  return get("/api/admin/audit-log", params);
}

/** GET /api/admin/feature-flags */
export async function listFeatureFlags(): Promise<Record<string, boolean>> {
  return get<Record<string, boolean>>("/api/admin/feature-flags");
}

/** PATCH /api/admin/feature-flags/{flagName} */
export async function updateFeatureFlag(
  flagName: string,
  enabled: boolean
): Promise<Record<string, unknown>> {
  return patch(`/api/admin/feature-flags/${flagName}`, { enabled });
}

// ============================================================================
// Reorder
// ============================================================================

export interface ReorderRecommendation {
  item_id: string;
  name: string;
  unit: string | null;
  on_hand: number;
  par_level: number;
  projected_consumption: number;
  reorder_qty: number;
  urgency: "critical" | "urgent" | "soon" | "monitor";
  horizon_days: number;
  computed_at: string;
  reason: string;
}

/** GET /api/inventory/reorder-recommendations */
export async function getReorderRecommendations(params?: {
  horizon_days?: number;
  min_urgency?: string;
}): Promise<ReorderRecommendation[]> {
  return get<ReorderRecommendation[]>("/api/inventory/reorder-recommendations", params);
}

