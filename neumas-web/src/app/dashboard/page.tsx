"use client";

import { useEffect, useRef, useState } from "react";
import { motion, type Variants } from "framer-motion";
import { ScanLine, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { useAuthStore } from "@/lib/store/auth";
import { listPredictions, listInventory, listShoppingLists, getShoppingList, generateShoppingList, triggerForecast } from "@/lib/api/endpoints";
import type { Prediction, InventoryItem, ShoppingListItem } from "@/lib/api/types";
import { normalizeShoppingItem } from "@/lib/api/types";

import { StockoutAlert } from "@/components/dashboard/StockoutAlert";
import { SavingsCounter, StatCard } from "@/components/dashboard/SavingsCounter";
import { InventoryPreview } from "@/components/dashboard/InventoryPreview";
import { ShoppingPreview } from "@/components/dashboard/ShoppingPreview";

// ── Quick action button ────────────────────────────────────────────────────────

function QuickAction({
  icon: Icon,
  label,
  description,
  onClick,
  loading,
  accentClass = "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30",
}: {
  icon:        React.ComponentType<{ className?: string }>;
  label:       string;
  description: string;
  onClick:     () => void;
  loading?:    boolean;
  accentClass?: string;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      disabled={loading}
      className={[
        "flex items-center gap-3 w-full p-3.5 rounded-xl text-left transition-all border border-border/30",
        "glass-button hover:border-border/60 disabled:opacity-60 disabled:cursor-not-allowed",
      ].join(" ")}
    >
      <div className={["w-9 h-9 rounded-lg flex items-center justify-center shrink-0", accentClass].join(" ")}>
        {loading ? (
          <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
        ) : (
          <Icon className="w-4 h-4" />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{description}</p>
      </div>
    </motion.button>
  );
}

// ── Container animation ────────────────────────────────────────────────────────

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const card: Variants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const profile    = useAuthStore((s) => s.profile);
  const propertyId = useAuthStore((s) => s.propertyId);

  const [predictions,    setPredictions]    = useState<Prediction[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryTotal, setInventoryTotal] = useState(0);
  const [inventoryValue, setInventoryValue] = useState(0);
  const [shoppingItems,  setShoppingItems]  = useState<ShoppingListItem[]>([]);

  const [loadingPred, setLoadingPred] = useState(true);
  const [loadingInv,  setLoadingInv]  = useState(true);
  const [loadingShop, setLoadingShop] = useState(true);

  const [generatingList,    setGeneratingList]    = useState(false);
  const [triggeringForecast, setTriggeringForecast] = useState(false);

  // ── Fetch data ───────────────────────────────────────────────────────────────
  // Two ref guards prevent any re-entry:
  //   isInitialMount  — true until the first fetch for any propertyId completes
  //   fetchedForRef   — records which propertyId we last fetched; the effect is
  //                     a no-op if it fires again for the same value (covers
  //                     React StrictMode double-invoke and Zustand store churn)
  // A 500 ms debounce absorbs bursts of rapid propertyId changes (e.g. during
  // auth hydration) without making the dashboard feel sluggish on cold load.

  const isInitialMount = useRef(true);
  const fetchedForRef  = useRef<string | null>(null);

  useEffect(() => {
    if (!propertyId) return;
    if (fetchedForRef.current === propertyId) return;
    fetchedForRef.current = propertyId;
    isInitialMount.current = false;

    let cancelled = false;

    async function fetchAll() {
      // Fire all three in parallel — they all use the same token, so if the
      // token is invalid ALL get 401 simultaneously and the redirect guard in
      // client.ts fires only once.  Sequential fetching would cascade: the first
      // 401 clears localStorage, then the next request fires with no token.
      await Promise.all([

        // ── Predictions ─────────────────────────────────────────────────────
        (async () => {
          setLoadingPred(true);
          try {
            const data = await listPredictions({ limit: 20 });
            if (!cancelled) setPredictions(Array.isArray(data) ? data : []);
          } catch {
            if (!cancelled) setPredictions([]);
          } finally {
            if (!cancelled) setLoadingPred(false);
          }
        })(),

        // ── Inventory ────────────────────────────────────────────────────────
        (async () => {
          setLoadingInv(true);
          try {
            const res = await listInventory({ limit: 10 });
            if (!cancelled) {
              const items = Array.isArray(res?.items) ? res.items : [];
              setInventoryItems(items);
              setInventoryTotal(res?.total ?? 0);
              setInventoryValue(
                Math.round(items.reduce((s, i) => s + (i.cost_per_unit ?? 0) * i.quantity, 0))
              );
            }
          } catch {
            if (!cancelled) { setInventoryItems([]); setInventoryTotal(0); setInventoryValue(0); }
          } finally {
            if (!cancelled) setLoadingInv(false);
          }
        })(),

        // ── Shopping list ─────────────────────────────────────────────────────
        (async () => {
          setLoadingShop(true);
          try {
            const lists = await listShoppingLists();
            const safeList = Array.isArray(lists) ? lists : [];
            const activeList = safeList.find((l) => l.status === "draft" || l.status === "approved");
            if (activeList && !cancelled) {
              const detail = await getShoppingList(activeList.id);
              if (!cancelled) {
                const rawItems = Array.isArray(detail?.items) ? detail.items : [];
                setShoppingItems(rawItems.map(normalizeShoppingItem));
              }
            } else if (!cancelled) {
              setShoppingItems([]);
            }
          } catch {
            if (!cancelled) setShoppingItems([]);
          } finally {
            if (!cancelled) setLoadingShop(false);
          }
        })(),

      ]);
    }

    // 500 ms debounce — absorbs auth-hydration bursts without a perceptible delay
    const timer = setTimeout(fetchAll, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [propertyId]);

  // ── Quick actions ────────────────────────────────────────────────────────────

  async function handleGenerateList() {
    if (!propertyId) return toast.error("No property selected.");
    try {
      setGeneratingList(true);
      await generateShoppingList({});
      toast.success("Shopping list generation queued!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate list.");
    } finally {
      setGeneratingList(false);
    }
  }

  async function handleTriggerForecast() {
    try {
      setTriggeringForecast(true);
      await triggerForecast(14);
      toast.success("Forecast job queued — check back shortly.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to trigger forecast.");
    } finally {
      setTriggeringForecast(false);
    }
  }

  // ── Derived stats ────────────────────────────────────────────────────────────

  const criticalCount   = (predictions ?? []).filter((p) => p.stockout_risk_level === "critical").length;
  const urgentCount     = (predictions ?? []).filter((p) => p.stockout_risk_level === "urgent").length;
  const lowStockCount   = (inventoryItems ?? []).filter((i) => i.stock_status === "low" || i.stock_status === "critical").length;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight gradient-text">
          {profile?.full_name
            ? `Welcome back, ${profile.full_name.split(" ")[0]}`
            : "Dashboard"}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {profile?.property_name ?? "Your property"} · AI inventory overview
        </p>
      </div>

      {/* Bento grid */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-12 gap-4 auto-rows-auto"
      >
        {/* ── Row 1 ──────────────────────────────────────────────────────── */}

        {/* Stockout alerts — wide hero */}
        <motion.div variants={card} className="col-span-12 lg:col-span-8 row-span-2">
          <StockoutAlert predictions={predictions} loading={loadingPred} />
        </motion.div>

        {/* Savings counter */}
        <motion.div variants={card} className="col-span-12 sm:col-span-6 lg:col-span-4">
          <SavingsCounter
            totalSaved={inventoryValue}
            wasteReduction={lowStockCount}
            activePredictions={predictions.length}
            loading={loadingInv}
          />
        </motion.div>

        {/* Stats — low stock */}
        <motion.div variants={card} className="col-span-6 sm:col-span-3 lg:col-span-2">
          <StatCard
            label="Low stock items"
            value={lowStockCount}
            format="number"
            trend={-8.3}
            trendLabel="vs last week"
            accentClass="text-amber-400"
            index={0}
          />
        </motion.div>

        {/* Stats — active alerts */}
        <motion.div variants={card} className="col-span-6 sm:col-span-3 lg:col-span-2">
          <StatCard
            label="Active alerts"
            value={criticalCount + urgentCount}
            format="number"
            trend={criticalCount > 0 ? -5 : 0}
            trendLabel="vs yesterday"
            accentClass="text-red-400"
            index={1}
          />
        </motion.div>

        {/* ── Row 2 ──────────────────────────────────────────────────────── */}

        {/* Inventory preview */}
        <motion.div variants={card} className="col-span-12 lg:col-span-8">
          <InventoryPreview
            items={inventoryItems}
            total={inventoryTotal}
            loading={loadingInv}
          />
        </motion.div>

        {/* Shopping preview */}
        <motion.div variants={card} className="col-span-12 sm:col-span-6 lg:col-span-4">
          <ShoppingPreview items={shoppingItems} loading={loadingShop} />
        </motion.div>

        {/* ── Quick actions ───────────────────────────────────────────────── */}
        <motion.div variants={card} className="col-span-12 sm:col-span-6">
          <div className="glass-card rounded-2xl p-5 h-full">
            <h3 className="text-sm font-semibold text-foreground mb-3">Quick actions</h3>
            <div className="space-y-2">
              <QuickAction
                icon={ScanLine}
                label="Scan a receipt"
                description="Upload or photograph an invoice"
                onClick={() => window.location.href = "/dashboard/scans"}
                accentClass="bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
              />
              <QuickAction
                icon={Sparkles}
                label="Generate shopping list"
                description="AI-powered list based on predictions"
                onClick={handleGenerateList}
                loading={generatingList}
                accentClass="bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
              />
            </div>
          </div>
        </motion.div>

        {/* Run forecast */}
        <motion.div variants={card} className="col-span-12 sm:col-span-6">
          <motion.div
            whileHover={{ scale: 1.01, boxShadow: "0 0 30px 0 oklch(0.715 0.139 199.2 / 0.15)" }}
            transition={{ duration: 0.2 }}
            className="glass-card rounded-2xl p-5 h-full flex flex-col justify-between gap-4"
          >
            <div>
              <h3 className="text-sm font-semibold text-foreground">Run AI Forecast</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Analyse the last 30 days of consumption and predict the next 14-day stockout risk.
              </p>
            </div>
            <button
              onClick={handleTriggerForecast}
              disabled={triggeringForecast}
              className="w-full h-10 rounded-lg gradient-primary text-white text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {triggeringForecast ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Queuing…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Run forecast
                </>
              )}
            </button>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}
