'use client'

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import {
  ArrowLeft, CheckCircle2, Circle, ShoppingCart,
  ExternalLink, ThumbsUp, DollarSign, Package,
  GripVertical, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { use } from "react";

import { getShoppingList, approveShoppingList, markItemPurchased } from "@/lib/api/endpoints";
import type { ShoppingListDetail, ShoppingListItem, ItemPriority } from "@/lib/api/types";
import { track, captureUIError } from "@/lib/analytics";
import { PageErrorState, PageLoadingState } from "@/components/ui/PageState";

// ── Priority config ────────────────────────────────────────────────────────────

const PRIORITY_CFG: Record<ItemPriority, { badge: string; dot: string }> = {
  critical: { badge: "badge-red",    dot: "bg-red-500" },
  high:     { badge: "badge-amber",  dot: "bg-amber-500" },
  normal:   { badge: "badge-cyan",   dot: "bg-cyan-500" },
  low:      { badge: "badge-purple", dot: "bg-neutral-500" },
};

// ── Checkbox item ─────────────────────────────────────────────────────────────

function CheckItem({
  item,
  onToggle,
  toggling,
}: {
  item:     ShoppingListItem;
  onToggle: (id: string) => Promise<void>;
  toggling: string | null;
}) {
  const cfg     = PRIORITY_CFG[item.priority ?? "normal"];
  const loading = toggling === item.id;

  return (
    <Reorder.Item
      value={item}
      className={[
        "flex items-center gap-3 p-3.5 rounded-xl border transition-all group",
        "glass-button border-border/30 hover:border-border/60",
        item.is_purchased ? "opacity-50" : "",
      ].join(" ")}
    >
      {/* Drag handle */}
      <GripVertical className="w-4 h-4 text-muted-foreground/30 shrink-0 cursor-grab active:cursor-grabbing" />

      {/* Checkbox */}
      <button
        onClick={() => onToggle(item.id)}
        disabled={loading}
        className="shrink-0 transition-transform active:scale-90"
      >
        {loading ? (
          <span className="w-5 h-5 border-2 border-cyan-500/40 border-t-cyan-500 rounded-full animate-spin block" />
        ) : item.is_purchased ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            <CheckCircle2 className="w-5 h-5 text-mint-500" />
          </motion.div>
        ) : (
          <Circle className="w-5 h-5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={[
          "text-sm font-medium transition-all",
          item.is_purchased ? "line-through text-muted-foreground" : "text-foreground",
        ].join(" ")}>
          {item.name}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {item.quantity} {item.unit}
          </span>
          {item.reason && (
            <span className="text-xs text-muted-foreground/60 truncate max-w-36">
              · {item.reason}
            </span>
          )}
        </div>
      </div>

      {/* Price */}
      {item.estimated_price != null && (
        <span className="text-xs font-medium text-muted-foreground shrink-0">
          ${item.estimated_price.toFixed(2)}
        </span>
      )}

      {/* Priority badge */}
      <span className={[cfg.badge, "shrink-0 hidden sm:inline"].join(" ")}>
        {item.priority ?? "normal"}
      </span>

      {/* Priority dot (mobile) */}
      <span className={["w-2 h-2 rounded-full shrink-0 sm:hidden", cfg.dot].join(" ")} />
    </Reorder.Item>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ShoppingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [list,      setList]      = useState<ShoppingListDetail | null>(null);
  const [items,     setItems]     = useState<ShoppingListItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [approving, setApproving] = useState(false);
  const [toggling,  setToggling]  = useState<string | null>(null);
  const [error,     setError]     = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getShoppingList(id);
      setList(data);
      // Sort: unpurchased first, then by priority
      const order: ItemPriority[] = ["critical", "high", "normal", "low"];
      setItems(
        [...data.items].sort((a, b) => {
          if (a.is_purchased !== b.is_purchased) return a.is_purchased ? 1 : -1;
          return order.indexOf(a.priority) - order.indexOf(b.priority);
        })
      );
    } catch (err) {
      setError("We couldn't load this shopping list.");
      captureUIError("load_shopping_detail", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // ── Toggle purchased ────────────────────────────────────────────────────────

  async function handleToggle(itemId: string) {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    // Optimistic
    setToggling(itemId);
    setItems((prev) =>
      prev.map((i) => i.id === itemId ? { ...i, is_purchased: !i.is_purchased } : i)
    );

    try {
      if (!item.is_purchased) {
        await markItemPurchased(id, itemId);
      }
      // No "un-purchase" endpoint — just keep optimistic
    } catch (err) {
      // Rollback
      setItems((prev) =>
        prev.map((i) => i.id === itemId ? { ...i, is_purchased: item.is_purchased } : i)
      );
      captureUIError("toggle_purchased", err);
    } finally {
      setToggling(null);
    }
  }

  // ── Approve list ────────────────────────────────────────────────────────────

  async function handleApprove() {
    setApproving(true);
    try {
      const updated = await approveShoppingList(id);
      setList((l) => l ? { ...l, status: updated.status } : l);
      toast.success("List approved successfully!");
      track("shopping_list_approved", { list_id: id });
    } catch (err) {
      captureUIError("approve_shopping_list", err);
    } finally {
      setApproving(false);
    }
  }

  // ── Instacart deep link ─────────────────────────────────────────────────────

  function handleInstacart() {
    const names = items.filter((i) => !i.is_purchased).map((i) => i.name).join(", ");
    toast.info("Instacart integration coming soon.");
    // In prod: window.open(`https://www.instacart.com/store/...?items=${encodeURIComponent(names)}`)
  }

  // ── Stats ───────────────────────────────────────────────────────────────────

  const purchasedCount = items.filter((i) => i.is_purchased).length;
  const totalItems     = items.length;
  const totalEst       = items.reduce((s, i) => s + (i.estimated_price ?? 0), 0);
  const pctDone        = totalItems > 0 ? Math.round((purchasedCount / totalItems) * 100) : 0;

  if (loading) {
    return <PageLoadingState title="Loading shopping list" message="Fetching items, totals, and purchase state." />;
  }

  if (error) {
    return <PageErrorState title="Shopping list unavailable" message={error} onRetry={() => void fetchList()} />;
  }

  if (!list) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16 text-muted-foreground">
        List not found.{" "}
        <Link href="/dashboard/shopping" className="text-cyan-500">Go back</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Back */}
      <Link
        href="/dashboard/shopping"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Shopping lists
      </Link>

      {/* Header card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-2xl p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
              <ShoppingCart className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">
                {list.name || "Shopping List"}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(list.created_at).toLocaleDateString("en-US", {
                  weekday: "long", month: "long", day: "numeric",
                })}
              </p>
            </div>
          </div>
          <span className={list.status === "draft" ? "badge-amber" : list.status === "approved" ? "badge-cyan" : "badge-mint"}>
            {list.status}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-4 space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{purchasedCount} of {totalItems} purchased</span>
            <span>{pctDone}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-mint-500"
              initial={{ width: 0 }}
              animate={{ width: `${pctDone}%` }}
              transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
            />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border/30">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Items</p>
            <p className="text-base font-bold text-foreground">{totalItems}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Est. total</p>
            <p className="text-base font-bold text-foreground">
              {totalEst > 0 ? `$${totalEst.toFixed(2)}` : "—"}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Remaining</p>
            <p className="text-base font-bold text-foreground">{totalItems - purchasedCount}</p>
          </div>
        </div>
      </motion.div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {list.status === "draft" && (
          <button
            onClick={handleApprove}
            disabled={approving}
            className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl gradient-primary text-white text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {approving ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <ThumbsUp className="w-4 h-4" />
            )}
            Approve list
          </button>
        )}
        <button
          onClick={handleInstacart}
          className="flex items-center gap-2 px-4 h-10 rounded-xl border border-border/50 text-sm text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-all"
        >
          <ExternalLink className="w-4 h-4" />
          Order via Instacart
        </button>
      </div>

      {/* Items list — draggable */}
      {items.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No items in this list.
        </div>
      ) : (
        <Reorder.Group
          axis="y"
          values={items}
          onReorder={setItems}
          className="space-y-2"
        >
          <AnimatePresence>
            {items.map((item) => (
              <CheckItem
                key={item.id}
                item={item}
                onToggle={handleToggle}
                toggling={toggling}
              />
            ))}
          </AnimatePresence>
        </Reorder.Group>
      )}

      {/* Completion message */}
      <AnimatePresence>
        {pctDone === 100 && totalItems > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="glass-card rounded-2xl p-6 flex flex-col items-center text-center gap-3 border border-mint-500/30"
          >
            <div className="w-12 h-12 rounded-full bg-mint-500/20 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-mint-500" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">All done!</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Every item has been purchased.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
