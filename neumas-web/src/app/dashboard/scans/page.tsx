"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Clock3,
  Loader2,
  ScanLine,
  Sparkles,
  TrendingUp,
  XCircle,
} from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";
import { PageErrorState, PageLoadingState } from "@/components/ui/PageState";
import { captureUIError } from "@/lib/analytics";
import { listAlerts, listPredictions, listScans, type Alert } from "@/lib/api/endpoints";
import type { Prediction, Scan } from "@/lib/api/types";

const POLL_INTERVAL_MS = 3000;

function getStageBlock(
  stageDetails: Record<string, unknown> | null | undefined,
  key: string
): Record<string, unknown> | null {
  const value = stageDetails?.[key];
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function stageStatusLabel(status: string | undefined): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "running":
      return "Running";
    case "failed":
      return "Failed";
    case "partial_failed":
      return "Completed with warnings";
    case "skipped":
      return "Skipped";
    default:
      return "Pending";
  }
}

function stageBadgeClass(status: string | undefined): string {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "running":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "failed":
      return "border-red-200 bg-red-50 text-red-700";
    case "partial_failed":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "skipped":
      return "border-gray-200 bg-gray-50 text-gray-600";
    default:
      return "border-gray-200 bg-white text-gray-500";
  }
}

function scanStatusBadge(status: string): string {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "partial_failed":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "processing":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "queued":
      return "border-slate-200 bg-slate-50 text-slate-700";
    case "failed":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-gray-200 bg-white text-gray-600";
  }
}

function scanStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return CheckCircle2;
    case "partial_failed":
      return AlertTriangle;
    case "processing":
      return Loader2;
    case "failed":
      return XCircle;
    default:
      return Clock3;
  }
}

function nextActionHref(scan: Scan | null, alerts: Alert[], predictions: Prediction[]): string {
  if (!scan) return "/dashboard/scans/new";
  if (scan.status === "failed" || scan.status === "partial_failed") return `/dashboard/scans/${scan.id}`;
  if (alerts.some((alert) => alert.alert_type === "predicted_stockout")) return "/dashboard/alerts";
  if (predictions.length > 0) return "/dashboard/predictions";
  return "/dashboard/shopping";
}

function nextActionLabel(scan: Scan | null, alerts: Alert[], predictions: Prediction[]): string {
  if (!scan) return "Upload your first receipt";
  if (scan.status === "failed") return "Review the failed scan";
  if (scan.status === "partial_failed") return "Confirm extracted items and warnings";
  if (scan.status === "queued" || scan.status === "processing") return "Watch the scan pipeline";
  if (alerts.some((alert) => alert.alert_type === "predicted_stockout")) return "Resolve stockout alerts";
  if (predictions.length > 0) return "Review the latest forecast";
  return "Generate a shopping list";
}

