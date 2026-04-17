"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAnalyticsSummary,
  listPredictions,
  listScans,
  listAlerts,
  getDocumentReviewQueue,
  listVendors,
} from "@/lib/api/endpoints";
import type { Alert, Document, Vendor } from "@/lib/api/endpoints";
import type { AnalyticsSummary, Prediction, Scan } from "@/lib/api/types";
import { captureUIError } from "@/lib/analytics";
import { sortPredictionsByUrgencyThenDays } from "@/lib/prediction-display";

import { KPIBand } from "@/components/dashboard/KPIBand";
import { IntelligencePanel } from "@/components/dashboard/IntelligencePanel";
import { SecondaryInsights } from "@/components/dashboard/SecondaryInsights";
import { ActionZone } from "@/components/dashboard/ActionZone";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";

function formatRelativeUpdated(iso: string | undefined): string {
  if (!iso) return "just now";
  const t = new Date(iso).getTime();
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [reviewQueue, setReviewQueue] = useState<Document[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(undefined);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sum, preds, recentScans, alertsRes, reviewDocs, vendorsRes] = await Promise.all([
        getAnalyticsSummary().catch(() => null),
        listPredictions({ limit: 10 }).catch(() => []),
        listScans({ limit: 10 }).catch(() => []),
        listAlerts({ state: "open", page_size: 10 }).catch(() => ({ alerts: [], open_count: 0, page: 1, page_size: 10 })),
        getDocumentReviewQueue().catch(() => []),
        listVendors({ page_size: 5 }).catch(() => ({ vendors: [], page: 1, page_size: 5 })),
      ]);

      setAnalytics(sum);
      setPredictions(sortPredictionsByUrgencyThenDays(preds as Prediction[]));
      setScans(recentScans as Scan[]);
      setAlerts(alertsRes.alerts);
      setReviewQueue(reviewDocs);
      setVendors(vendorsRes.vendors);
      setUpdatedAt(new Date().toISOString());
    } catch (err) {
      captureUIError("dashboard-load", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const lowStockCount = useMemo(() => {
    const urgency = analytics?.urgency_breakdown;
    if (!urgency) return 0;
    return urgency.critical + urgency.urgent;
  }, [analytics]);

  const nextOrderDays = useMemo(() => {
    const p = predictions.find((pr) =>
      ["critical", "urgent"].includes(pr.stockout_risk_level ?? "")
    );
    if (!p) return null;
    const d = new Date(p.prediction_date);
    const diff = Math.ceil((d.getTime() - Date.now()) / 86400000);
    return Math.max(0, diff);
  }, [predictions]);

  const updatedLabel = formatRelativeUpdated(updatedAt);

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        {/* Page header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight text-gray-900">
              Command center
            </h1>
            <p className="mt-0.5 text-[13px] text-gray-400">
              Your operation at a glance — updated {updatedLabel}
            </p>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 rounded-xl border border-black/[0.06] bg-white px-4 py-2 text-[12px] font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Zone 1: KPI band */}
        <KPIBand
          analytics={analytics}
          lowStockCount={lowStockCount}
          docsReviewCount={reviewQueue.length}
          nextOrderDays={nextOrderDays}
          loading={loading}
        />

        {/* Zone 2: Intelligence centerpiece */}
        <IntelligencePanel
          analytics={analytics}
          predictions={predictions}
          loading={loading}
          updatedLabel={updatedLabel}
        />

        {/* Zone 3: Secondary insights */}
        <SecondaryInsights
          analytics={analytics}
          vendors={vendors}
          loading={loading}
        />

        {/* Zone 4: Action zone */}
        <ActionZone
          alerts={alerts}
          reviewQueue={reviewQueue}
          predictions={predictions}
          loading={loading}
        />

        {/* Zone 5: Activity feed */}
        <ActivityFeed
          scans={scans}
          loading={loading}
        />
      </div>
    </div>
  );
}
