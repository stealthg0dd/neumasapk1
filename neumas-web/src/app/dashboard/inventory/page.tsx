"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { motion } from "framer-motion";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Search,
  Trash2,
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
  adjustQuantity,
  deleteInventoryItem,
  listInventoryItems,
  listPredictions,
} from "@/lib/api/endpoints";
import type { InventoryItem, Prediction } from "@/lib/api/types";
import { captureUIError } from "@/lib/analytics";
import { confidenceToPercent, getFeatures } from "@/lib/prediction-display";
import { daysUntilExpiry, expiryTone, getExpiryIso } from "@/lib/inventory-dates";
import { cn } from "@/lib/utils";
import { PageErrorState, PageLoadingState } from "@/components/ui/PageState";

type FilterKey = "all" | "expiring" | "low" | "category";
type SortKey = "name" | "expiry" | "recent";

const PAGE_SIZE = 12;
const MOBILE_BATCH_SIZE = 10;

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

function ConfidenceCell({ itemId, predByItem }: { itemId: string; predByItem: Map<string, Prediction> }) {
  const pred = predByItem.get(itemId);
  const feat = pred ? getFeatures(pred) : null;
  const n = feat?.sample_size ?? 0;
  if (!pred || n < 3) {
    return <span className="text-xs text-gray-400">Still learning…</span>;
  }
  const pct = confidenceToPercent(pred.confidence);
  return (
    <div className="min-w-[100px]">
      <div className="h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-[#0071a3]" style={{ width: `${pct}%` }} />
      </div>
      <span className="mt-1 block font-mono text-[11px] text-[var(--text-muted)] tabular-nums">{pct}%</span>
    </div>
  );
}

