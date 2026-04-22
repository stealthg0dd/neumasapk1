"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Building2,
  CheckCircle2,
  Clock3,
  Sparkles,
  TrendingUp,
  Upload,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  getAnalyticsSummary,
  getDocumentReviewQueue,
  getOrgPropertyStockHealth,
  getRestockPreview,
  listAlerts,
  listPredictions,
  listScans,
  type Alert,
  type Document,
} from "@/lib/api/endpoints";
import type {
  AnalyticsSummary,
  OrgPropertyStockHealthResponse,
  Prediction,
  Scan,
} from "@/lib/api/types";
import { useAuthStore } from "@/lib/store/auth";
import { captureUIError } from "@/lib/analytics";
import { formatCurrency } from "@/lib/currency";
import { predictionReason, topOperationalRecommendation } from "@/lib/operations";
import { ExecutiveBriefing } from "@/components/dashboard/insights/ExecutiveBriefing";

const EMPTY_SUMMARY: AnalyticsSummary = {
  spend_total: 0,
  avg_confidence_pct: 0,
  items_tracked: 0,
  predictions_count: 0,
  scans_total: 0,
  spend_history: [],
  confidence_history: [],
  category_breakdown: [],
  urgency_breakdown: { critical: 0, urgent: 0, soon: 0, later: 0 },
};

type TrendPoint = { date: string; value: number };

function formatMoney(value: number): string {
  return formatCurrency(value, "USD");
}

function newestScanLabel(scans: Scan[]): string {
  if (!scans.length) return "No scans yet";
  const s = scans[0];
  if (!s.created_at) return "Recently updated";
  const created = new Date(s.created_at).toLocaleString();
  return `${s.status.replace(/_/g, " ")} • ${created}`;
}

