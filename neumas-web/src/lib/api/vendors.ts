/**
 * Vendors API — re-exports from endpoints.ts for domain-scoped imports.
 *
 * Usage:
 *   import { listVendors, getVendor, listCatalogItems } from "@/lib/api/vendors";
 */
export {
  listVendors,
  getVendor,
  listCatalogItems,
  type Vendor,
} from "./endpoints";