function InventoryMobileCard({
  item,
  predByItem,
  onDelete,
  onEdit,
}: {
  item: InventoryItem;
  predByItem: Map<string, Prediction>;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const [offsetX, setOffsetX] = useState(0);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);

  const st = statusLabel(item);
  const exp = getExpiryIso(item);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    pointerIdRef.current = event.pointerId;
    startXRef.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== event.pointerId) return;
    const delta = event.clientX - startXRef.current;
    const clamped = Math.max(-104, Math.min(104, delta));
    setOffsetX(clamped);
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== event.pointerId) return;
    const finalOffset = offsetX;
    pointerIdRef.current = null;
    setOffsetX(0);
    if (finalOffset <= -72) onDelete();
    if (finalOffset >= 72) onEdit();
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-4 text-xs font-semibold uppercase tracking-[0.16em]">
        <div className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">Edit</div>
        <div className="rounded-full bg-red-100 px-3 py-1 text-red-700">Delete</div>
      </div>
      <motion.div
        animate={{ x: offsetX }}
        transition={{ type: "spring", stiffness: 340, damping: 28 }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className="relative"
        style={{ touchAction: "pan-y" }}
      >
        <GlassCard className={cn(
          "p-4",
          item.stock_status === "out_of_stock" && "border-l-2 border-l-red-400",
          item.stock_status === "low_stock" && "border-l-2 border-l-amber-400",
        )}>
          <div className="flex justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-base font-semibold text-[var(--text-primary)]">{item.name}</p>
                <span
                  className={cn(
                    "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    st.className
                  )}
                >
                  {st.label}
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {item.category?.name ?? "Uncategorized"} ·{" "}
                <span className="font-mono">{item.quantity}</span> {item.unit}
              </p>
              <p className="mt-1 text-xs font-mono text-[var(--text-muted)]">
                Exp: {exp ? new Date(exp).toLocaleDateString("en-SG", { timeZone: "Asia/Singapore" }) : "—"}
              </p>
              <div className="mt-3">
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  AI confidence
                </p>
                <ConfidenceCell itemId={item.id} predByItem={predByItem} />
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2">
              <button
                type="button"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-muted)]"
                onClick={onEdit}
                aria-label="Edit quantity"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-muted)]"
                onClick={onDelete}
                aria-label="Delete item"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [predByItem, setPredByItem] = useState<Map<string, Prediction>>(() => new Map());
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [deleteItem, setDeleteItem] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [editedQuantity, setEditedQuantity] = useState("");
  const [savingQuantity, setSavingQuantity] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileVisibleCount, setMobileVisibleCount] = useState(MOBILE_BATCH_SIZE);
  const mobileSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, preds] = await Promise.all([
        listInventoryItems({
          limit: 500,
          search: debounced || undefined,
        }),
        listPredictions({ limit: 500 }).catch(() => [] as Prediction[]),
      ]);
      setItems(res.items);
      setTotal(res.total);
      const next = new Map<string, Prediction>();
      for (const p of preds) {
        if (p.item_id) next.set(p.item_id, p);
      }
      setPredByItem(next);
    } catch (err) {
      setError("We couldn't load inventory items.");
      captureUIError("inventory_list", err);
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  useEffect(() => {
    void fetchItems();
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
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
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

  useEffect(() => {
    setPage(1);
    setMobileVisibleCount(MOBILE_BATCH_SIZE);
  }, [processed.length]);

  useEffect(() => {
    const node = mobileSentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting) {
          setMobileVisibleCount((current) =>
            Math.min(processed.length, current + MOBILE_BATCH_SIZE)
          );
        }
      },
      { rootMargin: "160px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [processed.length]);

  const pages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const pageClamped = Math.min(page, pages);
  const desktopSlice = processed.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE);
  const mobileSlice = processed.slice(0, mobileVisibleCount);

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

  function openQuantityEditor(item: InventoryItem) {
    setEditItem(item);
    setEditedQuantity(String(item.quantity));
  }

  async function confirmQuantityUpdate() {
    if (!editItem) return;
    const nextQuantity = Number(editedQuantity);
    if (!Number.isFinite(nextQuantity) || nextQuantity < 0) {
      toast.error("Quantity must be 0 or greater.");
      return;
    }

    const adjustment = nextQuantity - Number(editItem.quantity);
    if (adjustment === 0) {
      setEditItem(null);
      return;
    }

    setSavingQuantity(true);
    try {
      const updated = await adjustQuantity(
        editItem.id,
        adjustment,
        "Manual dashboard quantity update"
      );
      setItems((prev) =>
        prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
      );
      toast.success("Quantity updated.");
      setEditItem(null);
    } catch (err) {
      captureUIError("inventory_adjust_quantity", err);
      toast.error("Failed to update quantity.");
    } finally {
      setSavingQuantity(false);
    }
  }

  const filters: { id: FilterKey; label: string }[] = [
    { id: "all", label: "All" },
    { id: "expiring", label: "Expiring" },
    { id: "low", label: "Low stock" },
    { id: "category", label: "By category" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[clamp(1.5rem,6vw,2rem)] font-bold text-[var(--text-primary)]">Inventory</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {total} items · <span className="font-mono tabular-nums">{processed.length}</span> shown
          </p>
        </div>
        <Link
          href="/dashboard/scans/new"
          className={cn(
            buttonVariants({ variant: "default", size: "lg" }),
            "min-h-[44px] bg-[#0071a3] text-white shrink-0 border-0 hover:bg-[#005a82]"
          )}
        >
          Add via scan
        </Link>
      </div>

      <GlassCard className="sticky top-0 z-20 p-4 md:static">
        <div className="flex flex-col gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items…"
              className="h-11 rounded-xl border-[var(--border)] bg-white pl-9 focus-visible:ring-2 focus-visible:ring-[#0071a3]/35"
            />
          </div>

          <div className="flex items-center justify-between gap-2 md:hidden">
            <button
              type="button"
              onClick={() => setFiltersOpen((value) => !value)}
              className="flex min-h-[44px] flex-1 items-center justify-between rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-primary)]"
            >
              <span>Filters & sort</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", filtersOpen && "rotate-180")} />
            </button>
          </div>

          <div className={cn("hidden items-center gap-3 md:flex", filtersOpen && "flex flex-col items-stretch md:flex-row")}>
            <div className="flex flex-wrap gap-2">
              {filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "min-h-[40px] rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    filter === f.id
                      ? "bg-[rgba(0,113,163,0.12)] border-[#0071a3]/35 text-[#0071a3]"
                      : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] md:ml-auto">
              Sort
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="min-h-[40px] rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs text-[var(--text-primary)]"
              >
                <option value="name">Name</option>
                <option value="expiry">Expiry</option>
                <option value="recent">Recently added</option>
              </select>
            </label>
          </div>
        </div>
      </GlassCard>

      {loading ? (
        <PageLoadingState
          title="Loading inventory"
          message="Fetching current stock levels, expiry dates, and predictions."
        />
      ) : error ? (
        <PageErrorState title="Inventory unavailable" message={error} onRetry={() => void fetchItems()} />
      ) : (
        <>
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
                      <th className="px-4 py-3 font-medium">AI confidence</th>
                      <th className="px-4 py-3 font-medium w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {desktopSlice.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-16 text-center text-[var(--text-secondary)]">
                          No items match.
                        </td>
                      </tr>
                    ) : (
                      desktopSlice.map((item, i) => {
                        const st = statusLabel(item);
                        const exp = getExpiryIso(item);
                        return (
                          <motion.tr
                            key={item.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(i * 0.03, 0.45) }}
                            className={cn(
                              "border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-elevated)]/50",
                              item.stock_status === "out_of_stock" && "bg-red-50/70",
                              item.stock_status === "low_stock" && "bg-amber-50/60",
                            )}
                          >
                            <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{item.name}</td>
                            <td className="px-4 py-3 text-[var(--text-secondary)]">{item.category?.name ?? "—"}</td>
                            <td className={cn(
                              "px-4 py-3 font-mono tabular-nums",
                              item.stock_status === "out_of_stock" && "font-semibold text-red-600",
                              item.stock_status === "low_stock" && "font-semibold text-amber-600",
                            )}>{item.quantity}</td>
                            <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">
                              {exp
                                ? new Date(exp).toLocaleDateString("en-SG", { timeZone: "Asia/Singapore" })
                                : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                                  st.className
                                )}
                              >
                                {st.label}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <ConfidenceCell itemId={item.id} predByItem={predByItem} />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[#0071a3]/10 hover:text-[#0071a3]"
                                  onClick={() => openQuantityEditor(item)}
                                  aria-label="Edit quantity"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[#ff3b30]/10 hover:text-[#ff3b30]"
                                  onClick={() => setDeleteItem(item)}
                                  aria-label="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {pages > 1 && (
                <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--text-secondary)]">
                  <span>
                    Page {pageClamped} of {pages}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={pageClamped <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="rounded-lg border border-[var(--border)] p-1.5 disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={pageClamped >= pages}
                      onClick={() => setPage((p) => Math.min(pages, p + 1))}
                      className="rounded-lg border border-[var(--border)] p-1.5 disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </GlassCard>
          </div>

          <div className="space-y-3 md:hidden">
            <p className="px-1 text-xs text-[var(--text-muted)]">
              Swipe right to edit · swipe left to delete
            </p>
            {mobileSlice.length === 0 ? (
              <GlassCard className="p-8 text-center text-[var(--text-secondary)]">No items.</GlassCard>
            ) : (
              mobileSlice.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.45) }}
                >
                  <InventoryMobileCard
                    item={item}
                    predByItem={predByItem}
                    onEdit={() => openQuantityEditor(item)}
                    onDelete={() => setDeleteItem(item)}
                  />
                </motion.div>
              ))
            )}
            <div ref={mobileSentinelRef} className="h-6" />
            {mobileVisibleCount < processed.length && (
              <p className="text-center text-xs text-[var(--text-muted)]">Loading more items…</p>
            )}
          </div>

          <Dialog open={!!deleteItem} onOpenChange={(o) => !o && setDeleteItem(null)}>
            <DialogContent className="rounded-2xl border-[var(--border)] bg-[var(--surface)]">
              <DialogHeader>
                <DialogTitle>Delete item?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-[var(--text-secondary)]">
                Remove <span className="font-medium text-[var(--text-primary)]">{deleteItem?.name}</span> from your pantry?
              </p>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setDeleteItem(null)}>
                  Cancel
                </Button>
                <Button
                  className="bg-[#ff3b30] text-white hover:bg-[#e02d22]"
                  disabled={deleting}
                  onClick={confirmDelete}
                >
                  {deleting ? "Deleting…" : "Delete"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
            <DialogContent className="rounded-2xl border-[var(--border)] bg-[var(--surface)]">
              <DialogHeader>
                <DialogTitle>Edit quantity</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-[var(--text-secondary)]">
                  Update <span className="font-medium text-[var(--text-primary)]">{editItem?.name}</span>.
                </p>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editedQuantity}
                  onChange={(e) => setEditedQuantity(e.target.value)}
                  className="h-11"
                />
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setEditItem(null)}>
                  Cancel
                </Button>
                <Button
                  className="bg-[#0071a3] text-white hover:bg-[#005a82]"
                  disabled={savingQuantity}
                  onClick={confirmQuantityUpdate}
                >
                  {savingQuantity ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
