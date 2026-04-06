"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  ClipboardList,
  Minus,
  Package,
  Plus,
  ScanLine,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/ui/glass-card";
import { buttonVariants } from "@/components/ui/button";
import {
  adjustQuantity,
  listInventoryItems,
  listRecentScans,
  listShoppingLists,
} from "@/lib/api/endpoints";
import type { InventoryItem, Scan } from "@/lib/api/types";
import { useAuthStore } from "@/lib/store/auth";
import { captureUIError } from "@/lib/analytics";
import {
  daysUntilExpiry,
  expiryTone,
  getExpiryIso,
  pantryCategoryTab,
} from "@/lib/inventory-dates";
import { cn } from "@/lib/utils";

const TABS = ["All", "Proteins", "Grains", "Dairy", "Produce", "Condiments"] as const;

function sgtHour(): number {
  return parseInt(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Singapore",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
    10
  );
}

function greetingForHour(h: number): string {
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function categoryEmoji(cat: string): string {
  const c = cat.toLowerCase();
  if (c.includes("protein") || c.includes("meat")) return "🥩";
  if (c.includes("grain") || c.includes("rice")) return "🌾";
  if (c.includes("dairy") || c.includes("milk")) return "🥛";
  if (c.includes("produce") || c.includes("veg") || c.includes("fruit")) return "🥬";
  if (c.includes("condiment")) return "🧂";
  return "📦";
}

function StatMini({
  icon: Icon,
  label,
  value,
  sub,
  index,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, type: "spring", stiffness: 400, damping: 30 }}
    >
      <GlassCard className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--surface-elevated)] flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-[#0071a3]" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-semibold tabular-nums text-[var(--text-primary)] leading-tight">
              {value}
            </p>
            <p className="text-xs font-medium text-[var(--text-secondary)] mt-0.5">{label}</p>
            {sub && (
              <p className="text-[11px] text-[var(--text-muted)] font-mono mt-1 truncate">{sub}</p>
            )}
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}

