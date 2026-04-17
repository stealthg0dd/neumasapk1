"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  FileText,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  FileDown,
} from "lucide-react";
import type { Alert, Document } from "@/lib/api/endpoints";
import type { Prediction } from "@/lib/api/types";
import type { UrgencyLevel } from "@/lib/api/types";
import { daysUntilStockout, confidenceToPercent } from "@/lib/prediction-display";
import { requestReport } from "@/lib/api/endpoints";

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high:     "bg-orange-500",
  medium:   "bg-amber-400",
  low:      "bg-gray-300",
};

const URGENCY_LABEL: Record<UrgencyLevel, string> = {
  critical: "Critical",
  urgent:   "Urgent",
  soon:     "Soon",
  later:    "Later",
};

interface ActionZoneProps {
  alerts: Alert[];
  reviewQueue: Document[];
  predictions: Prediction[];
  loading: boolean;
}

export function ActionZone({ alerts, reviewQueue, predictions, loading }: ActionZoneProps) {
  const [reportState, setReportState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleExportReport() {
    setReportState("loading");
    try {
      await requestReport("weekly_summary", {});
      setReportState("done");
      setTimeout(() => setReportState("idle"), 3000);
    } catch {
      setReportState("error");
      setTimeout(() => setReportState("idle"), 3000);
    }
  }

  const topAlerts = alerts.slice(0, 4);
  const topDocs = reviewQueue.slice(0, 4);
  const topPreds = predictions.slice(0, 4);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Open alerts */}
      <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="text-[14px] font-semibold text-gray-900">Open alerts</h3>
            {!loading && alerts.length > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-700">
                {alerts.length}
              </span>
            )}
          </div>
          <Link href="/dashboard/alerts" className="text-[11px] font-medium text-[#0071a3] hover:underline">
            View all
          </Link>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-50" />
            ))}
          </div>
        ) : topAlerts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            <p className="text-[12px] text-gray-400">No open alerts</p>
          </div>
        ) : (
          <div className="space-y-2">
            {topAlerts.map((a) => (
              <Link
                key={a.id}
                href="/dashboard/alerts"
                className="flex items-start gap-3 rounded-xl border border-transparent bg-gray-50 px-3 py-2.5 transition-colors hover:border-gray-200 hover:bg-white"
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[a.severity] ?? "bg-gray-300"}`} />
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-gray-800">{a.title}</p>
                  <p className="truncate text-[11px] text-gray-400">{a.alert_type.replace(/_/g, " ")}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Documents for review */}
      <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#0071a3]" />
            <h3 className="text-[14px] font-semibold text-gray-900">Needs review</h3>
            {!loading && topDocs.length > 0 && (
              <span className="rounded-full bg-[#0071a3]/10 px-2 py-0.5 font-mono text-[10px] font-bold text-[#0071a3]">
                {reviewQueue.length}
              </span>
            )}
          </div>
          <Link href="/dashboard/documents" className="text-[11px] font-medium text-[#0071a3] hover:underline">
            View all
          </Link>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-50" />
            ))}
          </div>
        ) : topDocs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            <p className="text-[12px] text-gray-400">Queue is clear</p>
          </div>
        ) : (
          <div className="space-y-2">
            {topDocs.map((d) => (
              <Link
                key={d.id}
                href="/dashboard/documents"
                className="flex items-center gap-3 rounded-xl border border-transparent bg-gray-50 px-3 py-2.5 transition-colors hover:border-gray-200 hover:bg-white"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0071a3]/10">
                  <FileText className="h-4 w-4 text-[#0071a3]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-gray-800">
                    {d.raw_vendor_name ?? d.document_type}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {d.review_reason ?? "Needs approval"}
                  </p>
                </div>
                <ArrowRight className="h-3 w-3 shrink-0 text-gray-300" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Reorder recommendations + export */}
      <div className="flex flex-col gap-4">
        {/* Reorder recs */}
        <div className="flex-1 rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-emerald-500" />
              <h3 className="text-[14px] font-semibold text-gray-900">Reorder now</h3>
            </div>
            <Link href="/dashboard/predictions" className="text-[11px] font-medium text-[#0071a3] hover:underline">
              All forecasts
            </Link>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-gray-50" />
              ))}
            </div>
          ) : topPreds.filter(p => ["critical","urgent"].includes(p.stockout_risk_level ?? "")).length === 0 ? (
            <p className="py-4 text-center text-[12px] text-gray-400">No urgent reorders</p>
          ) : (
            <div className="space-y-2">
              {topPreds
                .filter(p => ["critical","urgent"].includes(p.stockout_risk_level ?? ""))
                .slice(0, 3)
                .map(p => {
                  const days = daysUntilStockout(p.prediction_date);
                  const level = (p.stockout_risk_level ?? "later") as UrgencyLevel;
                  return (
                    <div key={p.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
                      <p className="text-[12px] font-semibold text-gray-800 truncate max-w-[120px]">
                        {p.inventory_item?.name ?? "Item"}
                      </p>
                      <span className={`font-mono text-[11px] font-bold ${level === "critical" ? "text-red-600" : "text-amber-600"}`}>
                        {days === 0 ? "Today" : `${days}d`}
                      </span>
                    </div>
                  );
                })
              }
            </div>
          )}
        </div>

        {/* Export report */}
        <button
          onClick={handleExportReport}
          disabled={reportState === "loading" || reportState === "done"}
          className={`flex items-center justify-center gap-2 rounded-2xl border px-5 py-4 text-[13px] font-semibold transition-all ${
            reportState === "done"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : reportState === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-[#0071a3]/30 bg-[#0071a3] text-white shadow-sm hover:bg-[#005f8a]"
          }`}
        >
          <FileDown className="h-4 w-4" />
          {reportState === "loading" ? "Generating…" :
           reportState === "done" ? "Report queued!" :
           reportState === "error" ? "Failed — retry" :
           "Export weekly report"}
        </button>
      </div>
    </div>
  );
}
