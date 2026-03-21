import { apiClient } from "./client";
import type { ScanQueuedResponse, ScanStatus } from "../types";

export async function uploadScan(
  file: File,
  scanType: string,
  propertyId: string
): Promise<ScanQueuedResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("scan_type", scanType);

  const { data } = await apiClient.post<ScanQueuedResponse>(
    `/api/scan/upload?property_id=${propertyId}`,
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return data;
}

export async function getScanStatus(scanId: string): Promise<ScanStatus> {
  const { data } = await apiClient.get<ScanStatus>(
    `/api/scan/${scanId}/status`
  );
  return data;
}
