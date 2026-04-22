"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock,
  Loader2,
  RotateCcw,
} from "lucide-react";

import { GlassCard } from "@/components/ui/glass-card";
import { PageErrorState, PageLoadingState } from "@/components/ui/PageState";
import { listScans } from "@/lib/api/endpoints";
import type { Scan } from "@/lib/api/types";
import { captureUIError } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 3_000;

function statusConfig(s: string) {
  switch (s) {
    case "completed":
      return {
        Icon: CheckCircle2,
        iconClass: "text-emerald-500",
        badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
        label: "Completed",
      };
    case "processing":
      return {
        Icon: Loader2,
        iconClass: "text-blue-500 animate-spin",
        badge: "bg-blue-100 text-blue-800 border-blue-200",
        label: "Processing",
      };
    case "queued":
      return {
        Icon: Clock,
        iconClass: "text-amber-500",
        badge: "bg-amber-100 text-amber-800 border-amber-200",
        label: "Queued",
      };
    case "failed":
      return {
        Icon: AlertCircle,
        iconClass: "text-red-500",
        badge: "bg-red-100 text-red-800 border-red-200",
        label: "Failed",
      };
    case "partial_failed":
      return {
        Icon: AlertCircle,
        iconClass: "text-amber-500",
        badge: "bg-amber-100 text-amber-800 border-amber-200",
        label: "Completed with warnings",
      };
    default:
      return {
        Icon: Clock,
        iconClass: "text-gray-400",
        badge: "bg-gray-100 text-gray-600 border-gray-200",
        label: s,
      };
  }
}

function ScanRow({ scan }: { scan: Scan }) {
  const cfg = statusConfig(scan.status);
  const date = new Date(scan.created_at);

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <GlassCard className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn("mt-0.5 shrink-0", cfg.iconClass)}>
            <cfg.Icon className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium capitalize text-[var(--text-primary)]">
                {scan.scan_type} scan
              </p>
              <span
                className={cn(
                  "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  cfg.badge
                )}
              >
                {cfg.label}
              </span>
            </div>

            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              {date.toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}{" "}
              ·{" "}
              {date.toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>

            {scan.status === "completed" && scan.items_detected != null && (
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {scan.items_detected}{" "}
                {scan.items_detected === 1 ? "item" : "items"} detected
                {scan.confidence_score != null && (
                  <span className="ml-2 font-mono text-xs text-[var(--text-muted)]">
                    · {Math.round(Number(scan.confidence_score) * 100)}%
                    confidence
                  </span>
                )}
                {scan.processing_time_ms != null && (
                  <span className="ml-2 font-mono text-xs text-[var(--text-muted)]">
                    · {(scan.processing_time_ms / 1000).toFixed(1)}s
                  </span>
                )}
              </p>
            )}

            {(scan.status === "failed" || scan.status === "partial_failed") && scan.error_message && (
              <div className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2">
                <p className="text-xs font-medium text-red-700">Error</p>
                <p className="mt-0.5 text-xs text-red-600 break-words">
                  {scan.error_message}
                </p>
              </div>
            )}
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}

export default function ScansHistoryPage() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchScans(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    try {
      setError(null);
      const data = await listScans({ limit: 50 });
      setScans(data);
    } catch (err) {
      setError("We couldn't load scan history.");
      captureUIError("load_scan_history", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Initial load
  useEffect(() => {
    void fetchScans();
  }, []);

  // Auto-poll while any scan is in-flight; stop when all settle
  useEffect(() => {
    const hasInFlight = scans.some(
      (s) => s.status === "queued" || s.status === "processing"
    );

    if (hasInFlight && !pollRef.current) {
      pollRef.current = setInterval(() => void fetchScans(), POLL_INTERVAL_MS);
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
  }, [scans]);

  if (loading) {
    return (
      <PageLoadingState
        title="Loading scan history"
        message="Fetching your recent receipt scans."
      />
    );
  }

  if (error) {
    return (
      <PageErrorState
        title="Scan history unavailable"
        message={error}
        onRetry={() => {
          setLoading(true);
          void fetchScans();
        }}
      />
    );
  }

  const inFlight = scans.filter(
    (s) => s.status === "queued" || s.status === "processing"
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[clamp(1.5rem,6vw,2rem)] font-bold text-[var(--text-primary)]">
            Scan history
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
            <span>
              {scans.length} scan{scans.length === 1 ? "" : "s"}
            </span>
            {inFlight.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 border border-blue-100">
                <Loader2 className="h-3 w-3 animate-spin" />
                {inFlight.length} processing
              </span>
            )}
          </p>
        </div>

        <button
          type="button"
          disabled={refreshing}
          onClick={() => void fetchScans(true)}
          className="flex min-h-[40px] items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] disabled:opacity-50"
        >
          <RotateCcw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* List */}
      {scans.length === 0 ? (
        <GlassCard className="py-16 text-center">
          <Camera className="mx-auto mb-3 h-10 w-10 text-gray-200" />
          <p className="font-medium text-[var(--text-primary)]">No scans yet</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Upload a receipt from the{" "}
            <a href="/dashboard/scans/new" className="font-medium text-[#0071a3] hover:underline">
              New scan
            </a>{" "}
            page to get started.
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {scans.map((scan) => (
            <ScanRow key={scan.id} scan={scan} />
          ))}
        </div>
      )}
    </div>
  );
}
