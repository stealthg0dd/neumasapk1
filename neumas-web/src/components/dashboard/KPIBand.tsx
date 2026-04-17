"use client";

import Link from "next/link";
import { FileText, TrendingDown, AlertTriangle, Calendar, type LucideIcon } from "lucide-react";
import type { AnalyticsSummary } from "@/lib/api/types";

interface KPIBandProps {
  analytics: AnalyticsSummary | null;
  lowStockCount: number;
  docsReviewCount: number;
  nextOrderDays: number | null;
  loading: boolean;
}

function KPICard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  href,
}: {
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  accent?: "amber" | "red" | "blue" | "teal";
  href?: string;
}) {
  const accentMap = {
    amber: "text-amber-500 bg-amber-50",
    red: "text-red-500 bg-red-50",
    blue: "text-[#0071a3] bg-[#f0f7fb]",
    teal: "text-emerald-600 bg-emerald-50",
  };
  const iconClass = accentMap[accent ?? "blue"];

  const inner = (
    <div className="flex items-start gap-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium tracking-wide text-gray-400 uppercase">{label}</p>
        <p className="mt-0.5 text-[22px] font-bold leading-none tracking-tight text-gray-900">{value}</p>
        <p className="mt-1 text-[12px] text-gray-400">{sub}</p>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm">
      {inner}
    </div>
  );
}

function KPISkeleton() {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-gray-100" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-gray-100" />
          <div className="h-6 w-16 animate-pulse rounded bg-gray-100" />
          <div className="h-3 w-20 animate-pulse rounded bg-gray-100" />
        </div>
      </div>
    </div>
  );
}

export function KPIBand({ analytics, lowStockCount, docsReviewCount, nextOrderDays, loading }: KPIBandProps) {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <KPISkeleton key={i} />)}
      </div>
    );
  }

  const spend = analytics?.spend_total ?? 0;
  const spendStr = spend >= 1000
    ? `$${(spend / 1000).toFixed(1)}k`
    : `$${spend.toFixed(0)}`;

  const nextOrderStr = nextOrderDays === null
    ? "—"
    : nextOrderDays === 0
    ? "Today"
    : nextOrderDays === 1
    ? "Tomorrow"
    : `${nextOrderDays} days`;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KPICard
        label="Spend this week"
        value={spendStr}
        sub="From processed invoices"
        icon={TrendingDown}
        accent="teal"
        href="/dashboard/analytics"
      />
      <KPICard
        label="Low stock items"
        value={String(lowStockCount)}
        sub={lowStockCount > 0 ? "Needs attention" : "All levels healthy"}
        icon={AlertTriangle}
        accent={lowStockCount > 0 ? "amber" : "teal"}
        href="/dashboard/inventory"
      />
      <KPICard
        label="Docs for review"
        value={String(docsReviewCount)}
        sub={docsReviewCount > 0 ? "Pending approval" : "Queue clear"}
        icon={FileText}
        accent={docsReviewCount > 0 ? "red" : "teal"}
        href="/dashboard/documents"
      />
      <KPICard
        label="Next order due"
        value={nextOrderStr}
        sub="Based on stockout forecast"
        icon={Calendar}
        accent="blue"
        href="/dashboard/predictions"
      />
    </div>
  );
}
