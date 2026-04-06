'use client'

"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { getAnalyticsSummary } from "@/lib/api/endpoints";
import type { AnalyticsSummary } from "@/lib/api/types";
import {
  AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  DollarSign, Package, TrendingUp, Target,
  Printer,
} from "lucide-react";
import { animate } from "framer-motion";
import { track } from "@/lib/analytics";

// ── Count-up ──────────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 1.6) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const ctrl = animate(0, target, {
      duration,
      ease: [0.23, 1, 0.32, 1],
      onUpdate: (v) => setVal(Math.round(v)),
    });
    return () => ctrl.stop();
  }, [target, duration]);
  return val;
}

// ── Brand palette for recharts ────────────────────────────────────────────────

const C = {
  cyan:    "oklch(0.715 0.139 199.2)",
  purple:  "oklch(0.699 0.220 303.9)",
  mint:    "oklch(0.765 0.177 162)",
  amber:   "oklch(0.769 0.188 84)",
  red:     "oklch(0.637 0.249 29)",
  muted:   "oklch(0.55 0.01 240)",
  surface: "oklch(0.13 0.008 240)",
  border:  "oklch(0.22 0.01 240 / 0.5)",
};

const CHART_DEFAULTS = {
  style: { fontFamily: "var(--font-geist-sans)", fontSize: 11 },
};

function CustomTooltip({ active, payload, label, prefix = "", suffix = "" }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  prefix?: string;
  suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-heavy rounded-xl border border-border/50 px-3 py-2.5 shadow-xl text-xs">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          {p.name}: {prefix}{p.value.toLocaleString()}{suffix}
        </p>
      ))}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  prefix = "",
  suffix = "",
  sub,
  iconBg,
  iconColor,
  index,
}: {
  icon:       React.ComponentType<{ className?: string }>;
  label:      string;
  value:      number;
  prefix?:    string;
  suffix?:    string;
  sub?:       string;
  iconBg:     string;
  iconColor:  string;
  index:      number;
}) {
  const count = useCountUp(value);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
      className="glass-card rounded-2xl p-5 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <div className={["w-8 h-8 rounded-lg flex items-center justify-center", iconBg].join(" ")}>
          <Icon className={["w-4 h-4", iconColor].join(" ")} />
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold tabular-nums tracking-tight gradient-text">
          {prefix}{count.toLocaleString()}{suffix}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </motion.div>
  );
}

// ── Chart card wrapper ────────────────────────────────────────────────────────

function ChartCard({
  title,
  subtitle,
  children,
  index,
  className = "",
}: {
  title:    string;
  subtitle?: string;
  children: React.ReactNode;
  index:    number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 + index * 0.08, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className={["glass-card rounded-2xl p-5", className].join(" ")}
    >
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </motion.div>
  );
}

// ── Skeleton shimmer ─────────────────────────────────────────────────────────

function SkeletonCard() {
  return <div className="h-28 rounded-2xl shimmer" />;
}

// ── Page ──────────────────────────────────────────────────────────────────────

