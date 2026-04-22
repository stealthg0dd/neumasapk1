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
  RotateCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { itemToCube, type PantryItemCube } from "@/components/three/PantryScene";
import { batchInventoryUpdate, getScanStatus, uploadScan } from "@/lib/api/endpoints";
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

async function fileToImage(file: File): Promise<HTMLImageElement> {
  const src = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = src;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to load image"));
    });
    return image;
  } finally {
    URL.revokeObjectURL(src);
  }
}

async function blobToFile(blob: Blob, originalName: string): Promise<File> {
  const name = originalName.replace(/\.\w+$/, "") || "scan";
  return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
}

async function prepareMobileScanFile(file: File, rotation: number, zoom: number): Promise<File> {
  const image = await fileToImage(file);
  const rotate90 = Math.abs(rotation % 180) === 90;
  const sourceWidth = rotate90 ? image.height : image.width;
  const targetWidth = Math.min(1600, sourceWidth);
  const targetHeight = Math.round(targetWidth * 1.25);
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.save();
  ctx.translate(targetWidth / 2, targetHeight / 2);
  ctx.rotate((rotation * Math.PI) / 180);

  const baseWidth = rotate90 ? image.height : image.width;
  const baseHeight = rotate90 ? image.width : image.height;
  const scale = Math.max(targetWidth / baseWidth, targetHeight / baseHeight) * zoom;
  ctx.drawImage(
    image,
    (-image.width * scale) / 2,
    (-image.height * scale) / 2,
    image.width * scale,
    image.height * scale
  );
  ctx.restore();

  let quality = 0.9;
  let blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );

  while (blob && blob.size > 2 * 1024 * 1024 && quality > 0.45) {
    quality -= 0.1;
    blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
  }

  if (!blob) throw new Error("Image processing failed");
  return blobToFile(blob, file.name);
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
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1.05);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [preparedSize, setPreparedSize] = useState<number | null>(null);

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
    setRotation(0);
    setZoom(1.05);
    setUploadProgress(0);
    setPreparedSize(null);
  }, [preview]);

  const onFile = useCallback(
    (f: File) => {
      if (!f.type.startsWith("image/")) {
        toast.error("Please upload an image (JPEG, PNG, WebP).");
        return;
      }
      if (f.size > 12 * 1024 * 1024) {
        toast.error("Image must be under 12 MB.");
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
    setUploadProgress(0);
    setExtracted([]);
    setCubes([]);

    try {
      const prepared = await prepareMobileScanFile(file, rotation, zoom);
      setPreparedSize(prepared.size);
      const res = await uploadScan(prepared, "receipt", setUploadProgress);
      const sid = res.scan_id ?? res.id ?? null;
      setScanId(sid);
      setUploadProgress(100);
      toast.success("Scan queued — analyzing…");
    } catch (err) {
      captureUIError("scan_post", err);
      toast.error("Failed to upload receipt.");
      setBusy(false);
      setUploadProgress(0);
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
        if (s.status === "completed" || s.status === "partial_failed") {
          clearTimeout(t);
          if (pollRef.current) clearInterval(pollRef.current);
          const raw = s.extracted_items ?? [];
          const rows = raw.map((it, i) => mapExtracted(it as Record<string, unknown>, i));
          setExtracted(rows);
          setCubes(rows.map((r, i) => itemToCube(r.id, i, r.name)));
          setBusy(false);
          if (s.status === "partial_failed") {
            toast.warning(`Scan finished with warnings. ${rows.length} item${rows.length === 1 ? "" : "s"} extracted.`);
          } else {
            toast.success(`Found ${rows.length} item${rows.length === 1 ? "" : "s"}.`);
          }
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
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <div>
        <h1 className="text-[clamp(1.5rem,6vw,2rem)] font-bold tracking-tight text-[var(--text-primary)]">
          New scan
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Capture a receipt on shift, optimize it on-device, and sync inventory in seconds.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <GlassCard className="p-4 sm:p-6">
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
                "relative flex min-h-[320px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed transition-colors sm:min-h-[420px]",
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
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
              {preview ? (
                <div className="absolute inset-0 bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt="Receipt preview"
                    className="h-full w-full object-cover transition-transform"
                    style={{ transform: `rotate(${rotation}deg) scale(${zoom})` }}
                  />
                  <div className="absolute inset-x-4 top-4 rounded-2xl border border-white/70 bg-black/35 px-3 py-2 text-xs text-white backdrop-blur">
                    Crop frame is centered and optimized to under 2 MB before upload.
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex h-[88px] w-[88px] items-center justify-center rounded-3xl bg-[rgba(0,113,163,0.1)]">
                    <Camera className="h-10 w-10 text-[#0071a3]" aria-hidden />
                  </div>
                  <p className="text-center text-lg font-semibold text-[var(--text-primary)]">
                    Tap to open your camera
                  </p>
                  <p className="mt-2 text-center text-sm text-[var(--text-secondary)]">
                    Mobile uses the rear camera first. Desktop can still drag and drop.
                  </p>
                </>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setRotation((value) => value - 90)}
                disabled={!file || busy}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-primary)] disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                Rotate left
              </button>
              <button
                type="button"
                onClick={() => setRotation((value) => value + 90)}
                disabled={!file || busy}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-primary)] disabled:opacity-50"
              >
                <RotateCw className="h-4 w-4" />
                Rotate right
              </button>
              <label className="flex min-h-[44px] items-center gap-3 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-primary)]">
                <span className="whitespace-nowrap">Crop / zoom</span>
                <input
                  type="range"
                  min="1"
                  max="1.8"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  disabled={!file || busy}
                  className="w-full accent-[#0071a3]"
                />
              </label>
            </div>

            {(busy || uploadProgress > 0) && (
              <div className="rounded-2xl border border-[var(--border)] bg-white p-3">
                <div className="mb-2 flex items-center justify-between text-xs text-[var(--text-secondary)]">
                  <span>{scanId ? "Processing receipt" : "Uploading receipt"}</span>
                  <span className="font-mono">{uploadProgress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-elevated)]">
                  <div
                    className="h-full rounded-full bg-[#0071a3] transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                className="min-h-[44px] min-w-[140px] flex-1 bg-[#0071a3] text-base text-white hover:bg-[#005a82] sm:text-sm"
                disabled={!file || busy}
                onClick={analyze}
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Analyze receipt
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                className="min-h-[44px] border-[var(--border)] px-4 text-base sm:text-sm"
                onClick={reset}
              >
                Reset
              </Button>
            </div>

            <div className="text-xs text-[var(--text-muted)]">
              {file && (
                <p>
                  Original: {(file.size / (1024 * 1024)).toFixed(2)} MB
                  {preparedSize ? ` · Optimized: ${(preparedSize / (1024 * 1024)).toFixed(2)} MB` : " · Will compress before upload"}
                </p>
              )}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="overflow-hidden p-0">
          <div className="flex items-center justify-between px-5 pt-5 pb-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <Camera className="h-4 w-4 text-[#0071a3]" />
              Live pantry preview
            </div>
            <span className="text-xs font-[family-name:var(--font-neumas-mono)] text-[var(--text-muted)]">
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
            <div className="grid gap-3 sm:grid-cols-2">
              {extracted.map((row, i) => (
                <motion.div
                  key={row.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <GlassCard hover={false} className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-elevated)]">
                        <Package className="h-5 w-5 text-[#0071a3]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-[var(--text-primary)]">{row.name}</p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {row.quantity} {row.unit} · {row.category}
                        </p>
                        <p className="mt-1 text-xs font-[family-name:var(--font-neumas-mono)] text-[var(--text-muted)]">
                          {Math.round(row.confidence * 100)}% confidence
                        </p>
                      </div>
                      <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-[var(--text-secondary)]">
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
              className="w-full bg-[#0071a3] text-white hover:bg-[#005a82] sm:w-auto"
              onClick={saveAll}
            >
              <Plus className="mr-2 h-4 w-4" />
              Save all
            </Button>
            <p className="text-xs text-[var(--text-muted)]">
              <Link href="/dashboard/inventory" className="font-medium text-[#0071a3]">
                View inventory
              </Link>{" "}
              ·{" "}
              <Link href="/dashboard/scans" className="font-medium text-[#0071a3]">
                Scan history
              </Link>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
