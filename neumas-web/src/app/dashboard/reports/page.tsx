"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { listReports, requestReport, type Report } from "@/lib/api/endpoints";

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-gray-100 text-gray-600",
  processing: "bg-blue-100 text-blue-700",
  ready: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

const REPORT_TYPES = [
  { value: "inventory_snapshot", label: "Inventory Snapshot" },
  { value: "spend_by_vendor", label: "Spend by Vendor" },
  { value: "waste_summary", label: "Waste Summary" },
  { value: "forecast_accuracy", label: "Forecast Accuracy" },
  { value: "low_stock_summary", label: "Low Stock Summary" },
];

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const resp = await listReports({ page_size: 20 });
      setReports(resp.reports);
    } catch {
      setError("Failed to load reports");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleRequest(reportType: string) {
    setRequesting(reportType);
    try {
      await requestReport(reportType);
      await load();
    } catch {
      // ignore
    } finally {
      setRequesting(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <h1 className="text-gray-900 font-semibold text-lg">Reports</h1>

      {/* Report type buttons */}
      <div className="border border-gray-100 rounded-xl bg-white p-4">
        <p className="text-sm font-medium text-gray-700 mb-3">Generate a new report</p>
        <div className="flex flex-wrap gap-2">
          {REPORT_TYPES.map((rt) => (
            <button
              key={rt.value}
              onClick={() => handleRequest(rt.value)}
              disabled={!!requesting}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {requesting === rt.value ? "Requesting…" : rt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Reports list */}
      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
          Loading reports…
        </div>
      ) : error ? (
        <div className="border border-red-200 rounded-xl bg-red-50 p-4 text-red-700 text-sm">
          {error}
        </div>
      ) : !reports.length ? (
        <div className="border border-gray-100 rounded-xl bg-white p-8 text-center text-gray-400 text-sm">
          No reports yet
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <div
              key={report.id}
              className="border border-gray-100 rounded-xl bg-white p-4 flex items-center justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[report.status] ?? "bg-gray-100 text-gray-600"}`}
                  >
                    {report.status}
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {REPORT_TYPES.find((r) => r.value === report.report_type)?.label ?? report.report_type}
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
          ))}
        </div>
      )}
    </motion.div>
  );
}
