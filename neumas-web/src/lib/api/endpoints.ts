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
