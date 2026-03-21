export interface AuthProfile {
  org_id: string;
  property_id: string;
  user_id: string;
  email: string;
  role: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  profile: AuthProfile;
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  category: { id: string; name: string } | null;
  reorder_point: number | null;
  is_active: boolean;
  created_at: string;
}

export interface Prediction {
  id: string;
  item_id: string | null;
  property_id: string;
  prediction_type: string;
  prediction_date: string;
  predicted_value: number;
  confidence: number;
  stockout_risk_level: string | null;
  inventory_item: { id: string; name: string } | null;
}

export interface ForecastQueuedResponse {
  job_id: string;
  status: string;
  message: string;
}

export interface ScanQueuedResponse {
  scan_id: string;
  status: string;
}

export interface ScanStatus {
  scan_id: string;
  status: string;
  processed: boolean;
  error_message: string | null;
  created_at: string | null;
}

export interface ShoppingList {
  id: string;
  property_id: string;
  status: string;
  total_estimated_cost: number | null;
  created_at: string;
  items: ShoppingListItem[];
}

export interface ShoppingListItem {
  id: string;
  item_name: string;
  quantity_needed: number;
  unit: string | null;
  estimated_cost: number | null;
  priority: string | null;
}

export interface GenerateShoppingListResponse {
  job_id?: string;
  id?: string;
  status: string;
}
