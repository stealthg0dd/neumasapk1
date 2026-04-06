'use client'

"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { motion } from "framer-motion";
import {
  Search,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/ui/glass-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  deleteInventoryItem,
  listInventoryItems,
} from "@/lib/api/endpoints";
import type { InventoryItem } from "@/lib/api/types";
import { captureUIError } from "@/lib/analytics";
import { daysUntilExpiry, expiryTone, getExpiryIso } from "@/lib/inventory-dates";
import { cn } from "@/lib/utils";

type FilterKey = "all" | "expiring" | "low" | "category";
type SortKey = "name" | "expiry" | "recent";

const PAGE_SIZE = 12;

function statusLabel(item: InventoryItem): { label: string; className: string } {
  const exp = getExpiryIso(item);
  const d = daysUntilExpiry(exp);
  const tone = expiryTone(d);
  if (tone === "expired") return { label: "Expired", className: "bg-[#ff3b30]/15 text-[#ff3b30] border-[#ff3b30]/25" };
  if (tone === "urgent") return { label: "Expiring", className: "bg-[#ff9500]/15 text-[#ff9500] border-[#ff9500]/25" };
  if (tone === "soon") return { label: "Soon", className: "bg-[#f5c15c]/20 text-[#b8860b] border-[#f5c15c]/35" };
  if (item.stock_status === "low_stock" || item.stock_status === "out_of_stock") {
    return { label: "Low stock", className: "bg-[#ff9500]/12 text-[#c45a00] border-[#ff9500]/25" };
  }
  return { label: "Fresh", className: "bg-[#34c759]/12 text-[#1e7e34] border-[#34c759]/25" };
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [deleteItem, setDeleteItem] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listInventoryItems({
        limit: 500,
        search: debounced || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      captureUIError("inventory_list", err);
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const processed = useMemo(() => {
    let rows = [...items];
    if (filter === "expiring") {
      rows = rows.filter((i) => {
        const d = daysUntilExpiry(getExpiryIso(i));
        return d !== null && d >= 0 && d <= 14;
      });
    } else if (filter === "low") {
      rows = rows.filter(
        (i) => i.stock_status === "low_stock" || i.stock_status === "out_of_stock"
      );
    } else if (filter === "category") {
      rows = [...rows].sort((a, b) =>
        (a.category?.name ?? "").localeCompare(b.category?.name ?? "")
      );
    }
    if (sort === "name") {
      rows.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "recent") {
      rows.sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    } else if (sort === "expiry") {
      rows.sort((a, b) => {
        const ea = getExpiryIso(a);
        const eb = getExpiryIso(b);
        if (!ea && !eb) return 0;
        if (!ea) return 1;
        if (!eb) return -1;
        return new Date(ea).getTime() - new Date(eb).getTime();
      });
    }
    return rows;
  }, [items, filter, sort]);

  const pages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const pageClamped = Math.min(page, pages);
  const slice = processed.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE);

  async function confirmDelete() {
    if (!deleteItem) return;
    setDeleting(true);
    try {
      await deleteInventoryItem(deleteItem.id);
      setItems((prev) => prev.filter((i) => i.id !== deleteItem.id));
      setTotal((t) => t - 1);
      toast.success("Item removed.");
      setDeleteItem(null);
    } catch (err) {
      captureUIError("inventory_delete", err);
    } finally {
      setDeleting(false);
    }
  }

  const filters: { id: FilterKey; label: string }[] = [
    { id: "all", label: "All" },
    { id: "expiring", label: "Expiring" },
    { id: "low", label: "Low stock" },
    { id: "category", label: "By category" },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Inventory</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            {total} items · <span className="font-mono tabular-nums">{processed.length}</span> shown
          </p>
        </div>
        <Link
          href="/dashboard/scans/new"
          className={cn(
            buttonVariants({ variant: "default", size: "lg" }),
            "bg-[#0071a3] hover:bg-[#005a82] text-white shrink-0 border-0"
          )}
        >
          Add via scan
        </Link>
      </div>

      <GlassCard className="p-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search items…"
              className="pl-9 h-10 rounded-xl border-[var(--border)] bg-white focus-visible:ring-2 focus-visible:ring-[#0071a3]/35"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setFilter(f.id);
                  setPage(1);
                }}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                  filter === f.id
                    ? "bg-[rgba(0,113,163,0.12)] border-[#0071a3]/35 text-[#0071a3]"
                    : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] shrink-0">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-[var(--text-primary)] text-xs"
            >
              <option value="name">Name</option>
              <option value="expiry">Expiry</option>
              <option value="recent">Recently added</option>
            </select>
          </label>
        </div>
      </GlassCard>

      {/* Desktop table */}
      <div className="hidden md:block">
        <GlassCard className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium font-mono">Qty</th>
                  <th className="px-4 py-3 font-medium font-mono">Expiry</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(6)].map((_, i) => (
                    <tr key={i} className="border-b border-[var(--border)]">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="h-4 rounded bg-[var(--surface-elevated)] animate-pulse" />
                      </td>
                    </tr>
                  ))
                ) : slice.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center text-[var(--text-secondary)]">
                      No items match.
                    </td>
                  </tr>
                ) : (
                  slice.map((item, i) => {
                    const st = statusLabel(item);
                    const exp = getExpiryIso(item);
                    return (
                      <motion.tr
                        key={item.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i * 0.03, 0.45) }}
                        className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-elevated)]/50"
                      >
                        <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{item.name}</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">
                          {item.category?.name ?? "—"}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums">{item.quantity}</td>
                        <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">
                          {exp
                            ? new Date(exp).toLocaleDateString("en-SG", { timeZone: "Asia/Singapore" })
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex px-2 py-0.5 rounded-full text-xs font-medium border",
                              st.className
                            )}
                          >
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[#ff3b30] hover:bg-[#ff3b30]/10"
                            onClick={() => setDeleteItem(item)}
                            aria-label="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {!loading && pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] text-xs text-[var(--text-secondary)]">
              <span>
                Page {pageClamped} of {pages}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={pageClamped <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-[var(--border)] disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={pageClamped >= pages}
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  className="p-1.5 rounded-lg border border-[var(--border)] disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </GlassCard>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden grid gap-3">
        {loading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-[var(--surface-elevated)] animate-pulse" />
          ))
        ) : slice.length === 0 ? (
          <GlassCard className="p-8 text-center text-[var(--text-secondary)]">No items.</GlassCard>
        ) : (
          slice.map((item, i) => {
            const st = statusLabel(item);
            const exp = getExpiryIso(item);
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.45) }}
              >
                <GlassCard className="p-4">
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">{item.name}</p>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        {item.category?.name ?? "—"} ·{" "}
                        <span className="font-mono">{item.quantity}</span> {item.unit}
                      </p>
                      <p className="text-xs font-mono text-[var(--text-muted)] mt-1">
                        Exp:{" "}
                        {exp
                          ? new Date(exp).toLocaleDateString("en-SG", { timeZone: "Asia/Singapore" })
                          : "—"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={cn(
                          "inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border",
                          st.className
                        )}
                      >
                        {st.label}
                      </span>
                      <button
                        type="button"
                        className="p-2 rounded-lg border border-[var(--border)] text-[var(--text-muted)]"
                        onClick={() => setDeleteItem(item)}
                        aria-label="Delete item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            );
          })
        )}
      </div>

      <Dialog open={!!deleteItem} onOpenChange={(o) => !o && setDeleteItem(null)}>
        <DialogContent className="bg-[var(--surface)] border-[var(--border)] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Delete item?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--text-secondary)]">
            Remove <span className="font-medium text-[var(--text-primary)]">{deleteItem?.name}</span>{" "}
            from your pantry?
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteItem(null)}>
              Cancel
            </Button>
            <Button
              className="bg-[#ff3b30] hover:bg-[#e02d22] text-white"
              disabled={deleting}
              onClick={confirmDelete}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
