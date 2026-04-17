"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FileText } from "lucide-react";
import {
  getDocumentReviewQueue,
  listDocuments,
  approveDocument,
  type Document,
} from "@/lib/api/endpoints";
import { EmptyState } from "@/components/ui/EmptyState";
import EditableLineItems from "@/components/documents/EditableLineItems";

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  review: "bg-orange-100 text-orange-800",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [tab, setTab] = useState<"all" | "review">("review");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      if (tab === "review") {
        const docs = await getDocumentReviewQueue();
        setDocuments(docs);
      } else {
        const resp = await listDocuments({ page_size: 50 });
        setDocuments(resp.documents);
      }
    } catch {
      setError("Failed to load documents");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [tab]);

  async function handleApprove(doc: Document) {
    setApprovingId(doc.id);
    try {
      await approveDocument(doc.id);
      await load();
    } catch {
      // ignore
    } finally {
      setApprovingId(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <h1 className="text-gray-900 font-semibold text-lg">Documents</h1>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 text-sm">
          {(["review", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-md capitalize transition-colors ${
                tab === t
                  ? "bg-white text-gray-900 shadow-sm font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "review" ? "Needs Review" : "All"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
          Loading documents…
        </div>
      ) : error ? (
        <div className="border border-red-200 rounded-xl bg-red-50 p-4 text-red-700 text-sm">
          {error}
        </div>
      ) : !documents.length ? (
        <EmptyState
          icon={FileText}
          badge="No documents yet"
          headline={tab === "review" ? "Review queue is clear" : "No documents uploaded yet"}
          body={
            tab === "review"
              ? "All invoices and delivery notes have been reviewed. Upload more to keep inventory current."
              : "Upload an invoice, delivery note, or receipt to start building your live inventory."
          }
          cta={{ label: "Upload your first document", href: "/dashboard/scans/new" }}
        />
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="border border-gray-100 rounded-xl bg-white p-4 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[doc.status] ?? "bg-gray-100 text-gray-600"}`}
                    >
                      {doc.status}
                    </span>
                    <span className="text-xs text-gray-500 uppercase tracking-wide">
                      {doc.document_type}
                    </span>
                    {doc.overall_confidence != null && (
                      <span className="text-xs text-gray-400">
                        {Math.round(doc.overall_confidence * 100)}% confidence
                      </span>
                    )}
                  </div>
                  <p className="font-medium text-gray-900 mt-1 text-sm">
                    {doc.raw_vendor_name ?? "Unknown vendor"}
                  </p>
                  {doc.review_reason && (
                    <p className="text-xs text-orange-600 mt-0.5">{doc.review_reason}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(doc.created_at).toLocaleString()}
                  </p>
                </div>
                {doc.status !== "approved" && (
                  <button
                    onClick={() => handleApprove(doc)}
                    disabled={approvingId === doc.id}
                    className="text-xs px-3 py-1.5 rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 transition-colors shrink-0"
                  >
                    {approvingId === doc.id ? "Posting…" : "Approve & Post"}
                  </button>
                )}
              </div>
              {/* Editable line items table */}
              {doc.line_items && doc.line_items.length > 0 && (
                <EditableLineItems documentId={doc.id} lineItems={doc.line_items} />
              )}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
