import { apiClient } from "./client";
import type { InventoryItem } from "../types";

export async function listInventory(
  propertyId: string
): Promise<InventoryItem[]> {
  const { data } = await apiClient.get<InventoryItem[]>("/api/inventory/", {
    params: { property_id: propertyId },
  });
  return Array.isArray(data) ? data : [];
}
