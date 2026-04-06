'use client'

"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart, Plus, Sparkles, Clock, Package,
  DollarSign, CheckCircle2, ChevronRight, X,
  Sliders,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { listShoppingLists, generateShoppingList } from "@/lib/api/endpoints";
import { useAuthStore } from "@/lib/store/auth";
import type { ShoppingList, ShoppingListStatus } from "@/lib/api/types";
import { track, captureUIError } from "@/lib/analytics";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ── Status config ──────────────────────────────────────────────────────────────

const STATUS_CFG: Record<ShoppingListStatus, { label: string; badge: string }> = {
  draft:    { label: "Draft",    badge: "badge-amber" },
  approved: { label: "Approved", badge: "badge-cyan" },
  ordered:  { label: "Ordered",  badge: "badge-purple" },
  received: { label: "Received", badge: "badge-mint" },
};

// ── Relative date ──────────────────────────────────────────────────────────────

function relDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7)  return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── List card ─────────────────────────────────────────────────────────────────

function ListCard({ list, index }: { list: ShoppingList; index: number }) {
  const cfg = STATUS_CFG[list.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      whileHover={{ scale: 1.01, y: -1 }}
    >
      <Link
        href={`/dashboard/shopping/${list.id}`}
        className="block glass-card rounded-2xl p-5 border border-border/30 hover:border-border/60 transition-all group"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
              <ShoppingCart className="w-5 h-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate group-hover:text-cyan-400 transition-colors">
                {list.name || `Shopping List — ${relDate(list.created_at)}`}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={cfg.badge}>{cfg.label}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {relDate(list.created_at)}
                </span>
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1 group-hover:text-foreground transition-colors" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-border/30">
          <div className="flex items-center gap-2">
            <Package className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {/* item_count not in schema, use placeholder */}
              <span className="text-foreground font-medium">—</span> items
            </span>
          </div>
          <div className="flex items-center gap-2">
            <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              <span className="text-foreground font-medium">
                {list.total_estimated_cost != null
                  ? `$${list.total_estimated_cost.toFixed(2)}`
                  : "—"}
              </span> est.
            </span>
          </div>
          {list.approved_at && (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-mint-500" />
              <span className="text-xs text-muted-foreground">
                Approved {relDate(list.approved_at)}
              </span>
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}

// ── Generate modal ─────────────────────────────────────────────────────────────

interface GenerateOptions {
  criticalOnly:  boolean;
  daysAhead:     number;
  minQtyPct:     number;
}

function GenerateModal({
  open,
  onClose,
  onGenerate,
  loading,
}: {
  open:       boolean;
  onClose:    () => void;
  onGenerate: (opts: GenerateOptions) => Promise<void>;
  loading:    boolean;
}) {
  const [opts, setOpts] = useState<GenerateOptions>({
    criticalOnly: false,
    daysAhead:    14,
    minQtyPct:    20,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-heavy border-border/50 max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            Generate shopping list
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Critical only toggle */}
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <div>
              <p className="text-sm font-medium text-foreground">Critical items only</p>
              <p className="text-xs text-muted-foreground mt-0.5">Include only items with critical stockout risk</p>
            </div>
            <button
              role="switch"
              aria-checked={opts.criticalOnly}
              onClick={() => setOpts((o) => ({ ...o, criticalOnly: !o.criticalOnly }))}
              className={[
                "w-10 h-6 rounded-full transition-all relative shrink-0",
                opts.criticalOnly ? "bg-cyan-500" : "bg-surface-2 border border-border/50",
              ].join(" ")}
            >
              <span className={[
                "absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all",
                opts.criticalOnly ? "left-5" : "left-1",
              ].join(" ")} />
            </button>
          </label>

          {/* Days ahead */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Forecast window</label>
              <span className="text-sm font-semibold text-cyan-400">{opts.daysAhead} days</span>
            </div>
            <input
              type="range"
              min={3}
              max={30}
              value={opts.daysAhead}
              onChange={(e) => setOpts((o) => ({ ...o, daysAhead: Number(e.target.value) }))}
              className="w-full accent-cyan-500"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>3 days</span>
              <span>30 days</span>
            </div>
          </div>

          {/* Min quantity % */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Include below par</label>
              <span className="text-sm font-semibold text-cyan-400">{opts.minQtyPct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={opts.minQtyPct}
              onChange={(e) => setOpts((o) => ({ ...o, minQtyPct: Number(e.target.value) }))}
              className="w-full accent-cyan-500"
            />
            <p className="text-xs text-muted-foreground">
              Include items below {opts.minQtyPct}% of their par level
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-border/50">Cancel</Button>
          <Button
            disabled={loading}
            onClick={() => onGenerate(opts)}
            className="gradient-primary text-white hover:opacity-90"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" />
                Generate
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Status filter tabs ─────────────────────────────────────────────────────────

const FILTERS: Array<{ value: ShoppingListStatus | "all"; label: string }> = [
  { value: "all",      label: "All" },
  { value: "draft",    label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "ordered",  label: "Ordered" },
  { value: "received", label: "Received" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ShoppingPage() {
  const router     = useRouter();
  const propertyId = useAuthStore((s) => s.propertyId);

  const [lists,       setLists]       = useState<ShoppingList[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [genOpen,     setGenOpen]     = useState(false);
  const [genLoading,  setGenLoading]  = useState(false);
  const [filter,      setFilter]      = useState<ShoppingListStatus | "all">("all");

  // Ref-stable fetch so we can call it from handleGenerate without adding it
  // to any effect dependency array (avoids indirect re-render loops).
  const fetchListsRef = useRef<() => Promise<void>>(async () => {});

  async function fetchLists() {
    // Always read the latest propertyId at call time via getState()
    const pid = propertyId ?? useAuthStore.getState().propertyId;
    setLoading(true);
    try {
      const data = await listShoppingLists();
      setLists(Array.isArray(data) ? data : []);
    } catch (err) {
      captureUIError("load_shopping_lists", err);
      setLists([]);
    } finally {
      setLoading(false);
    }
  }

  // Keep the ref current on every render so setTimeout callbacks always call
  // the latest version of fetchLists without stale closures.
  fetchListsRef.current = fetchLists;

  // Single effect keyed on propertyId — no indirect useCallback chain
  useEffect(() => {
    if (!propertyId) return;
    fetchListsRef.current();
  }, [propertyId]);

  async function handleGenerate(opts: GenerateOptions): Promise<void> {
    const pid = propertyId ?? useAuthStore.getState().propertyId;
    if (!pid) {
      toast.error("Property ID not found. Please log out and log in again.");
      return;
    }
    setGenLoading(true);
    try {
      await generateShoppingList({
        include_critical_only: opts.criticalOnly,
        min_days_threshold:    opts.daysAhead,
      });
      toast.success("Generating shopping list — this may take up to 30 seconds…");
      track("shopping_list_generated", {
        critical_only: opts.criticalOnly,
        days_ahead:    opts.daysAhead,
        min_qty_pct:   opts.minQtyPct,
      });
      setGenOpen(false);
      // Poll every 3 s for up to 45 s, stop early when a new list appears
      const before = lists.length;
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const data = await listShoppingLists();
          const fresh = Array.isArray(data) ? data : [];
          if (fresh.length > before || attempts >= 15) {
            clearInterval(poll);
            setLists(fresh);
            if (fresh.length > before) toast.success("Shopping list is ready!");
          }
        } catch {
          if (attempts >= 15) clearInterval(poll);
        }
      }, 3000);
    } catch (err) {
      captureUIError("generate_shopping_list", err);
    } finally {
      setGenLoading(false);
    }
  }

  const displayed = filter === "all" ? lists : lists.filter((l) => l.status === filter);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight gradient-text">Shopping Lists</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{lists.length} lists total</p>
        </div>
        <button
          onClick={() => setGenOpen(true)}
          className="flex items-center gap-2 px-4 h-9 rounded-xl gradient-primary text-white text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Generate list
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={[
              "px-3 h-7 rounded-full text-xs font-semibold border transition-all",
              filter === f.value
                ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40"
                : "text-muted-foreground border-border/40 hover:border-border/70",
            ].join(" ")}
          >
            {f.label}
            {f.value !== "all" && (
              <span className="ml-1 opacity-60">
                {lists.filter((l) => l.status === f.value).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 rounded-2xl shimmer" />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-card rounded-2xl p-12 flex flex-col items-center text-center gap-4"
        >
          <div className="w-14 h-14 rounded-2xl bg-amber-500/15 flex items-center justify-center">
            <ShoppingCart className="w-7 h-7 text-amber-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">No shopping lists yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Generate your first AI-powered shopping list based on current inventory levels.
            </p>
          </div>
          <button
            onClick={() => setGenOpen(true)}
            className="flex items-center gap-2 px-4 h-9 rounded-xl gradient-primary text-white text-sm font-semibold hover:opacity-90"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Generate first list
          </button>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {displayed.map((list, i) => (
            <ListCard key={list.id} list={list} index={i} />
          ))}
        </div>
      )}

      <GenerateModal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        onGenerate={handleGenerate}
        loading={genLoading}
      />
    </div>
  );
}
