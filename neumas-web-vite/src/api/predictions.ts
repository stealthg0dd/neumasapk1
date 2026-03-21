import { apiClient } from "./client";
import type { ForecastQueuedResponse, Prediction } from "../types";

export async function listPredictions(
  propertyId: string,
  urgency?: string
): Promise<Prediction[]> {
  const { data } = await apiClient.get<Prediction[]>("/api/predictions/", {
    params: { property_id: propertyId, ...(urgency ? { urgency } : {}) },
  });
  return Array.isArray(data) ? data : [];
}

export async function triggerForecast(
  propertyId: string
): Promise<ForecastQueuedResponse> {
  const { data } = await apiClient.post<ForecastQueuedResponse>(
    "/api/predictions/forecast",
    { property_id: propertyId, forecast_days: 7 }
  );
  return data;
}
