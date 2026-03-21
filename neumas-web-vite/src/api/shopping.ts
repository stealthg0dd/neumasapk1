import { apiClient } from "./client";
import type { GenerateShoppingListResponse, ShoppingList } from "../types";

export async function listShoppingLists(
  propertyId: string
): Promise<ShoppingList[]> {
  const { data } = await apiClient.get<ShoppingList[] | { shopping_lists?: ShoppingList[] }>(
    `/api/shopping-list/${propertyId}`
  );
  if (Array.isArray(data)) return data;
  return (data as { shopping_lists?: ShoppingList[] }).shopping_lists ?? [];
}

export async function generateShoppingList(
  propertyId: string
): Promise<GenerateShoppingListResponse> {
  const { data } = await apiClient.post<GenerateShoppingListResponse>(
    `/api/shopping-list/generate?property_id=${propertyId}`,
    { property_id: propertyId }
  );
  return data;
}