export default function DashboardPage() {
  const profile = useAuthStore((s) => s.profile);
  const propertyId = useAuthStore((s) => s.propertyId);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [listCount, setListCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<(typeof TABS)[number]>("All");
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      setBannerDismissed(localStorage.getItem("neumas-dismiss-expiry") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const [inv, recent, lists] = await Promise.all([
        listInventoryItems({ limit: 200 }),
        listRecentScans({ limit: 5 }),
        listShoppingLists({ limit: 50 }),
      ]);
      setItems(inv.items);
      setScans(recent);
      setListCount(Array.isArray(lists) ? lists.length : 0);
    } catch (err) {
      captureUIError("dashboard_load", err);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    if (!propertyId) return;
    if (fetchedRef.current === propertyId) return;
    fetchedRef.current = propertyId;
    load();
  }, [propertyId, load]);

  const firstName = profile?.full_name?.split(" ")[0] ?? "Vee";
  const greet = `${greetingForHour(sgtHour())}, ${firstName}`;

  const dateLine = useMemo(
    () =>
      new Intl.DateTimeFormat("en-SG", {
        timeZone: "Asia/Singapore",
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date()),
    []
  );

  const filtered = useMemo(() => {
    if (tab === "All") return items;
    return items.filter((i) => pantryCategoryTab(i.category?.name) === tab);
  }, [items, tab]);

  const expiringSoon = useMemo(() => {
    return items.filter((i) => {
      const d = daysUntilExpiry(getExpiryIso(i));
      return d !== null && d >= 0 && d < 7;
    });
  }, [items]);

  const expiringWeek = useMemo(() => {
    return items.filter((i) => {
      const d = daysUntilExpiry(getExpiryIso(i));
      return d !== null && d >= 0 && d <= 14;
    });
  }, [items]);

  const lastScan = scans[0];

  async function bumpQty(item: InventoryItem, delta: number) {
    const prev = items;
    setItems((list) =>
      list.map((i) =>
        i.id === item.id ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i
      )
    );
    try {
      const updated = await adjustQuantity(item.id, delta, "dashboard");
      setItems((list) => list.map((i) => (i.id === item.id ? updated : i)));
    } catch (err) {
      setItems(prev);
      captureUIError("dashboard_qty", err);
    }
  }

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto">
      {/* Top bar */}
      <header className="flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight text-[#0071a3]">Neumas</span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mt-1">{greet}</h1>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <time
            className="font-mono text-xs text-[var(--text-secondary)] tabular-nums"
            dateTime={new Date().toISOString()}
          >
            {dateLine}
          </time>
          <button
            type="button"
            className="relative p-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-elevated)] transition-colors"
            aria-label="Notifications"
            onClick={() => toast.info("You're all caught up.", { description: "No new alerts." })}
          >
            <Bell className="w-5 h-5 text-[var(--text-secondary)]" />
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatMini
          index={0}
          icon={Package}
          label="Total items in pantry"
          value={loading ? "—" : items.length}
        />
        <StatMini
          index={1}
          icon={AlertTriangle}
          label="Items expiring soon"
          value={loading ? "—" : expiringWeek.length}
        />
        <StatMini
          index={2}
          icon={ScanLine}
          label="Last scan"
          value={
            lastScan
              ? new Date(lastScan.created_at).toLocaleDateString("en-SG", {
                  timeZone: "Asia/Singapore",
                  month: "short",
                  day: "numeric",
                })
              : "—"
          }
          sub={lastScan ? `${lastScan.items_detected} items` : "No scans yet"}
        />
        <StatMini
          index={3}
          icon={ClipboardList}
          label="Smart lists"
          value={loading ? "—" : listCount}
        />
      </div>

      <AnimatePresence>
        {expiringSoon.length > 0 && !bannerDismissed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-[rgba(255,149,0,0.35)] bg-[rgba(255,149,0,0.08)] px-4 py-3 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#ff9500] shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {expiringSoon.length} item{expiringSoon.length === 1 ? "" : "s"} expiring this week —{" "}
                  <Link href="/dashboard/inventory" className="text-[#0071a3] underline-offset-2 hover:underline">
                    view list
                  </Link>
                </p>
              </div>
              <button
                type="button"
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1"
                aria-label="Dismiss"
                onClick={() => {
                  setBannerDismissed(true);
                  try {
                    localStorage.setItem("neumas-dismiss-expiry", "1");
                  } catch {
                    /* ignore */
                  }
                }}
              >
                ×
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start">
        {/* Inventory */}
        <div className="space-y-4 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Inventory overview</h2>
            <Link
              href="/dashboard/scans/new"
              className="text-xs font-medium text-[#0071a3] hover:underline"
            >
              New scan
            </Link>
          </div>

          <div className="relative flex gap-1 border-b border-[var(--border)] overflow-x-auto pb-px">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "relative shrink-0 px-3 py-2 text-sm font-medium transition-colors",
                  tab === t ? "text-[#0071a3]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
              >
                {t}
                {tab === t && (
                  <motion.div
                    layoutId="dash-tab"
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-[#0071a3]"
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                )}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-36 rounded-2xl bg-[var(--surface-elevated)] animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <GlassCard className="p-10 text-center">
              <div className="mx-auto w-16 h-16 text-[#0071a3] mb-4">
                <svg viewBox="0 0 64 64" fill="none" className="w-full h-full" aria-hidden>
                  <rect x="8" y="12" width="48" height="40" rx="8" stroke="currentColor" strokeWidth="2" />
                  <path d="M20 28h24M20 36h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-sm font-medium text-[var(--text-primary)]">No items in this view</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Run a scan or switch category tabs.
              </p>
              <Link
                href="/dashboard/scans/new"
                className={cn(
                  buttonVariants({ variant: "default", size: "lg" }),
                  "mt-4 inline-flex bg-[#0071a3] hover:bg-[#005a82] text-white border-0"
                )}
              >
                Start a scan
              </Link>
            </GlassCard>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map((item, i) => {
                const exp = getExpiryIso(item);
                const days = daysUntilExpiry(exp);
                const tone = expiryTone(days);
                const dot =
                  tone === "none"
                    ? "bg-[var(--text-muted)]"
                    : tone === "fresh"
                      ? "bg-[#34c759]"
                      : tone === "soon"
                        ? "bg-[#f5c15c]"
                        : tone === "urgent" || tone === "expired"
                          ? "bg-[#ff3b30]"
                          : "bg-[var(--text-muted)]";

                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.45) }}
                  >
                    <GlassCard className="p-4 h-full flex flex-col">
                      <div className="flex gap-3">
                        <div className="text-2xl leading-none pt-0.5" aria-hidden>
                          {categoryEmoji(pantryCategoryTab(item.category?.name))}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[var(--text-primary)] truncate">{item.name}</p>
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                            {item.category?.name ?? "Uncategorized"}
                          </p>
                          <div className="flex items-center gap-2 mt-2 text-xs font-mono text-[var(--text-secondary)]">
                            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dot)} />
                            {exp
                              ? new Date(exp).toLocaleDateString("en-SG", { timeZone: "Asia/Singapore" })
                              : "No expiry"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--border)]">
                        <div className="flex items-center gap-1">
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.92 }}
                            className="h-8 w-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] flex items-center justify-center hover:bg-[var(--surface-elevated)]"
                            onClick={() => bumpQty(item, -1)}
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-4 h-4" />
                          </motion.button>
                          <span className="font-mono text-sm w-10 text-center tabular-nums">
                            {item.quantity}
                          </span>
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.92 }}
                            className="h-8 w-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] flex items-center justify-center hover:bg-[var(--surface-elevated)]"
                            onClick={() => bumpQty(item, 1)}
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-4 h-4" />
                          </motion.button>
                        </div>
                        <span className="text-[11px] text-[var(--text-muted)]">{item.unit}</span>
                      </div>
                    </GlassCard>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent scans */}
        <aside className="lg:sticky lg:top-4 space-y-3 w-full max-w-[300px] mx-auto lg:mx-0 lg:max-w-none">
          <GlassCard className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Recent scans</h3>
              <Sparkles className="w-4 h-4 text-[#0071a3]" />
            </div>
            <ul className="space-y-3">
              {scans.length === 0 && !loading && (
                <li className="text-xs text-[var(--text-secondary)]">No scans yet.</li>
              )}
              {scans.map((s, i) => (
                <motion.li
                  key={s.id}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="text-sm border-b border-[var(--border)] last:border-0 pb-3 last:pb-0"
                >
                  <p className="font-mono text-[11px] text-[var(--text-muted)]">
                    {new Date(s.created_at).toLocaleString("en-SG", {
                      timeZone: "Asia/Singapore",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <p className="text-[var(--text-primary)] mt-1">
                    {s.items_detected} items found
                  </p>
                </motion.li>
              ))}
            </ul>
            <div className="mt-5 space-y-2">
              <Link
                href="/dashboard/scans"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "w-full justify-center border-[var(--border)]"
                )}
              >
                View all
              </Link>
              <Link
                href="/dashboard/scans/new"
                className={cn(
                  buttonVariants({ variant: "default", size: "lg" }),
                  "w-full justify-center bg-[#0071a3] hover:bg-[#005a82] text-white border-0"
                )}
              >
                Start new scan
              </Link>
            </div>
          </GlassCard>
        </aside>
      </div>
    </div>
  );
}
