/**
 * Documents API — re-exports from endpoints.ts for domain-scoped imports.
 *
 * Usage:
 *   import { listDocuments, getDocumentReviewQueue, approveDocument } from "@/lib/api/documents";
 */
export {
  listDocuments,
  getDocumentReviewQueue,
  getDocument,
  approveDocument,
  updateDocumentLineItem,
  type Document,
  type DocumentLineItem,
} from "./endpoints";
