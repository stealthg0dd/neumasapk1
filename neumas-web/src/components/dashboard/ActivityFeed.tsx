"use client";

import Link from "next/link";
import { Camera, CheckCircle2, XCircle, Clock, type LucideIcon } from "lucide-react";
import type { Scan } from "@/lib/api/types";

const STATUS_ICON: Record<string, LucideIcon> = {
  completed: CheckCircle2,
  failed:    XCircle,
  processing: Clock,
  queued:    Clock,
};

const STATUS_COLOR: Record<string, string> = {
  completed:  "text-emerald-500",
  failed:     "text-red-500",
  processing: "text-amber-500",
  queued:     "text-gray-400",
};

function formatRelative(dateStr: string): string {
  const d = new Date(dateStr);
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);

  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface ActivityFeedProps {
  scans: Scan[];
  loading: boolean;
}

export function ActivityFeed({ scans, loading }: ActivityFeedProps) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-gray-400" />
          <h3 className="text-[14px] font-semibold text-gray-900">Recent activity</h3>
        </div>
        <Link href="/dashboard/scans" className="text-[11px] font-medium text-[#0071a3] hover:underline">
          View all scans
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-9 w-9 animate-pulse rounded-xl bg-gray-100" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-32 animate-pulse rounded bg-gray-100" />
                <div className="h-2.5 w-24 animate-pulse rounded bg-gray-100" />
              </div>
              <div className="h-3 w-12 animate-pulse rounded bg-gray-100" />
            </div>
          ))}
        </div>
      ) : scans.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <Camera className="h-10 w-10 text-gray-200" />
          <p className="text-[13px] text-gray-400">No scans yet — upload your first document</p>
          <Link
            href="/dashboard/scans/new"
            className="rounded-xl bg-[#0071a3] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[#005f8a]"
          >
            Upload document
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-gray-100/80">
          {scans.map((scan) => {
            const StatusIcon = STATUS_ICON[scan.status] ?? Clock;
            const color = STATUS_COLOR[scan.status] ?? "text-gray-400";
            const time = scan.completed_at ?? scan.started_at ?? scan.created_at;

            return (
              <div key={scan.id} className="flex items-center gap-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50">
                  <Camera className="h-4 w-4 text-gray-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-gray-800 capitalize">
                    {scan.scan_type?.replace(/_/g, " ") ?? "Scan"}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {scan.items_detected != null
                      ? `${scan.items_detected} items · `
                      : ""}
                    {scan.confidence_score != null
                      ? `${Math.round(scan.confidence_score * 100)}% confidence`
                      : scan.status}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <StatusIcon className={`h-3.5 w-3.5 ${color}`} />
                  <span className="font-mono text-[10px] text-gray-400">{formatRelative(time)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
