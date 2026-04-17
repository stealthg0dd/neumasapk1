/**
 * Reports API — re-exports from endpoints.ts for domain-scoped imports.
 *
 * Usage:
 *   import { listReports, requestReport, getReport } from "@/lib/api/reports";
 */
export {
  listReports,
  requestReport,
  getReport,
  type Report,
} from "./endpoints";
