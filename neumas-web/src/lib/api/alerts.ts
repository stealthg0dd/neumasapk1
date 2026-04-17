/**
 * Alerts API — re-exports from endpoints.ts for domain-scoped imports.
 *
 * Usage:
 *   import { listAlerts, snoozeAlert, resolveAlert } from "@/lib/api/alerts";
 */
export {
  listAlerts,
  getAlert,
  snoozeAlert,
  resolveAlert,
  type Alert,
  type AlertsResponse,
} from "./endpoints";
