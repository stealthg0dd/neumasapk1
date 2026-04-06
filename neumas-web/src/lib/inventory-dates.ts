import type { InventoryItem } from "@/lib/api/types";

/** Parse ISO expiry from item metadata when the backend stores it. */
export function getExpiryIso(item: InventoryItem): string | null {
  const m = item.metadata;
  if (!m || typeof m !== "object") return null;
  const raw =
    (m as Record<string, unknown>).expiry_date ??
    (m as Record<string, unknown>).expires_at ??
    (m as Record<string, unknown>).best_before;
  if (typeof raw === "string" && raw.length > 0) return raw;
  return null;
}

/** Days until expiry; negative if past. Null if no expiry. */
export function daysUntilExpiry(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const dayMs = 86_400_000;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(t);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / dayMs);
}

/**
 * Fresh / expiring / expired for pantry UX.
 * Spec: green >14d, amber 7–14d, red <7d (and expired).
 */
export function expiryTone(
  days: number | null
): "none" | "fresh" | "soon" | "urgent" | "expired" {
  if (days === null) return "none";
  if (days < 0) return "expired";
  if (days < 7) return "urgent";
  if (days <= 14) return "soon";
  return "fresh";
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Proteins: ["meat", "fish", "chicken", "beef", "pork", "egg", "protein", "tofu"],
  Grains: ["rice", "pasta", "oat", "flour", "bread", "cereal", "grain"],
  Dairy: ["milk", "cheese", "yogurt", "butter", "cream", "dairy"],
  Produce: ["fruit", "vegetable", "lettuce", "tomato", "produce", "herb"],
  Condiments: ["sauce", "oil", "vinegar", "spice", "salt", "condiment", "dressing"],
};

/** Map backend category name to pantry tab (fuzzy). */
export function pantryCategoryTab(categoryName: string | null | undefined): string {
  const n = (categoryName ?? "").toLowerCase();
  if (!n) return "Other";
  for (const [tab, keys] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keys.some((k) => n.includes(k))) return tab;
  }
  return categoryName ?? "Other";
}
