"use client";

import Link from "next/link";
import { BrainCircuit, TrendingUp } from "lucide-react";
import type { AnalyticsSummary, Prediction, UrgencyLevel } from "@/lib/api/types";
import { confidenceToPercent, daysUntilStockout } from "@/lib/prediction-display";

const URGENCY_STYLES: Record<UrgencyLevel, { bg: string; dot: string; text: string; badge: string }> = {
  critical: { bg: "bg-red-50 border-red-100", dot: "bg-red-500", text: "text-red-700", badge: "bg-red-100 text-red-700" },
  urgent:   { bg: "bg-amber-50 border-amber-100", dot: "bg-amber-500", text: "text-amber-700", badge: "bg-amber-100 text-amber-700" },
  soon:     { bg: "bg-yellow-50 border-yellow-100", dot: "bg-yellow-400", text: "text-yellow-700", badge: "bg-yellow-100 text-yellow-700" },
  later:    { bg: "bg-gray-50 border-gray-100", dot: "bg-gray-300", text: "text-gray-500", badge: "bg-gray-100 text-gray-600" },
};

interface IntelligencePanelProps {
  analytics: AnalyticsSummary | null;
  predictions: Prediction[];
  loading: boolean;
  updatedLabel: string;
}

function SkeletonIntelligence() {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <div className="h-8 w-8 animate-pulse rounded-xl bg-gray-100" />
        <div className="h-5 w-48 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-50" />
        ))}
      </div>
    </div>
  );
}

export function IntelligencePanel({ analytics, predictions, loading, updatedLabel }: IntelligencePanelProps) {
  if (loading) return <SkeletonIntelligence />;

  const urgency = analytics?.urgency_breakdown ?? { critical: 0, urgent: 0, soon: 0, later: 0 };
  const accuracyPct = Math.min(100, Math.max(0, analytics?.avg_confidence_pct ?? 0));
  const topPreds = predictions.slice(0, 4);

  const urgentTotal = urgency.critical + urgency.urgent;
  const anomalyLine =
    urgency.critical > 0
      ? `${urgency.critical} critical stockout${urgency.critical !== 1 ? "s" : ""} forecast this week`
      : urgency.urgent > 0
      ? `${urgency.urgent} urgent reorder${urgency.urgent !== 1 ? "s" : ""} needed`
      : "No critical alerts — procurement on track";

  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0071a3]/10">
            <BrainCircuit className="h-5 w-5 text-[#0071a3]" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900">AI Procurement Intelligence</h2>
            <p className="text-[11px] text-gray-400">Updated {updatedLabel}</p>
          </div>
        </div>
        <Link
          href="/dashboard/predictions"
          className="text-[12px] font-medium text-[#0071a3] hover:underline"
        >
          View all forecasts →
        </Link>
      </div>

      {/* Confidence + summary row */}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {/* Confidence */}
        <div className="rounded-xl bg-[#f0f7fb] p-4">
          <p className="text-[10px] font-medium tracking-widest text-[#0071a3] uppercase">Forecast confidence</p>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-[24px] font-bold tabular-nums text-gray-900">{accuracyPct}%</span>
            <TrendingUp className="mb-1 h-4 w-4 text-[#0071a3]" />
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#0071a3]/15">
            <div
              className="h-full rounded-full bg-[#0071a3] transition-all duration-700"
              style={{ width: `${accuracyPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-[10px] text-[#0071a3]/70">
            {analytics?.scans_total ?? 0} documents processed
          </p>
        </div>

        {/* Stockout window */}
        <div className="rounded-xl bg-gray-50 p-4">
          <p className="text-[10px] font-medium tracking-widest text-gray-400 uppercase">Stockout window</p>
          <p className="mt-2 text-[24px] font-bold text-gray-900">
            {topPreds.length > 0
              ? `${daysUntilStockout(topPreds[0].prediction_date)}d`
              : "—"}
          </p>
          <p className="mt-1 text-[11px] text-gray-500">
            {topPreds.length > 0
              ? `${topPreds[0].inventory_item?.name ?? "Item"} at risk`
              : "No near-term risks"}
          </p>
          <p className="mt-1.5 text-[10px] text-gray-400">
            {analytics?.predictions_count ?? 0} items forecast
          </p>
        </div>

        {/* Anomaly summary */}
        <div className={`rounded-xl p-4 ${urgentTotal > 0 ? "bg-amber-50" : "bg-emerald-50"}`}>
          <p className={`text-[10px] font-medium tracking-widest uppercase ${urgentTotal > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            Anomaly status
          </p>
          <p className={`mt-2 text-[14px] font-semibold leading-snug ${urgentTotal > 0 ? "text-amber-800" : "text-emerald-800"}`}>
            {anomalyLine}
          </p>
          <div className="mt-2 flex gap-2">
            {urgency.critical > 0 && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 font-mono text-[9px] font-semibold text-red-700">
                {urgency.critical} CRITICAL
              </span>
            )}
            {urgency.urgent > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[9px] font-semibold text-amber-700">
                {urgency.urgent} URGENT
              </span>
            )}
            {urgentTotal === 0 && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-mono text-[9px] font-semibold text-emerald-700">
                HEALTHY
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Top forecasts */}
      {topPreds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center">
          <p className="text-[13px] text-gray-400">No predictions yet — upload documents to start forecasting</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="mb-3 text-[10px] font-medium tracking-widest text-gray-400 uppercase">
            Top forecast alerts
          </p>
          {topPreds.map((p) => {
            const level = (p.stockout_risk_level ?? "later") as UrgencyLevel;
            const style = URGENCY_STYLES[level];
            const days = daysUntilStockout(p.prediction_date);
            const conf = confidenceToPercent(p.confidence);

            return (
              <div
                key={p.id}
                className={`flex items-center gap-4 rounded-xl border px-4 py-3 ${style.bg}`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-gray-900">
                    {p.inventory_item?.name ?? "Item"}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {conf}% confidence
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[13px] font-bold text-gray-900">
                    {days === 0 ? "Today" : days === 1 ? "1 day" : `${days} days`}
                  </p>
                  <span className={`inline-block rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold uppercase ${style.badge}`}>
                    {level}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
