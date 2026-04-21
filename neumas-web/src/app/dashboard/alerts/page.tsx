"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageErrorState, PageLoadingState } from "@/components/ui/PageState";
import { listAlerts, snoozeAlert, resolveAlert, type Alert, type AlertsResponse } from "@/lib/api/endpoints";
import { captureUIError } from "@/lib/analytics";
import { toast } from "sonner";

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

const ALERT_TYPES = [
  { value: "", label: "All types" },
  { value: "low_stock", label: "Low stock" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "expiry_risk", label: "Expiry risk" },
  { value: "unusual_price_increase", label: "Price spike" },
  { value: "no_recent_scan", label: "No recent scan" },
];

const SEVERITIES = [
  { value: "", label: "All severity" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export default function AlertsPage() {
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [stateFilter, setStateFilter] = useState<string>("open");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const resp = await listAlerts({
        state: stateFilter === "all" ? undefined : stateFilter,
        alert_type: typeFilter || undefined,
        page_size: 50,
      });
      setData(resp);
    } catch (err) {
      setError("We couldn't load alerts right now.");
      captureUIError("load_alerts", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [stateFilter, typeFilter]);

  // Client-side severity filter (no backend param)
  const visibleAlerts = (data?.alerts ?? []).filter(
    (a) => !severityFilter || a.severity === severityFilter
  );

  async function handleSnooze(alert: Alert) {
    setActionId(alert.id);
    const until = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    try {
      await snoozeAlert(alert.id, until);
      await load();
      toast.success("Alert snoozed for 24 hours.");
    } catch (err) {
      captureUIError("snooze_alert", err);
    } finally {
      setActionId(null);
    }
  }

  async function handleResolve(alert: Alert) {
    setActionId(alert.id);
    try {
      await resolveAlert(alert.id);
      await load();
      toast.success("Alert resolved.");
    } catch (err) {
      captureUIError("resolve_alert", err);
    } finally {
      setActionId(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-gray-900 font-semibold text-lg">Alerts</h1>
          {data && (
            <p className="text-sm text-gray-500 mt-0.5">
              {data.open_count} open alert{data.open_count !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        {/* State filter tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 text-sm">
          {["open", "snoozed", "resolved", "all"].map((s) => (
            <button
              key={s}
              onClick={() => setStateFilter(s)}
              className={`px-3 py-1 rounded-md capitalize transition-colors ${
                stateFilter === s
                  ? "bg-white text-gray-900 shadow-sm font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Secondary filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {ALERT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {SEVERITIES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        {(typeFilter || severityFilter) && (
          <button
            onClick={() => { setTypeFilter(""); setSeverityFilter(""); }}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <PageLoadingState
          title="Loading alerts"
          message="Checking for low stock, expiry, and other issues."
        />
      ) : error ? (
        <PageErrorState title="Alerts unavailable" message={error} onRetry={() => void load()} />
      ) : !visibleAlerts.length ? (
        <EmptyState
          icon={ShieldCheck}
          badge="All clear"
          headline={
            stateFilter === "open"
              ? "No open alerts"
              : stateFilter === "snoozed"
              ? "No snoozed alerts"
              : "No alerts"
          }
          body={
            stateFilter === "open"
              ? typeFilter || severityFilter
                ? "No alerts match your current filters — try clearing them."
                : "Your inventory levels are healthy. We'll alert you immediately if anything needs attention."
              : "Nothing here right now."
          }
          secondaryCta={typeFilter || severityFilter ? { label: "Clear filters", href: "#" } : undefined}
        />
      ) : (
        <AnimatePresence initial={false}>
          {visibleAlerts.map((alert) => (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
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
                    {alert.state === "open" && (
                      <button
                        onClick={() => handleSnooze(alert)}
                        disabled={actionId === alert.id}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                      >
                        Snooze 24h
                      </button>
                    )}
                    <button
                      onClick={() => handleResolve(alert)}
                      disabled={actionId === alert.id}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 transition-colors"
                    >
                      Resolve
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </motion.div>
  );
}

