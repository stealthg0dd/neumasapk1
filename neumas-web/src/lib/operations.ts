import type { Prediction, ShoppingListStatus } from "@/lib/api/types";
import type { Alert } from "@/lib/api/endpoints";

export function normalizeShoppingListStatus(status: string | null | undefined): ShoppingListStatus {
  switch (status) {
    case "approved":
    case "ordered":
    case "received":
      return status;
    case "active":
      return "approved";
    default:
      return "draft";
  }
}

export function predictionReason(prediction: Prediction): string {
  const features = prediction.features_used && typeof prediction.features_used === "object"
    ? prediction.features_used as Record<string, unknown>
    : null;
  const explicitReason = typeof features?.reason === "string" ? features.reason : null;
  if (explicitReason && explicitReason.trim()) return explicitReason.trim();

  const days = prediction.days_until_runout ?? prediction.time_horizon_days;
  if (typeof days === "number") {
    if (days <= 1) return "Current stock is likely to run out within a day at the present burn rate.";
    if (days <= 3) return `Current stock is projected to run out in about ${days} days.`;
    return `Current stock is projected to run out in about ${days} days unless replenished.`;
  }

  return "Recent baseline and inventory signals suggest this item needs attention.";
}

export function topOperationalRecommendation(
  predictions: Prediction[],
  alerts: Alert[] = []
): {
  title: string;
  itemName: string;
  reason: string;
  action: string;
  confidence: number | null;
  timeHorizonDays: number | null;
} | null {
  const criticalAlert = alerts.find((alert) => alert.alert_type === "predicted_stockout" || alert.alert_type === "out_of_stock");
  const topPrediction = predictions[0];

  if (topPrediction) {
    return {
      title: "Most urgent operational move",
      itemName: topPrediction.item_name ?? topPrediction.inventory_item?.name ?? "Inventory item",
      reason: predictionReason(topPrediction),
      action: topPrediction.recommended_action ?? "Add this item to the next shopping list.",
      confidence: topPrediction.confidence ?? null,
      timeHorizonDays: topPrediction.time_horizon_days ?? topPrediction.days_until_runout ?? null,
    };
  }

  if (criticalAlert) {
    return {
      title: "Most urgent operational move",
      itemName: criticalAlert.item_name ?? "Inventory item",
      reason: criticalAlert.baseline_context ?? criticalAlert.body,
      action: criticalAlert.recommended_action ?? "Review the alert and restock this item.",
      confidence: null,
      timeHorizonDays: null,
    };
  }

  return null;
}