export default function ScansPage() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      setError(null);
      const [scansRes, alertsRes, predictionsRes] = await Promise.all([
        listScans({ limit: 25 }),
        listAlerts({ state: "open", page_size: 12 }).catch(() => ({ alerts: [], open_count: 0, page: 1, page_size: 12 })),
        listPredictions({ limit: 8 }).catch(() => []),
      ]);
      setScans(scansRes);
      setAlerts(alertsRes.alerts);
      setPredictions(predictionsRes);
    } catch (err) {
      setError("We couldn't load your scan pipeline right now.");
      captureUIError("load_scans_workspace", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const hasInFlight = scans.some((scan) => scan.status === "queued" || scan.status === "processing");
    if (hasInFlight && !pollRef.current) {
      pollRef.current = setInterval(() => void load(), POLL_INTERVAL_MS);
    }
    if (!hasInFlight && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [load, scans]);

  const latestScan = scans[0] ?? null;
  const inFlightCount = useMemo(
    () => scans.filter((scan) => scan.status === "queued" || scan.status === "processing").length,
    [scans]
  );

  if (loading) {
    return (
      <PageLoadingState
        title="Loading scans"
        message="Checking upload queue, OCR progress, and downstream analysis."
      />
    );
  }

  if (error) {
    return (
      <PageErrorState
        title="Scans unavailable"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  if (!scans.length) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={ScanLine}
          badge="First run"
          headline="Start with one receipt"
          body="Upload a receipt and Neumas will queue the scan, extract line items, update inventory, recompute the baseline, and refresh predictions."
          cta={{ label: "Upload receipt", href: "/dashboard/scans/new" }}
          secondaryCta={{ label: "Open dashboard", href: "/dashboard" }}
        />
        <div className="grid gap-4 md:grid-cols-3">
          {[
            "Receipt uploaded and queued",
            "OCR extracts normalized line items",
            "Inventory, baseline, and predictions refresh",
          ].map((step, index) => (
            <div key={step} className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Step {index + 1}</p>
              <p className="mt-2 text-sm font-semibold text-gray-900">{step}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const LatestStatusIcon = scanStatusIcon(latestScan?.status ?? "queued");
  const latestStageDetails = (latestScan?.stage_details as Record<string, unknown> | null | undefined) ?? null;
  const pipelineStages = [
    { key: "storage", label: "Storage" },
    { key: "ocr", label: "OCR" },
    { key: "inventory", label: "Inventory" },
    { key: "baseline", label: "Baseline" },
    { key: "predictions", label: "Predictions" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Scans workspace</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-900">Receipt pipeline</h1>
          <p className="mt-1 text-sm text-gray-500">
            One upload path, live scan status, and a direct bridge into inventory, baseline insights, and shopping actions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/scans/new" className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800">
            <Camera className="h-4 w-4" />
            Upload receipt
          </Link>
          <button
            type="button"
            onClick={() => void load(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Latest scan</p>
              <div className="mt-2 flex items-center gap-2">
                <LatestStatusIcon className={`h-5 w-5 ${latestScan?.status === "processing" ? "animate-spin text-sky-700" : "text-slate-700"}`} />
                <h2 className="text-xl font-semibold text-gray-900">
                  {latestScan?.status.replace(/_/g, " ")}
                </h2>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {latestScan?.created_at ? new Date(latestScan.created_at).toLocaleString() : "Recently queued"}
              </p>
            </div>
            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${scanStatusBadge(latestScan?.status ?? "queued")}`}>
              {latestScan?.status.replace(/_/g, " ")}
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {pipelineStages.map((stage) => {
              const details = getStageBlock(latestStageDetails, stage.key);
              const status = typeof details?.status === "string" ? details.status : "pending";
              return (
                <div key={stage.key} className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{stage.label}</p>
                  <span className={`mt-2 inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${stageBadgeClass(status)}`}>
                    {stageStatusLabel(status)}
                  </span>
                  {typeof details?.elapsed_ms === "number" && (
                    <p className="mt-2 text-xs text-gray-500">{(Number(details.elapsed_ms) / 1000).toFixed(1)}s</p>
                  )}
                  {typeof details?.items_upserted === "number" && (
                    <p className="mt-2 text-xs text-gray-500">{details.items_upserted} items updated</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={`/dashboard/scans/${latestScan?.id}`} className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
              Open scan detail
            </Link>
            <Link href={nextActionHref(latestScan, alerts, predictions)} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              {nextActionLabel(latestScan, alerts, predictions)}
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">In-flight scans</p>
            <p className="mt-3 text-3xl font-bold text-gray-900">{inFlightCount}</p>
            <p className="mt-1 text-xs text-gray-500">Queued or processing right now.</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Open alerts</p>
            <p className="mt-3 text-3xl font-bold text-gray-900">{alerts.length}</p>
            <p className="mt-1 text-xs text-gray-500">Low stock, out-of-stock, and prediction-based issues.</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Forecast signals</p>
            <p className="mt-3 text-3xl font-bold text-gray-900">{predictions.length}</p>
            <p className="mt-1 text-xs text-gray-500">Prediction rows available for shopping and reorder planning.</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Recent scans</h2>
            <p className="text-sm text-gray-500">Track queue progress, warnings, and the downstream analysis trail.</p>
          </div>
          <Link href="/dashboard/scans/history" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:text-sky-800">
            Full history
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-4 space-y-3">
          {scans.slice(0, 8).map((scan) => {
            const Icon = scanStatusIcon(scan.status);
            const scanStageDetails = (scan.stage_details as Record<string, unknown> | null | undefined) ?? null;
            const ocrStage = getStageBlock(scanStageDetails, "ocr");
            const inventoryStage = getStageBlock(scanStageDetails, "inventory");
            const baselineStage = getStageBlock(scanStageDetails, "baseline");
            return (
              <Link key={scan.id} href={`/dashboard/scans/${scan.id}`} className="block rounded-2xl border border-gray-200 bg-gray-50 p-4 transition hover:border-sky-200 hover:bg-sky-50/40">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon className={`h-4 w-4 ${scan.status === "processing" ? "animate-spin text-sky-700" : "text-gray-700"}`} />
                      <p className="font-semibold text-gray-900">{scan.scan_type} scan</p>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${scanStatusBadge(scan.status)}`}>
                        {scan.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      {new Date(scan.created_at).toLocaleString()}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                      <span>OCR: {stageStatusLabel(typeof ocrStage?.status === "string" ? ocrStage.status : undefined)}</span>
                      <span>Inventory: {stageStatusLabel(typeof inventoryStage?.status === "string" ? inventoryStage.status : undefined)}</span>
                      <span>Baseline: {stageStatusLabel(typeof baselineStage?.status === "string" ? baselineStage.status : undefined)}</span>
                    </div>
                    {scan.error_message && (
                      <p className="mt-2 text-sm text-red-600">{scan.error_message}</p>
                    )}
                  </div>
                  <div className="text-right text-sm text-gray-600">
                    <p>{scan.items_detected ?? 0} items</p>
                    {scan.processing_time_ms != null && (
                      <p>{(scan.processing_time_ms / 1000).toFixed(1)}s</p>
                    )}
                    {scan.completed_at && <p>Done</p>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Link href="/dashboard/inventory" className="rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-sky-200">
          <h3 className="text-sm font-semibold text-gray-900">Inventory updated</h3>
          <p className="mt-2 text-sm text-gray-500">Review the on-hand items created or incremented from the latest receipt.</p>
        </Link>
        <Link href="/dashboard/analytics" className="rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-sky-200">
          <h3 className="text-sm font-semibold text-gray-900">Baseline insights</h3>
          <p className="mt-2 text-sm text-gray-500">See how recent scans changed the historical baseline and confidence trend.</p>
        </Link>
        <Link href="/dashboard/shopping" className="rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-sky-200">
          <h3 className="text-sm font-semibold text-gray-900">Shopping recommendations</h3>
          <p className="mt-2 text-sm text-gray-500">Turn forecast and low-stock signals into a reorder list after the scan settles.</p>
        </Link>
      </div>
    </div>
  );
}
