/**
 * ReportCard — displays a single report record with status and download link.
 */
"use client";

import { type Report } from "@/lib/api/endpoints";

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-gray-100 text-gray-600",
  processing: "bg-blue-100 text-blue-700",
  ready: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

const REPORT_LABELS: Record<string, string> = {
  inventory_snapshot: "Inventory Snapshot",
  spend_by_vendor: "Spend by Vendor",
  waste_summary: "Waste Summary",
  forecast_accuracy: "Forecast Accuracy",
  low_stock_summary: "Low Stock Summary",
};

interface ReportCardProps {
  report: Report;
}

export function ReportCard({ report }: ReportCardProps) {
  return (
    <div className="border border-gray-100 rounded-xl bg-white p-4 flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[report.status] ?? "bg-gray-100 text-gray-600"}`}
          >
            {report.status}
          </span>
          <span className="text-sm font-medium text-gray-900">
            {REPORT_LABELS[report.report_type] ?? report.report_type}
          </span>
          {report.deduplicated && (
            <span className="text-xs text-gray-400">(cached)</span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {new Date(report.created_at).toLocaleString()}
          {report.completed_at &&
            ` · completed ${new Date(report.completed_at).toLocaleString()}`}
        </p>
        {report.error_message && (
          <p className="text-xs text-red-600 mt-1">{report.error_message}</p>
        )}
      </div>

      {report.result_url && (
        <a
          href={report.result_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors shrink-0"
        >
          Download
        </a>
      )}
    </div>
  );
}
