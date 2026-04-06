'use client'

"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  Loader2,
  Package,
  Plus,
  RotateCcw,
  Sparkles,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { itemToCube, type PantryItemCube } from "@/components/three/PantryScene";
import {
  batchInventoryUpdate,
  getScanStatus,
  postScanUpload,
} from "@/lib/api/endpoints";
import { useAuthStore } from "@/lib/store/auth";
import { captureUIError } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const PantryScene = dynamic(
  () => import("@/components/three/PantryScene").then((m) => m.PantryScene),
  { ssr: false }
);

interface ExtractedRow {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  confidence: number;
  add: boolean;
}

function mapExtracted(raw: Record<string, unknown>, index: number): ExtractedRow {
  const name = String(raw.name ?? raw.item_name ?? "Unknown item");
  return {
    id: `${name}-${index}`,
    name,
    quantity: Number(raw.quantity ?? 1),
    unit: String(raw.unit ?? "unit"),
    category: String(raw.category ?? raw.category_name ?? "General"),
    confidence: Number(raw.confidence ?? 0.75),
    add: true,
  };
}

export default function NewScanPage() {
  const propertyId = useAuthStore((s) => s.propertyId);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanId, setScanId] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedRow[]>([]);
  const [cubes, setCubes] = useState<PantryItemCube[]>([]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setScanId(null);
    setExtracted([]);
    setCubes([]);
    setBusy(false);
  }, [preview]);

  const onFile = useCallback(
    (f: File) => {
      if (!f.type.startsWith("image/")) {
        toast.error("Please upload an image (JPEG, PNG, WebP).");
        return;
      }
      if (f.size > 10 * 1024 * 1024) {
        toast.error("Image must be under 10 MB.");
        return;
      }
      reset();
      setFile(f);
      setPreview(URL.createObjectURL(f));
    },
    [reset]
  );

  const analyze = async () => {
    const pid = propertyId ?? useAuthStore.getState().propertyId;
    if (!pid) {
      toast.error("Session incomplete — please sign in again.");
      return;
    }
    if (!file) return;

    setBusy(true);
    setExtracted([]);
    setCubes([]);
    try {
      const res = await postScanUpload(file, "receipt");
      const sid = res.scan_id ?? res.id ?? null;
      setScanId(sid);
      toast.success("Scan queued — analyzing…");
    } catch (err) {
      captureUIError("scan_post", err);
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!scanId) return;

    const t = setTimeout(() => {
      setBusy(false);
      toast.warning("Processing is taking longer than expected.");
    }, 90_000);

    pollRef.current = setInterval(async () => {
      try {
        const s = await getScanStatus(scanId);
        if (s.status === "completed") {
          clearTimeout(t);
          if (pollRef.current) clearInterval(pollRef.current);
          const raw = s.extracted_items ?? [];
          const rows = raw.map((it, i) => mapExtracted(it as Record<string, unknown>, i));
          setExtracted(rows);
          setCubes(rows.map((r, i) => itemToCube(r.id, i, r.name)));
          setBusy(false);
          toast.success(`Found ${rows.length} item${rows.length === 1 ? "" : "s"}.`);
        } else if (s.status === "failed") {
          clearTimeout(t);
          if (pollRef.current) clearInterval(pollRef.current);
          setBusy(false);
          toast.error(s.error_message ?? "Scan failed.");
        }
      } catch {
        /* keep polling */
      }
    }, 2000);

    return () => {
      clearTimeout(t);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [scanId]);

  async function saveAll() {
    const pid = propertyId ?? useAuthStore.getState().propertyId;
    if (!pid) {
      toast.error("No property context.");
      return;
    }
    const chosen = extracted.filter((e) => e.add);
    if (!chosen.length) {
      toast.warning("Select at least one item.");
      return;
    }
    try {
      await batchInventoryUpdate(
        chosen.map((e) => ({
          property_id: pid,
          item_name: e.name,
          new_qty: e.quantity,
          unit: e.unit,
        }))
      );
      toast.success("Pantry updated.");
    } catch (err) {
      captureUIError("batch_inventory", err);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          New scan
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Upload a receipt — watch items fill your pantry in 3D.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <GlassCard className="p-6">
          <div className="space-y-4">
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") (e.target as HTMLElement).click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) onFile(f);
              }}
              className={cn(
                "relative rounded-2xl border-2 border-dashed min-h-[280px] flex flex-col items-center justify-center cursor-pointer transition-colors",
                dragging
                  ? "border-[#0071a3] bg-[rgba(0,113,163,0.06)]"
                  : "border-[var(--border-accent)] bg-[var(--surface-elevated)]/50 hover:bg-[var(--surface-elevated)]"
              )}
              onClick={() => document.getElementById("scan-file")?.click()}
            >
              <input
                id="scan-file"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt="Preview"
                  className="absolute inset-3 rounded-xl object-cover w-[calc(100%-24px)] h-[calc(100%-24px)]"
                />
              ) : (
                <>
                  <div className="w-14 h-14 rounded-2xl bg-[rgba(0,113,163,0.1)] flex items-center justify-center mb-4">
                    <Upload className="w-7 h-7 text-[#0071a3]" />
                  </div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    Drop a receipt or pantry photo
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    or click to browse · JPEG, PNG, WebP
                  </p>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                className="flex-1 min-w-[140px] bg-[#0071a3] hover:bg-[#005a82] text-white"
                disabled={!file || busy}
                onClick={analyze}
              >
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Analyze
                  </>
                )}
              </Button>
              <Button variant="outline" className="border-[var(--border)]" onClick={reset}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </Button>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-0 overflow-hidden">
          <div className="px-5 pt-5 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <Camera className="w-4 h-4 text-[#0071a3]" />
              Live pantry preview
            </div>
            <span className="text-xs text-[var(--text-muted)] font-[family-name:var(--font-neumas-mono)]">
              drag to rotate
            </span>
          </div>
          <PantryScene items={cubes} />
        </GlassCard>
      </div>

      <AnimatePresence>
        {extracted.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Detected items</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {extracted.map((row, i) => (
                <motion.div
                  key={row.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <GlassCard hover={false} className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[var(--surface-elevated)] flex items-center justify-center shrink-0">
                        <Package className="w-5 h-5 text-[#0071a3]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[var(--text-primary)] truncate">{row.name}</p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {row.quantity} {row.unit} · {row.category}
                        </p>
                        <p className="text-xs font-[family-name:var(--font-neumas-mono)] text-[var(--text-muted)] mt-1">
                          {Math.round(row.confidence * 100)}% confidence
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] shrink-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={row.add}
                          onChange={() =>
                            setExtracted((prev) =>
                              prev.map((r) => (r.id === row.id ? { ...r, add: !r.add } : r))
                            )
                          }
                          className="accent-[#0071a3]"
                        />
                        Add
                      </label>
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </div>
            <Button
              className="w-full sm:w-auto bg-[#0071a3] hover:bg-[#005a82] text-white"
              onClick={saveAll}
            >
              <Plus className="w-4 h-4 mr-2" />
              Save all
            </Button>
            <p className="text-xs text-[var(--text-muted)]">
              <Link href="/dashboard/inventory" className="text-[#0071a3] font-medium">
                View inventory
              </Link>{" "}
              ·{" "}
              <Link href="/dashboard/scans" className="text-[#0071a3] font-medium">
                Scan history
              </Link>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
