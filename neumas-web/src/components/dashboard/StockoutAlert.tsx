"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ShoppingCart, Clock } from "lucide-react";
import Link from "next/link";
import type { Prediction, UrgencyLevel } from "@/lib/api/types";

// ── Urgency config ────────────────────────────────────────────────────────────

const URGENCY_CONFIG: Record<
  UrgencyLevel,
  { label: string; color: string; bg: string; border: string; dot: string }
> = {
  critical: {
    label:  "Critical",
    color:  "text-red-400",
    bg:     "bg-red-500/10",
    border: "border-red-500/30",
    dot:    "bg-red-500",
  },
  urgent: {
    label:  "Urgent",
    color:  "text-amber-400",
    bg:     "bg-amber-500/10",
    border: "border-amber-500/30",
    dot:    "bg-amber-500",
  },
  soon: {
    label:  "Soon",
    color:  "text-cyan-400",
    bg:     "bg-cyan-500/10",
    border: "border-cyan-500/30",
    dot:    "bg-cyan-500",
  },
  later: {
    label:  "Later",
    color:  "text-neutral-400",
    bg:     "bg-neutral-500/10",
    border: "border-neutral-500/30",
    dot:    "bg-neutral-500",
  },
};

// ── Single alert row ──────────────────────────────────────────────────────────

interface AlertRowProps {
  prediction: Prediction;
  index:      number;
}

function AlertRow({ prediction, index }: AlertRowProps) {
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const level   = prediction.stockout_risk_level ?? "later";
  const cfg     = URGENCY_CONFIG[level];
  const itemName = prediction.inventory_item?.name ?? "Unknown item";
  const daysLeft = Math.max(
    0,
    Math.ceil(
      (new Date(prediction.prediction_date).getTime() - nowTs) /
        (1000 * 60 * 60 * 24)
    )
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className={[
        "flex items-center gap-3 p-3 rounded-lg border transition-all hover:scale-[1.01]",
        cfg.bg,
        cfg.border,
      ].join(" ")}
    >
      {/* Urgency dot */}
      <div className={["w-2 h-2 rounded-full shrink-0 animate-pulse", cfg.dot].join(" ")} />

      {/* Item info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{itemName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {daysLeft === 0
              ? "Runs out today"
              : daysLeft === 1
              ? "Runs out tomorrow"
              : `Runs out in ${daysLeft} days`}
          </span>
        </div>
      </div>

      {/* Urgency badge */}
      <span
        className={[
          "text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0",
          cfg.color,
          cfg.bg,
          cfg.border,
        ].join(" ")}
      >
        {cfg.label}
      </span>

      {/* Order now */}
      <Link
        href="/dashboard/shopping"
        className="shrink-0 p-1.5 rounded-md bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-all"
        title="Add to shopping list"
      >
        <ShoppingCart className="w-3.5 h-3.5" />
      </Link>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface StockoutAlertProps {
  predictions: Prediction[];
  loading:     boolean;
}

export function StockoutAlert({ predictions, loading }: StockoutAlertProps) {
  const safe     = predictions ?? [];
  const critical = safe.filter((p) => p.stockout_risk_level === "critical");
  const urgent   = safe.filter((p) => p.stockout_risk_level === "urgent");
  const top5     = [...critical, ...urgent].slice(0, 5);

  return (
    <div className="glass-card rounded-2xl p-5 h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <motion.div
            animate={{ rotate: [0, -10, 10, -10, 0] }}
            transition={{ repeat: Infinity, repeatDelay: 3, duration: 0.5 }}
            className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center"
          >
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </motion.div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Stockout Alerts</h3>
            <p className="text-xs text-muted-foreground">
              {critical.length} critical · {urgent.length} urgent
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/predictions"
          className="text-xs text-cyan-500 hover:text-cyan-400 transition-colors font-medium"
        >
          View all →
        </Link>
      </div>

      {/* Alert list */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 rounded-lg shimmer" />
          ))}
        </div>
      ) : top5.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-mint-500/15 flex items-center justify-center mb-3">
            <span className="text-2xl">✓</span>
          </div>
          <p className="text-sm font-medium text-foreground/80">All stocked up</p>
          <p className="text-xs text-muted-foreground mt-1">
            No critical or urgent stockouts predicted.
          </p>
        </div>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
          className="space-y-2"
        >
          {top5.map((p, i) => (
            <AlertRow key={p.id} prediction={p} index={i} />
          ))}
          {safe.length > 5 && (
            <p className="text-xs text-center text-muted-foreground pt-1">
              +{safe.length - 5} more predictions
            </p>
          )}
        </motion.div>
      )}
    </div>
  );
}
