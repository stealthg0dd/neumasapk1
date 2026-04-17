/**
 * AlertCard — renders a single alert with severity styling and action buttons.
 */
"use client";

import { type Alert } from "@/lib/api/endpoints";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-blue-100 text-blue-800 border-blue-200",
};

const STATE_BADGE: Record<string, string> = {
  open: "bg-red-50 text-red-700",
  snoozed: "bg-gray-100 text-gray-600",
  resolved: "bg-green-100 text-green-700",
};

interface AlertCardProps {
  alert: Alert;
  onSnooze?: (alert: Alert) => void;
  onResolve?: (alert: Alert) => void;
  loading?: boolean;
}

export function AlertCard({ alert, onSnooze, onResolve, loading = false }: AlertCardProps) {
  return (
    <div
      className={`border rounded-xl p-4 bg-white ${SEVERITY_COLORS[alert.severity] ?? "border-gray-200"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATE_BADGE[alert.state] ?? ""}`}
            >
              {alert.state}
            </span>
            <span className="text-xs text-gray-500 uppercase tracking-wide">
              {alert.alert_type.replace(/_/g, " ")}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide">
              {alert.severity}
            </span>
          </div>
          <p className="font-medium text-gray-900 mt-1">{alert.title}</p>
          <p className="text-sm text-gray-600 mt-0.5">{alert.body}</p>
          <p className="text-xs text-gray-400 mt-1">
            {new Date(alert.created_at).toLocaleString()}
          </p>
        </div>

        {alert.state !== "resolved" && (
          <div className="flex gap-2 shrink-0">
            {alert.state === "open" && onSnooze && (
              <button
                onClick={() => onSnooze(alert)}
                disabled={loading}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Snooze 24h
              </button>
            )}
            {onResolve && (
              <button
                onClick={() => onResolve(alert)}
                disabled={loading}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 transition-colors"
              >
                Resolve
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
