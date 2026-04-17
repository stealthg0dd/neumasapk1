"use client";

import type { AnalyticsSummary } from "@/lib/api/types";
import type { Vendor } from "@/lib/api/endpoints";
import { TrendingDown, TrendingUp } from "lucide-react";

interface SecondaryInsightsProps {
  analytics: AnalyticsSummary | null;
  vendors: Vendor[];
  loading: boolean;
}

function SkeletonBar({ width }: { width: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-3 w-20 animate-pulse rounded bg-gray-100" />
      <div className="flex-1 h-2 rounded-full bg-gray-100">
        <div className={`h-full animate-pulse rounded-full bg-gray-200 ${width}`} />
      </div>
      <div className="h-3 w-12 animate-pulse rounded bg-gray-100" />
    </div>
  );
}

export function SecondaryInsights({ analytics, vendors, loading }: SecondaryInsightsProps) {
  const categories = analytics?.category_breakdown ?? [];
  const spendHistory = analytics?.spend_history ?? [];

  // Calculate simple week-over-week from spend_history
  const totalSpend = spendHistory.reduce((s, p) => s + p.amount, 0);
  const halfLen = Math.floor(spendHistory.length / 2);
  const recentHalf = spendHistory.slice(halfLen).reduce((s, p) => s + p.amount, 0);
  const prevHalf = spendHistory.slice(0, halfLen).reduce((s, p) => s + p.amount, 0);
  const trendPct = prevHalf > 0 ? ((recentHalf - prevHalf) / prevHalf) * 100 : 0;

  const maxCat = Math.max(...categories.map((c) => c.value), 1);

  const PALETTE = ["bg-[#0071a3]", "bg-cyan-400", "bg-amber-400", "bg-emerald-400", "bg-purple-400", "bg-gray-300"];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Category spend */}
      <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm lg:col-span-2">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-gray-900">Category spend</h3>
          <div className="flex items-center gap-1.5">
            {trendPct !== 0 && (
              <span
                className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  trendPct < 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                }`}
              >
                {trendPct < 0 ? (
                  <TrendingDown className="h-3 w-3" />
                ) : (
                  <TrendingUp className="h-3 w-3" />
                )}
                {Math.abs(trendPct).toFixed(1)}%
              </span>
            )}
            <span className="text-[11px] text-gray-400">vs prior period</span>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => <SkeletonBar key={i} width={`w-${(i + 1) * 16}`} />)}
          </div>
        ) : categories.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-gray-400">
            No spend data — upload invoices to see category breakdown
          </p>
        ) : (
          <div className="space-y-3">
            {categories.slice(0, 6).map((cat, idx) => (
              <div key={cat.name} className="flex items-center gap-3">
                <p className="w-24 shrink-0 truncate text-[12px] text-gray-600">{cat.name}</p>
                <div className="flex-1 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${PALETTE[idx % PALETTE.length]}`}
                    style={{ width: `${(cat.value / maxCat) * 100}%` }}
                  />
                </div>
                <p className="w-16 text-right font-mono text-[12px] font-medium text-gray-700">
                  ${cat.value >= 1000 ? `${(cat.value / 1000).toFixed(1)}k` : cat.value.toFixed(0)}
                </p>
              </div>
            ))}
          </div>
        )}

        {!loading && categories.length > 0 && (
          <p className="mt-4 text-right font-mono text-[11px] text-gray-400">
            Total: ${totalSpend >= 1000 ? `${(totalSpend / 1000).toFixed(1)}k` : totalSpend.toFixed(0)}
          </p>
        )}
      </div>

      {/* Vendor price movement */}
      <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-[14px] font-semibold text-gray-900">Top vendors</h3>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="h-3 w-28 animate-pulse rounded bg-gray-100" />
                <div className="h-3 w-12 animate-pulse rounded bg-gray-100" />
              </div>
            ))}
          </div>
        ) : vendors.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-gray-400">
            No vendor data yet
          </p>
        ) : (
          <div className="space-y-2.5">
            {vendors.slice(0, 5).map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5">
                <div>
                  <p className="text-[12px] font-semibold text-gray-800 truncate max-w-[130px]">{v.name}</p>
                  {v.contact_email && (
                    <p className="text-[10px] text-gray-400 truncate max-w-[130px]">{v.contact_email}</p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-[#0071a3]/10 px-2 py-0.5 font-mono text-[10px] text-[#0071a3]">
                  Active
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
