"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  Wand2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { getScan, getScanStatus, rerunScanWithHint } from "@/lib/api/endpoints";
import type { Scan, ScanStatusResponse } from "@/lib/api/types";
import { PageErrorState, PageLoadingState } from "@/components/ui/PageState";

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

function stageStatusClass(status: string | undefined): string {
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

export default function ScanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [scan, setScan] = useState<Scan | null>(null);
  const [status, setStatus] = useState<ScanStatusResponse | null>(null);
  const [hint, setHint] = useState("");
  const [rerunning, setRerunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [scanData, statusData] = await Promise.all([getScan(id), getScanStatus(id)]);
      setScan(scanData);
      setStatus(statusData);
    } catch {
      setError("We couldn't load this scan.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRerun() {
    if (!hint.trim()) {
      toast.error("Add a short hint so the OCR rerun knows what to correct.");
      return;
    }
    setRerunning(true);
    try {
      await rerunScanWithHint(id, hint.trim());
      toast.success("Scan queued for rerun.");
      setTimeout(() => void load(), 2500);
    } catch {
      toast.error("Unable to queue the rerun.");
    } finally {
      setRerunning(false);
    }
  }

  const stageDetails = useMemo(
    () => (status?.stage_details as Record<string, unknown> | null | undefined) ?? null,
    [status?.stage_details]
  );
  const stageErrors = status?.stage_errors ?? [];
  const extractedItems = status?.extracted_items ?? [];
  const StatusIcon = scanStatusIcon(status?.status ?? "queued");

  if (loading) {
    return <PageLoadingState title="Loading scan" message="Fetching OCR, inventory, and baseline progress." />;
  }

  if (error || !scan || !status) {
    return <PageErrorState title="Scan unavailable" message={error ?? "Scan not found"} onRetry={() => void load()} />;
  }

  const pipelineStages = [
    { key: "storage", label: "Storage" },
    { key: "ocr", label: "OCR extraction" },
    { key: "inventory", label: "Inventory update" },
    { key: "baseline", label: "Baseline recompute" },
    { key: "predictions", label: "Predictions recompute" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard/scans" className="text-sm font-medium text-sky-700 hover:underline">
          Back to scans
        </Link>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Scan detail</p>
            <div className="mt-2 flex items-center gap-2">
              <StatusIcon className={`h-5 w-5 ${status.status === "processing" ? "animate-spin text-sky-700" : "text-slate-700"}`} />
              <h1 className="text-2xl font-bold text-slate-900">
                {scan.scan_type} scan
              </h1>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {status.status.replace(/_/g, " ")} • {status.items_detected ?? 0} extracted items
              {status.confidence_score != null ? ` • ${Math.round(Number(status.confidence_score) * 100)}% confidence` : ""}
            </p>
          </div>
          <div className="grid gap-2 text-right text-sm text-slate-600">
            <span>{scan.created_at ? new Date(scan.created_at).toLocaleString() : "Recently queued"}</span>
            {status.started_at && <span>Started {new Date(status.started_at).toLocaleString()}</span>}
            {status.completed_at && <span>Completed {new Date(status.completed_at).toLocaleString()}</span>}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {pipelineStages.map((stage) => {
            const details = getStageBlock(stageDetails, stage.key);
            const stageStatus = typeof details?.status === "string" ? details.status : "pending";
            return (
              <div key={stage.key} className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{stage.label}</p>
                <span className={`mt-2 inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${stageStatusClass(stageStatus)}`}>
                  {stageStatusLabel(stageStatus)}
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

        {stageErrors.length > 0 && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">Pipeline warnings</p>
            <div className="mt-2 space-y-2 text-sm text-amber-800">
              {stageErrors.map((item, index) => (
                <p key={`${String(item.stage ?? "stage")}-${index}`}>
                  {String(item.stage ?? "stage")}: {String(item.error ?? "Unknown error")}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Extracted items</h2>
              <p className="text-sm text-slate-500">Review OCR output before you move to inventory and shopping decisions.</p>
            </div>
            <Link href="/dashboard/inventory" className="text-sm font-semibold text-sky-700 hover:text-sky-800">
              Inventory
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {extractedItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-slate-500">
                No extracted items are available yet. If OCR stalled or failed, use the rerun panel with a corrective hint.
              </div>
            ) : (
              extractedItems.map((item, index) => (
                <div key={`${String(item.name ?? item.item_name)}-${index}`} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {String(item.name ?? item.item_name ?? "Unknown item")}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {String(item.quantity ?? 1)} {String(item.unit ?? "unit")}
                      </p>
                    </div>
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">
                      {Math.round(Number(item.confidence ?? 0) * 100)}% confidence
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/dashboard/predictions" className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Open predictions
            </Link>
            <Link href="/dashboard/shopping" className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Open shopping
            </Link>
            <Link href="/dashboard/analytics" className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Open insights
            </Link>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-amber-700" />
              <p className="text-sm font-semibold text-amber-900">Rerun with hint</p>
            </div>
            <p className="mt-2 text-sm text-amber-800">
              Use this when OCR missed a multiplier, a packaging unit, or a vendor-specific item naming pattern.
            </p>
            <textarea
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              rows={5}
              className="mt-3 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-700"
              placeholder="Example: Treat Coke Zero 24x330ml as 24 cans, not 1 case."
            />
            <button
              type="button"
              disabled={rerunning}
              onClick={() => void handleRerun()}
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {rerunning ? "Queuing…" : "Queue rerun"}
            </button>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">What happens next</h2>
            <div className="mt-3 space-y-3 text-sm text-slate-600">
              <p>Inventory items are created or incremented from the extracted rows.</p>
              <p>The historical consumption baseline is recomputed from the latest scan history.</p>
              <p>Predictions refresh so stockout alerts and shopping actions stay current.</p>
            </div>
            <Link href="/dashboard" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:text-sky-800">
              Back to dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