const EMPTY_SUMMARY: AnalyticsSummary = {
  spend_total:        0,
  avg_confidence_pct: 0,
  items_tracked:      0,
  predictions_count:  0,
  scans_total:        0,
  spend_history:      [],
  confidence_history: [],
  category_breakdown: [],
  urgency_breakdown:  { critical: 0, urgent: 0, soon: 0, later: 0 },
};

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAnalyticsSummary()
      .then(setSummary)
      .catch(() => {/* keep defaults */})
      .finally(() => setLoading(false));
  }, []);

  const urgencyData = [
    { name: "Critical", value: summary.urgency_breakdown.critical, fill: C.red },
    { name: "Urgent",   value: summary.urgency_breakdown.urgent,   fill: C.amber },
    { name: "Soon",     value: summary.urgency_breakdown.soon,     fill: C.cyan },
    { name: "Later",    value: summary.urgency_breakdown.later,    fill: C.muted },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight gradient-text">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Performance overview · live data</p>
        </div>
        <button
          onClick={() => {
            track("pantry_report_generated", {
              items_tracked:      summary.items_tracked,
              predictions_count:  summary.predictions_count,
            });
            window.print();
          }}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-all"
          title="Print report"
        >
          <Printer className="w-4 h-4" />
        </button>
      </div>

      {/* Summary stats */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={DollarSign}
            label="Planned spend"
            value={Math.round(summary.spend_total)}
            prefix="$"
            sub="Total across all shopping lists"
            iconBg="bg-cyan-500/15"
            iconColor="text-cyan-400"
            index={0}
          />
          <StatCard
            icon={Package}
            label="Items tracked"
            value={summary.items_tracked}
            sub="Across all categories"
            iconBg="bg-purple-500/15"
            iconColor="text-purple-400"
            index={1}
          />
          <StatCard
            icon={TrendingUp}
            label="Predictions made"
            value={summary.predictions_count}
            sub="Stockout forecasts"
            iconBg="bg-amber-500/15"
            iconColor="text-amber-400"
            index={2}
          />
          <StatCard
            icon={Target}
            label="Avg confidence"
            value={Math.round(summary.avg_confidence_pct)}
            suffix="%"
            sub="Prediction confidence score"
            iconBg="bg-mint-500/15"
            iconColor="text-mint-500"
            index={3}
          />
        </div>
      )}

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* A — Planned spend over time */}
        <ChartCard
          title="Planned spend over time"
          subtitle="Cumulative shopping list value"
          index={0}
          className="lg:col-span-2"
        >
          {loading ? (
            <div className="h-[220px] rounded-xl shimmer" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={summary.spend_history} {...CHART_DEFAULTS}>
                <defs>
                  <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={C.cyan} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={C.cyan} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} width={48} />
                <Tooltip content={<CustomTooltip prefix="$" />} />
                <Area type="monotone" dataKey="cumulative" name="Cumulative spend" stroke={C.cyan} strokeWidth={2.5} fill="url(#spendGrad)" dot={false} activeDot={{ r: 4, fill: C.cyan, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* B — Urgency breakdown donut */}
        <ChartCard
          title="Prediction urgency"
          subtitle="Current stockout risk distribution"
          index={1}
        >
          {loading ? (
            <div className="h-[200px] rounded-xl shimmer" />
          ) : urgencyData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">
              No predictions yet — run a forecast first
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={urgencyData} cx="50%" cy="50%" innerRadius={48} outerRadius={70} dataKey="value" strokeWidth={0} animationDuration={800}>
                    {urgencyData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [`${v} items`, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1">
                {urgencyData.map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.fill }} />
                      <span className="text-muted-foreground">{d.name}</span>
                    </div>
                    <span className="font-semibold text-foreground">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartCard>

        {/* C — Category breakdown */}
        <ChartCard
          title="Category breakdown"
          subtitle="Items by category"
          index={2}
        >
          {loading ? (
            <div className="h-[200px] rounded-xl shimmer" />
          ) : summary.category_breakdown.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">
              No inventory data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={summary.category_breakdown} {...CHART_DEFAULTS} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                <Tooltip content={<CustomTooltip suffix=" items" />} />
                <Bar dataKey="value" name="Items" radius={[4, 4, 0, 0] as [number,number,number,number]} animationDuration={800}>
                  {summary.category_breakdown.map((_, i) => (
                    <Cell key={i} fill={([C.cyan, C.purple, C.mint, C.amber, C.red, C.muted] as string[])[i % 6]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* D — Prediction confidence over time */}
        <ChartCard
          title="Prediction confidence over time"
          subtitle="Average AI confidence score per day"
          index={3}
          className="lg:col-span-2"
        >
          {loading ? (
            <div className="h-[200px] rounded-xl shimmer" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={summary.confidence_history} {...CHART_DEFAULTS}>
                <defs>
                  <linearGradient id="confGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={C.purple} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={C.purple} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={36} />
                <Tooltip content={<CustomTooltip suffix="%" />} />
                <Legend wrapperStyle={{ fontSize: 11, color: C.muted }} iconType="circle" iconSize={8} />
                <Area type="monotone" dataKey="avg_confidence" name="Confidence %" stroke={C.purple} strokeWidth={2} fill="url(#confGrad)" dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
