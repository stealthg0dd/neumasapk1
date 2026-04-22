"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Mail, RefreshCw, ShoppingBasket } from "lucide-react";
import { toast } from "sonner";

import {
  exportVendorOrder,
  getRestockPreview,
  recomputeBurnRate,
  setAutoReorder,
} from "@/lib/api/endpoints";
import type { RestockPreviewResponse, RestockVendorGroup } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { PageErrorState, PageLoadingState } from "@/components/ui/PageState";

function currency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

export default function RestockPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RestockPreviewResponse | null>(null);
  const [runoutThresholdDays, setRunoutThresholdDays] = useState(7);
  const [autoCalculateReorder, setAutoCalculateReorder] = useState(false);
  const [safetyBuffer, setSafetyBuffer] = useState(0);

  const fetchPreview = useCallback(async (days: number, isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const data = await getRestockPreview({ runout_threshold_days: days });
      setPreview(data);
    } catch {
      setError("Unable to load predictive restock recommendations.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchPreview(runoutThresholdDays);
  }, [fetchPreview, runoutThresholdDays]);

  const totals = useMemo(() => {
    const vendors = preview?.vendors ?? [];
    return {
      vendors: vendors.length,
      items: vendors.reduce((sum, v) => sum + v.item_count, 0),
      cost: vendors.reduce((sum, v) => sum + v.total_estimated_cost, 0),
    };
  }, [preview]);

  async function handleRecompute() {
    try {
      setRefreshing(true);
      await recomputeBurnRate({
        lookback_days: 30,
        auto_calculate_reorder_point: autoCalculateReorder,
        safety_buffer: safetyBuffer,
      });
      await fetchPreview(runoutThresholdDays, true);
      toast.success("Burn rates recomputed from the last 30 days.");
    } catch {
      toast.error("Failed to recompute burn rates.");
      setRefreshing(false);
    }
  }

  async function handleToggleAuto(vendor: RestockVendorGroup) {
    const targetEnabled = !autoCalculateReorder;
    try {
      for (const item of vendor.items) {
        await setAutoReorder(item.item_id, targetEnabled, safetyBuffer);
      }
      setAutoCalculateReorder(targetEnabled);
      await handleRecompute();
      toast.success(targetEnabled ? "Auto reorder points enabled." : "Auto reorder points disabled.");
    } catch {
      toast.error("Unable to toggle auto reorder points.");
    }
  }

  async function handleExport(vendorId: string) {
    try {
      const payload = await exportVendorOrder(vendorId, {
        runout_threshold_days: runoutThresholdDays,
      });

      const htmlBlob = new Blob([payload.html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(htmlBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `purchase-order-${vendorId}.html`;
      a.click();
      URL.revokeObjectURL(url);

      const email = payload.vendor?.contact_email;
      const subject = encodeURIComponent(payload.email_subject);
      const body = encodeURIComponent(payload.email_body);
      if (email) {
        window.open(`mailto:${email}?subject=${subject}&body=${body}`, "_blank", "noopener,noreferrer");
      }

      toast.success("Order summary generated. Use print-to-PDF from the downloaded file.");
    } catch {
      toast.error("Unable to generate vendor order export.");
    }
  }

  if (loading) {
    return <PageLoadingState title="Loading restock intelligence" message="Computing burn-rate risk by vendor." />;
  }

  if (error) {
    return <PageErrorState title="Restock recommendations unavailable" message={error} onRetry={() => void fetchPreview(runoutThresholdDays)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Predictive Restock</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upcoming stockout risk grouped by vendor with purchase-order previews.
          </p>
        </div>
        <Button onClick={() => void handleRecompute()} disabled={refreshing} className="bg-blue-600 hover:bg-blue-700 text-white">
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Recompute Burn Rate
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Vendors at risk</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">{totals.vendors}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Items to reorder</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">{totals.items}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Estimated total</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">{currency(totals.cost)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">Runout threshold (days)</span>
            <input
              type="number"
              min={1}
              max={30}
              value={runoutThresholdDays}
              onChange={(e) => setRunoutThresholdDays(Number(e.target.value || 7))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">Safety buffer (units)</span>
            <input
              type="number"
              min={0}
              step="0.5"
              value={safetyBuffer}
              onChange={(e) => setSafetyBuffer(Number(e.target.value || 0))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={autoCalculateReorder}
              onChange={(e) => setAutoCalculateReorder(e.target.checked)}
              className="h-4 w-4 accent-blue-600"
            />
            <span className="text-gray-700">Auto-calculate reorder point</span>
          </label>
        </div>
      </div>

      {(preview?.vendors ?? []).length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          No vendor groups currently need restocking under this threshold.
        </div>
      ) : (
        <div className="space-y-4">
          {(preview?.vendors ?? []).map((group) => (
            <section key={group.vendor.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{group.vendor.name}</h2>
                  <p className="text-xs text-gray-500">
                    {group.vendor.contact_email || "No email"} · {group.vendor.contact_phone || "No phone"}
                  </p>
                  <p className="text-xs text-gray-500">{group.vendor.address || "No address on file"}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Estimated PO total</p>
                  <p className="text-lg font-semibold text-gray-900">{currency(group.total_estimated_cost)}</p>
                </div>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500">
                      <th className="px-2 py-2">Item</th>
                      <th className="px-2 py-2">Current</th>
                      <th className="px-2 py-2">Burn/day</th>
                      <th className="px-2 py-2">Runout</th>
                      <th className="px-2 py-2">Order qty</th>
                      <th className="px-2 py-2">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => (
                      <tr key={item.item_id} className="border-t border-gray-100">
                        <td className="px-2 py-2 font-medium text-gray-900">{item.name}</td>
                        <td className="px-2 py-2">{item.current_quantity} {item.unit}</td>
                        <td className="px-2 py-2">{item.average_daily_usage}</td>
                        <td className="px-2 py-2">{item.runout_days} days</td>
                        <td className="px-2 py-2">{item.needed_quantity} {item.unit}</td>
                        <td className="px-2 py-2">{currency(item.estimated_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void handleToggleAuto(group)}>
                  <ShoppingBasket className="mr-2 h-4 w-4" />
                  {autoCalculateReorder ? "Disable" : "Enable"} Auto Reorder Point
                </Button>
                <Button onClick={() => void handleExport(group.vendor.id)} className="bg-blue-600 text-white hover:bg-blue-700">
                  <Download className="mr-2 h-4 w-4" />
                  Generate Order PDF/Email
                  <Mail className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