export default function DashboardPage() {
  const profile = useAuthStore((s) => s.profile);
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  const [summary, setSummary] = useState<AnalyticsSummary>(EMPTY_SUMMARY);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [reviewQueue, setReviewQueue] = useState<Document[]>([]);
  const [inventoryTrend, setInventoryTrend] = useState<TrendPoint[]>([]);
  const [orgHealth, setOrgHealth] = useState<OrgPropertyStockHealthResponse | null>(null);
  const [forecastSpend7d, setForecastSpend7d] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        analyticsRes,
        alertsRes,
        predictionsRes,
        scansRes,
        reviewRes,
        restockRes,
        orgHealthRes,
      ] = await Promise.all([
        getAnalyticsSummary().catch(() => EMPTY_SUMMARY),
        listAlerts({ state: "open", page_size: 20 }).catch(() => ({ alerts: [], open_count: 0, page: 1, page_size: 20 })),
        listPredictions({ limit: 8 }).catch(() => []),
        listScans({ limit: 20 }).catch(() => []),
        getDocumentReviewQueue().catch(() => []),
        getRestockPreview({ runout_threshold_days: 7 }).catch(() => ({ vendors: [], runout_threshold_days: 7, generated_at: new Date().toISOString() })),
        isAdmin ? getOrgPropertyStockHealth().catch(() => null) : Promise.resolve(null),
      ]);

      setSummary(analyticsRes);
      setAlerts(alertsRes.alerts);
      setPredictions(predictionsRes);
      setScans(scansRes);
      setReviewQueue(reviewRes);
      setOrgHealth(orgHealthRes);
      setInventoryTrend((analyticsRes.inventory_value_history ?? []).map((point) => ({
        date: point.date,
        value: Number(point.value ?? 0),
      })));

      const spend = (restockRes.vendors ?? []).reduce((sum, vendor) => sum + Number(vendor.total_estimated_cost ?? 0), 0);
      setForecastSpend7d(Number(spend.toFixed(2)));
    } catch (err) {
      captureUIError("dashboard_command_center_load", err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const scanSuccessRate = useMemo(() => {
    if (!scans.length) return 0;
    const good = scans.filter((scan) => scan.status === "completed" || scan.status === "partial_failed").length;
    return Math.round((good / scans.length) * 100);
  }, [scans]);

  const criticalAlertsCount = useMemo(
    () => alerts.filter((a) => ["critical", "high"].includes(a.severity)).length,
    [alerts]
  );

  const predictedStockoutAlerts = useMemo(
    () => alerts.filter((a) => a.alert_type === "predicted_stockout"),
    [alerts]
  );

  const nextBestActionHref = scans.length === 0
    ? "/dashboard/scans/new"
    : predictedStockoutAlerts.length > 0
      ? "/dashboard/restock"
      : reviewQueue.length > 0
        ? "/dashboard/documents"
        : "/dashboard/predictions";

  const nextBestActionText = scans.length === 0
    ? "Upload your first receipt"
    : predictedStockoutAlerts.length > 0
      ? "Review restock recommendations"
      : reviewQueue.length > 0
        ? "Review scanned documents"
        : "Run a fresh forecast";
  const recommendation = topOperationalRecommendation(predictions, alerts);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Executive summary</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-900">Command Center</h1>
          <p className="mt-1 text-sm text-gray-500">{"Login -> scan -> analyze -> reorder -> repeat. Built for daily operator decisions."}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Refresh view
        </button>
      </div>

      {scans.length === 0 && (
        <div className="rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-cyan-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Welcome</p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">Start with one receipt. We handle the rest.</h2>
          <p className="mt-2 text-sm text-slate-600">
            Upload a receipt, let AI extract line items, generate your baseline, then get depletion risk and a ready-to-send shopping plan.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/dashboard/scans/new" className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800">
              <Upload className="h-4 w-4" />
              Upload receipt
            </Link>
            <Link href="/dashboard/scans" className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              What happens next
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Critical Alerts</p>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </div>
          <p className="mt-3 text-3xl font-bold text-gray-900">{criticalAlertsCount}</p>
          <p className="mt-1 text-xs text-gray-500">Items below reorder or predicted to stock out soon.</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Procurement Forecast</p>
            <TrendingUp className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-3 text-3xl font-bold text-gray-900">{formatMoney(forecastSpend7d)}</p>
          <p className="mt-1 text-xs text-gray-500">Estimated spend needed over the next 7 days.</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Scan Health</p>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-3 text-3xl font-bold text-gray-900">{scanSuccessRate}%</p>
          <p className="mt-1 text-xs text-gray-500">Success rate from recent OCR attempts ({scans.length} scans).</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.8fr_1fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Inventory Value Over Time</h3>
              <p className="text-xs text-gray-500">Estimated value trend from on-hand quantities and burn rate.</p>
            </div>
            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">14 days</span>
          </div>
          <div className="mt-4 h-[240px]">
            {loading ? (
              <div className="h-full animate-pulse rounded-xl bg-gray-100" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={inventoryTrend}>
                  <CartesianGrid strokeDasharray="2 2" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={58}
                    tickFormatter={(v) => `$${Math.round(Number(v))}`}
                  />
                  <Tooltip formatter={(v) => formatMoney(Number(v))} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#0f766e"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, fill: "#0f766e" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Latest Scan Status</p>
            <p className="mt-2 text-sm font-semibold text-gray-900">{newestScanLabel(scans)}</p>
            <p className="mt-2 text-xs text-gray-500">Processing quality improves after each approved document.</p>
            <Link href="/dashboard/scans" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:text-sky-800">
              Open scans
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Next Best Action</p>
            <p className="mt-2 text-sm font-semibold text-gray-900">{nextBestActionText}</p>
            <p className="mt-1 text-xs text-gray-500">Guided by scan freshness, predicted stockouts, and pending review queue.</p>
            <Link href={nextBestActionHref} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800">
              Continue journey
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          <ExecutiveBriefing />
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Recommended Next Move</h3>
                <p className="text-xs text-gray-500">The most urgent step in the scan to shopping loop.</p>
              </div>
              <Sparkles className="h-4 w-4 text-sky-700" />
            </div>
            {recommendation ? (
              <div className="mt-4 space-y-2">
                <p className="text-lg font-semibold text-gray-900">
                  {recommendation.itemName}
                </p>
                <p className="text-sm text-gray-600">
                  {recommendation.reason}
                </p>
                <p className="text-sm font-medium text-gray-800">
                  Action: {recommendation.action}
                  {recommendation.timeHorizonDays != null ? ` over the next ${recommendation.timeHorizonDays} day(s)` : ""}
                  {recommendation.confidence != null ? ` · confidence ${Math.round(recommendation.confidence * 100)}%` : ""}
                </p>
                <Link href="/dashboard/shopping" className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800">
                  Build shopping list
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-500">Run a fresh forecast to populate operational recommendations.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Upcoming Stockout Alerts</h3>
            <BellRing className="h-4 w-4 text-red-500" />
          </div>
          {!predictedStockoutAlerts.length ? (
            <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              No prediction-based alerts right now. Keep scanning receipts to maintain baseline confidence.
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {predictedStockoutAlerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="rounded-xl border border-red-100 bg-red-50 p-3">
                  <p className="text-sm font-semibold text-red-900">{alert.title}</p>
                  <p className="mt-1 text-xs text-red-700">{alert.body}</p>
                </div>
              ))}
            </div>
          )}
          <Link href="/dashboard/alerts" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:text-sky-800">
            View all alerts
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Baseline Insights & AI Recommendations</h3>
            <Sparkles className="h-4 w-4 text-violet-500" />
          </div>
          <div className="mt-3 space-y-2">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm">
              <p className="font-semibold text-gray-900">Inventory health snapshot</p>
              <p className="mt-1 text-xs text-gray-600">
                {summary.items_tracked} tracked items, {summary.urgency_breakdown.critical + summary.urgency_breakdown.urgent} high-risk forecast signals.
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm">
              <p className="font-semibold text-gray-900">Historical baseline confidence</p>
              <p className="mt-1 text-xs text-gray-600">
                Current confidence at {Math.round(summary.avg_confidence_pct)}%. More weekly scans improve trend stability.
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm">
              <p className="font-semibold text-gray-900">Recommendations</p>
              <ul className="mt-1 space-y-1 text-xs text-gray-600">
                {predictions.slice(0, 3).map((prediction) => (
                  <li key={prediction.id}>
                    {prediction.inventory_item?.name ?? "Item"}: {predictionReason(prediction)}
                  </li>
                ))}
                {predictions.length === 0 && <li>Run a new forecast to generate recommendation candidates.</li>}
              </ul>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/dashboard/predictions" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
              Open predictions
            </Link>
            <Link href="/dashboard/shopping" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
              Open shopping
            </Link>
            <Link href="/dashboard/analytics" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
              Open insights
            </Link>
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Global APAC Stock Health</h3>
              <p className="text-xs text-gray-500">Org-wide property overview with red-market escalation.</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
              <Building2 className="h-3.5 w-3.5" />
              {orgHealth?.properties.length ?? 0} properties
            </div>
          </div>

          {!orgHealth?.properties.length ? (
            <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              Global property summary is unavailable for this account.
            </div>
          ) : (
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {orgHealth.properties.map((property) => (
                <div
                  key={property.property_id}
                  className={[
                    "rounded-xl border p-3",
                    property.status === "red"
                      ? "border-red-200 bg-red-50"
                      : property.status === "amber"
                        ? "border-amber-200 bg-amber-50"
                        : "border-emerald-200 bg-emerald-50",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">{property.name}</p>
                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                      {property.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{property.region ?? property.country ?? "APAC"}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-white px-2 py-0.5 text-slate-700">Low: {property.low_stock}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-slate-700">Out: {property.out_of_stock}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-slate-700">Predicted: {property.predicted_stockout}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {Boolean(orgHealth?.red_count) && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              <Clock3 className="h-3.5 w-3.5" />
              {orgHealth?.red_count} properties currently red and need intervention.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
