'use client'

"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence, animate } from "framer-motion";
import {
  TrendingUp, Sparkles, RefreshCw,
  ShoppingCart, ChevronDown, ChevronUp, Clock,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import { listPredictions, triggerForecast } from "@/lib/api/endpoints";
import { useAuthStore } from "@/lib/store/auth";
import type { Prediction, UrgencyLevel } from "@/lib/api/types";
import { track, captureUIError } from "@/lib/analytics";

// ── Zone config ────────────────────────────────────────────────────────────────

const ZONE_CONFIG: Record<UrgencyLevel, {
  label:   string;
  range:   string;
  color:   string;
  bg:      string;
  border:  string;
  glow:    string;
  dot:     string;
  textDim: string;
}> = {
  critical: {
    label:   "Critical",
    range:   "0 – 2 days",
    color:   "text-red-400",
    bg:      "bg-red-500/8",
    border:  "border-red-500/25",
    glow:    "hover:shadow-[0_0_24px_0_oklch(0.63_0.25_29_/_0.25)]",
    dot:     "bg-red-500",
    textDim: "text-red-400/70",
  },
  urgent: {
    label:   "Urgent",
    range:   "3 – 5 days",
    color:   "text-amber-400",
    bg:      "bg-amber-500/8",
    border:  "border-amber-500/25",
    glow:    "hover:shadow-[0_0_24px_0_oklch(0.79_0.18_84_/_0.2)]",
    dot:     "bg-amber-500",
    textDim: "text-amber-400/70",
  },
  soon: {
    label:   "Soon",
    range:   "6 – 13 days",
    color:   "text-cyan-400",
    bg:      "bg-cyan-500/8",
    border:  "border-cyan-500/25",
    glow:    "hover:shadow-[0_0_24px_0_oklch(0.715_0.139_199_/_0.2)]",
    dot:     "bg-cyan-500",
    textDim: "text-cyan-400/70",
  },
  later: {
    label:   "Later",
    range:   "14+ days",
    color:   "text-neutral-400",
    bg:      "bg-neutral-500/8",
    border:  "border-neutral-500/20",
    glow:    "",
    dot:     "bg-neutral-500",
    textDim: "text-neutral-400/60",
  },
};

// ── Radial confidence gauge ────────────────────────────────────────────────────

function RadialGauge({ value }: { value: number }) {
  // value 0–1
  const r   = 14;
  const circ = 2 * Math.PI * r;
  const dash = circ * value;

  return (
    <svg width={40} height={40} viewBox="0 0 40 40" className="shrink-0">
      {/* Track */}
      <circle cx={20} cy={20} r={r} fill="none" stroke="oklch(0.22 0.01 240 / 0.4)" strokeWidth={3} />
      {/* Fill */}
      <motion.circle
        cx={20} cy={20} r={r}
        fill="none"
        stroke={value >= 0.8 ? "#22d3ee" : value >= 0.6 ? "#f59e0b" : "#f87171"}
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ - dash }}
        transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
        style={{ transformOrigin: "center", rotate: "-90deg" }}
      />
      <text x={20} y={24} textAnchor="middle" fontSize={9} fontWeight={700} fill="currentColor" className="text-foreground">
        {Math.round(value * 100)}%
      </text>
    </svg>
  );
}

// ── Kinetic countdown ─────────────────────────────────────────────────────────

