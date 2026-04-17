/**
 * ReviewQueue — renders the list of documents pending human review.
 */
"use client";

import { type Document } from "@/lib/api/endpoints";
import { ConfidenceBadge } from "./ConfidenceBadge";

interface ReviewQueueProps {
  documents: Document[];
  approvingId: string | null;
  onApprove: (doc: Document) => void;
}

export function ReviewQueue({ documents, approvingId, onApprove }: ReviewQueueProps) {
  if (!documents.length) {
    return (
      <div className="border border-gray-100 rounded-xl bg-white p-8 text-center text-gray-400 text-sm">
        Review queue is empty
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {documents.map((doc) => (
        <div
          key={doc.id}
          className="border border-orange-100 rounded-xl bg-white p-4 flex items-start justify-between gap-3"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                needs review
              </span>
              <span className="text-xs text-gray-500 uppercase tracking-wide">
                {doc.document_type}
              </span>
              {doc.overall_confidence != null && (
                <ConfidenceBadge confidence={doc.overall_confidence} />
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

          <button
            onClick={() => onApprove(doc)}
            disabled={approvingId === doc.id}
            className="text-xs px-3 py-1.5 rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 transition-colors shrink-0"
          >
            {approvingId === doc.id ? "Posting…" : "Approve & Post"}
          </button>
        </div>
      ))}
    </div>
  );
}