function Countdown({ days }: { days: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const ctrl = animate(0, days, {
      duration: 0.8,
      ease: [0.23, 1, 0.32, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => ctrl.stop();
  }, [days]);

  return (
    <span className="text-3xl font-bold tabular-nums tracking-tight">{display}</span>
  );
}

// ── Prediction card ───────────────────────────────────────────────────────────

function PredictionCard({
  prediction,
  index,
}: {
  prediction: Prediction;
  index:      number;
}) {
  const [expanded, setExpanded] = useState(false);
  const level = prediction.stockout_risk_level ?? "later";
  const cfg   = ZONE_CONFIG[level];

  const itemName = prediction.inventory_item?.name ?? "Unknown item";
  const daysLeft = Math.max(0, Math.ceil(
    (new Date(prediction.prediction_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  ));
  const confScore = prediction.confidence ?? 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06, duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
      className={[
        "rounded-2xl border p-4 transition-all cursor-pointer select-none",
        cfg.bg, cfg.border, cfg.glow,
        level === "critical" ? "animate-pulse-slow" : "",
      ].join(" ")}
      onClick={() => setExpanded((v) => !v)}
      whileHover={{ scale: 1.015 }}
    >
      {/* Main row */}
      <div className="flex items-center gap-4">
        {/* Urgency dot */}
        <div className={["w-2.5 h-2.5 rounded-full shrink-0 animate-pulse", cfg.dot].join(" ")} />

        {/* Item name */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{itemName}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {daysLeft === 0 ? "Runs out today" : daysLeft === 1 ? "Runs out tomorrow" : `${daysLeft} days left`}
            </span>
          </div>
        </div>

        {/* Days countdown */}
        <div className={["text-center shrink-0", cfg.color].join(" ")}>
          <Countdown days={daysLeft} />
          <p className="text-[10px] font-medium text-muted-foreground leading-none mt-0.5">days</p>
        </div>

        {/* Confidence radial */}
        <RadialGauge value={confScore} />

        {/* Urgency badge */}
        <span className={[
          "text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 hidden sm:inline",
          cfg.color, cfg.bg, cfg.border,
        ].join(" ")}>
          {cfg.label}
        </span>

        {/* Expand chevron */}
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-border/30 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Predicted value</p>
                <p className="text-sm font-semibold text-foreground">
                  {prediction.predicted_value.toFixed(2)}
                </p>
              </div>
              {prediction.confidence_interval_low !== null && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">CI Range</p>
                  <p className="text-sm font-semibold text-foreground">
                    {prediction.confidence_interval_low?.toFixed(1)} – {prediction.confidence_interval_high?.toFixed(1)}
                  </p>
                </div>
              )}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Prediction date</p>
                <p className="text-sm font-semibold text-foreground">
                  {new Date(prediction.prediction_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
              </div>
              {prediction.model_version && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Model</p>
                  <p className="text-sm font-semibold text-foreground">{prediction.model_version}</p>
                </div>
              )}
            </div>

            {level === "critical" && (
              <div className="mt-3 flex gap-2">
                <Link
                  href="/dashboard/shopping"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-all"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  Order now
                </Link>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Zone section ──────────────────────────────────────────────────────────────

function ZoneSection({
  level,
  predictions,
}: {
  level:       UrgencyLevel;
  predictions: Prediction[];
}) {
  const cfg = ZONE_CONFIG[level];

  if (predictions.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
    >
      {/* Zone header */}
      <div className="flex items-center gap-3 mb-3">
        <div className={["w-2.5 h-2.5 rounded-full", cfg.dot].join(" ")} />
        <h2 className={["text-sm font-bold uppercase tracking-widest", cfg.color].join(" ")}>
          {cfg.label}
        </h2>
        <span className="text-xs text-muted-foreground">{cfg.range}</span>
        <div className="flex-1 h-px bg-border/30" />
        <span className="badge-cyan">{predictions.length}</span>
      </div>

      {/* Cards */}
      <div className="space-y-2 pl-5">
        {predictions.map((p, i) => (
          <PredictionCard key={p.id} prediction={p} index={i} />
        ))}
      </div>
    </motion.section>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onTrigger, loading }: { onTrigger: () => void; loading: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card rounded-2xl p-12 flex flex-col items-center text-center gap-4"
    >
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 flex items-center justify-center">
        <TrendingUp className="w-8 h-8 text-cyan-400" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-foreground">No predictions yet</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          Run the AI forecast to analyse consumption patterns and predict stockout risks.
        </p>
      </div>
      <button
        onClick={onTrigger}
        disabled={loading}
        className="flex items-center gap-2 px-5 h-10 rounded-xl gradient-primary text-white text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60"
      >
        {loading ? (
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
        Run first forecast
      </button>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const URGENCY_ORDER: UrgencyLevel[] = ["critical", "urgent", "soon", "later"];

export default function PredictionsPage() {
  const propertyId = useAuthStore((s) => s.propertyId);

  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [triggering,  setTriggering]  = useState(false);
  const [filter,      setFilter]      = useState<UrgencyLevel | "all">("all");

  const fetchPredictions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPredictions({ limit: 100 });
      setPredictions(data);
      const critical = data.filter((p) => p.stockout_risk_level === "critical").length;
      const urgent   = data.filter((p) => p.stockout_risk_level === "urgent").length;
      track("predictions_loaded", { total: data.length, critical, urgent });
      if (critical > 0 || urgent > 0) {
        track("alert_triggered", {
          alert_type: "stockout",
          severity:   critical > 0 ? "critical" : "urgent",
          item_count: critical + urgent,
        });
      }
    } catch (err) {
      captureUIError("load_predictions", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPredictions(); }, [fetchPredictions]);

  async function handleTrigger() {
    setTriggering(true);
    try {
      await triggerForecast(14);
      toast.success("Forecast queued — analysing patterns…");
      track("forecast_triggered", { window_days: 14 });
      // Poll every 3 s for up to 45 s, stop early if new predictions appear
      const before = predictions.length;
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const data = await listPredictions({ limit: 100 });
          if (data.length !== before || attempts >= 15) {
            clearInterval(poll);
            setPredictions(data);
            if (data.length > before) toast.success("Predictions updated!");
          }
        } catch {
          if (attempts >= 15) clearInterval(poll);
        }
      }, 3000);
    } catch (err) {
      captureUIError("trigger_forecast", err);
    } finally {
      setTriggering(false);
    }
  }

  // ── Filter + group ─────────────────────────────────────────────────────────

  const filtered = filter === "all"
    ? predictions
    : predictions.filter((p) => p.stockout_risk_level === filter);

  const grouped = URGENCY_ORDER.reduce((acc, level) => {
    acc[level] = filtered.filter((p) => p.stockout_risk_level === level);
    return acc;
  }, {} as Record<UrgencyLevel, Prediction[]>);

  const counts = URGENCY_ORDER.reduce((acc, level) => {
    acc[level] = predictions.filter((p) => p.stockout_risk_level === level).length;
    return acc;
  }, {} as Record<UrgencyLevel, number>);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight gradient-text">Predictions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            AI stockout forecast · next 14 days
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchPredictions}
            disabled={loading}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-all"
            title="Refresh"
          >
            <RefreshCw className={["w-4 h-4", loading ? "animate-spin" : ""].join(" ")} />
          </button>
          <button
            onClick={handleTrigger}
            disabled={triggering}
            className="flex items-center gap-2 px-3 h-9 rounded-lg text-sm gradient-primary text-white font-semibold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {triggering ? (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Trigger forecast
          </button>
        </div>
      </div>

      {/* Summary chips */}
      {!loading && predictions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("all")}
            className={[
              "px-3 h-7 rounded-full text-xs font-semibold border transition-all",
              filter === "all"
                ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40"
                : "text-muted-foreground border-border/40 hover:border-border/70",
            ].join(" ")}
          >
            All · {predictions.length}
          </button>
          {URGENCY_ORDER.map((level) => {
            if (counts[level] === 0) return null;
            const cfg = ZONE_CONFIG[level];
            return (
              <button
                key={level}
                onClick={() => setFilter(level)}
                className={[
                  "px-3 h-7 rounded-full text-xs font-semibold border transition-all",
                  filter === level
                    ? [cfg.bg, cfg.color, cfg.border].join(" ")
                    : "text-muted-foreground border-border/40 hover:border-border/70",
                ].join(" ")}
              >
                {cfg.label} · {counts[level]}
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-24 rounded shimmer" />
              {[...Array(2)].map((_, j) => (
                <div key={j} className="h-16 rounded-2xl shimmer" />
              ))}
            </div>
          ))}
        </div>
      ) : predictions.length === 0 ? (
        <EmptyState onTrigger={handleTrigger} loading={triggering} />
      ) : (
        <div className="space-y-8">
          {URGENCY_ORDER.map((level) => (
            <ZoneSection key={level} level={level} predictions={grouped[level]} />
          ))}
        </div>
      )}
    </div>
  );
}
