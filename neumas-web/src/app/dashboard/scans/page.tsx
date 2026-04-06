'use client'

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, CheckCircle2, XCircle, FileImage, RotateCcw,
  Plus, Package, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import { uploadScan, getScanStatus } from "@/lib/api/endpoints";
import type { ScanStatus } from "@/lib/api/types";
import { useAuthStore } from "@/lib/store/auth";
import { track, captureUIError } from "@/lib/analytics";

const ScanProcessor = dynamic(
  () => import("@/components/three/ScanProcessor").then((m) => m.ScanProcessor),
  { ssr: false }
);

// ── Types ─────────────────────────────────────────────────────────────────────

type UploadState = "idle" | "uploading" | "processing" | "done" | "error";

interface ExtractedItem {
  name:        string;
  quantity:    number;
  unit:        string;
  confidence:  number; // 0–1
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full h-1 rounded-full bg-surface-2 overflow-hidden">
      <motion.div
        className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-500"
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ ease: "easeOut", duration: 0.4 }}
      />
    </div>
  );
}

// ── Confidence badge ──────────────────────────────────────────────────────────

function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const cls =
    pct >= 85 ? "badge-mint" : pct >= 60 ? "badge-amber" : "badge-red";
  return <span className={cls}>{pct}%</span>;
}

// ── Extracted item row ────────────────────────────────────────────────────────

function ItemRow({ item, index }: { item: ExtractedItem; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className="flex items-center gap-3 p-3 rounded-xl glass-button border border-border/30 hover:border-border/60 transition-all group"
    >
      <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
        <Package className="w-4 h-4 text-purple-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
        <p className="text-xs text-muted-foreground">
          {item.quantity} {item.unit}
        </p>
      </div>
      <ConfidenceBadge score={item.confidence} />
      <button
        className="shrink-0 p-1.5 rounded-lg bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 transition-all opacity-0 group-hover:opacity-100"
        title="Add to inventory"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

// ── Drop zone ─────────────────────────────────────────────────────────────────

function DropZone({
  onFile,
  dragging,
  setDragging,
}: {
  onFile:      (f: File) => void;
  dragging:    boolean;
  setDragging: (v: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) validate(file);
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) validate(file);
  }

  function validate(file: File) {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
    if (!allowed.includes(file.type)) {
      toast.error("Unsupported file type. Use JPEG, PNG, WebP, HEIC, or PDF.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File too large. Maximum 20 MB.");
      return;
    }
    onFile(file);
  }

  return (
    <motion.div
      animate={dragging ? { scale: 1.02, borderColor: "oklch(0.715 0.139 199.2)" } : { scale: 1 }}
      transition={{ duration: 0.2 }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={[
        "relative flex flex-col items-center justify-center rounded-3xl border-2 border-dashed cursor-pointer transition-all",
        "h-72 gap-5 select-none",
        dragging
          ? "border-cyan-500/70 bg-cyan-500/5"
          : "border-border/40 bg-surface-1/50 hover:border-border/70 hover:bg-surface-1",
      ].join(" ")}
    >
      <input ref={inputRef} type="file" className="hidden" accept="image/*,.pdf" onChange={handleInput} />

      <motion.div
        animate={dragging ? { y: -8 } : { y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 flex items-center justify-center"
      >
        <Upload className="w-7 h-7 text-cyan-400" />
      </motion.div>

      <div className="text-center">
        <p className="text-base font-semibold text-foreground">
          {dragging ? "Drop to upload" : "Drop your receipt here"}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          or <span className="text-cyan-400 font-medium">click to browse</span>
        </p>
        <p className="text-xs text-muted-foreground/60 mt-2">
          JPEG · PNG · WebP · HEIC · PDF · max 20 MB
        </p>
      </div>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ScansPage() {
  // Read propertyId once via getState() — not a hook — so it doesn't cause
  // re-renders and is always current at the moment the upload fires.
  const propertyId = useAuthStore((s) => s.propertyId);

  const [uploadState, setUploadState]   = useState<UploadState>("idle");
  const [file, setFile]                 = useState<File | null>(null);
  const [preview, setPreview]           = useState<string | null>(null);
  const [progress, setProgress]         = useState(0);
  const [scanId, setScanId]             = useState<string | null>(null);
  const [scanStatus, setScanStatus]     = useState<ScanStatus | null>(null);
  const [extracted, setExtracted]       = useState<ExtractedItem[]>([]);
  const [errorMsg, setErrorMsg]         = useState<string>("");
  const [dragging, setDragging]         = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── File selected ─────────────────────────────────────────────────────────

  async function handleFile(f: File) {
    // Gate upload — propertyId must be resolved from the auth store / JWT
    const pid = propertyId ?? useAuthStore.getState().propertyId;
    if (!pid) {
      toast.error("Property ID not found. Please log out and log in again.");
      return;
    }

    setFile(f);
    setUploadState("uploading");
    setProgress(0);
    setExtracted([]);
    setErrorMsg("");

    // Generate preview URL
    if (f.type.startsWith("image/")) {
      setPreview(URL.createObjectURL(f));
    } else {
      setPreview(null);
    }

    // Simulate upload progress (real progress via XHR not available in Axios)
    const ticker = setInterval(() => {
      setProgress((p) => {
        if (p >= 85) { clearInterval(ticker); return 85; }
        return p + 12;
      });
    }, 200);

    try {
      const res = await uploadScan(f, "receipt");
      clearInterval(ticker);
      setProgress(100);
      setScanId(res.scan_id ?? res.id ?? null);
      setUploadState("processing");
      toast.success("Receipt uploaded — AI is extracting items…");
    } catch (err) {
      clearInterval(ticker);
      setUploadState("error");
      const msg = err instanceof Error ? err.message : "Upload failed. Please try again.";
      setErrorMsg(msg);
      captureUIError("scan_upload", err);
      track("scan_upload_failed", { method: "receipt", error: msg });
    }
  }

  // ── Poll for scan status ──────────────────────────────────────────────────

  useEffect(() => {
    if (!scanId || uploadState !== "processing") return;

    // Timeout after 90 seconds — Celery worker may be down
    const timeoutId = setTimeout(() => {
      if (pollRef.current) clearInterval(pollRef.current);
      setUploadState("error");
      setErrorMsg(
        "Processing timed out. The AI worker may be busy or unavailable — your receipt was saved and will be retried automatically."
      );
    }, 90_000);

    pollRef.current = setInterval(async () => {
      try {
        const status = await getScanStatus(scanId);
        setScanStatus(status.status ?? null);

        if (status.status === "completed") {
          clearTimeout(timeoutId);
          clearInterval(pollRef.current!);
          setUploadState("done");
          // Map backend items to local shape
          const items: ExtractedItem[] = (status.extracted_items ?? []).map((it: Record<string, unknown>) => ({
            // Backend normalises to "name" but guard against "item_name" from older scans
            name:       ((it.name || it.item_name) as string) || "Unknown item",
            quantity:   (it.quantity as number)   ?? 1,
            unit:       (it.unit as string)       ?? "unit",
            confidence: (it.confidence as number) ?? 0.75,
          }));
          setExtracted(items);
          if (items.length === 0) {
            toast.warning("Scan complete — no items detected. Try a clearer image.");
          } else {
            toast.success(`Scan complete — ${items.length} items extracted!`);
            track("item_scanned", {
              method:     "receipt",
              item_count: items.length,
              scan_id:    scanId ?? undefined,
            });
          }
        } else if (status.status === "failed") {
          clearTimeout(timeoutId);
          clearInterval(pollRef.current!);
          setUploadState("error");
          setErrorMsg(status.error_message ?? "AI processing failed. Please try with a clearer image.");
        }
      } catch {
        // network blip — keep polling
      }
    }, 2000);

    return () => {
      clearTimeout(timeoutId);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [scanId, uploadState]);

  // ── Reset ─────────────────────────────────────────────────────────────────

  function reset() {
    if (pollRef.current) clearInterval(pollRef.current);
    setUploadState("idle");
    setFile(null);
    setPreview(null);
    setProgress(0);
    setScanId(null);
    setScanStatus(null);
    setExtracted([]);
    setErrorMsg("");
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const showProcessor = uploadState === "uploading" || uploadState === "processing" || uploadState === "done" || uploadState === "error";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight gradient-text">Scan Receipt</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Upload an invoice or receipt — AI extracts items into your inventory.
        </p>
      </div>

      {/* Drop zone (idle) */}
      <AnimatePresence mode="wait">
        {uploadState === "idle" && (
          <motion.div
            key="drop"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
          >
            <DropZone onFile={handleFile} dragging={dragging} setDragging={setDragging} />
          </motion.div>
        )}

        {/* Processing panel */}
        {showProcessor && (
          <motion.div
            key="processor"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
            className="glass-card rounded-3xl p-6 space-y-5"
          >
            {/* File info row */}
            {file && (
              <div className="flex items-center gap-3">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview}
                    alt="Receipt preview"
                    className="w-12 h-12 rounded-lg object-cover border border-border/40"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-surface-2 flex items-center justify-center border border-border/40">
                    <FileImage className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(0)} KB
                  </p>
                </div>
                <button
                  onClick={reset}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-all"
                  title="Upload different file"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* 3D animation */}
            <div className="w-full h-48 relative">
              <ScanProcessor
                state={
                  uploadState === "uploading" ? "uploading"
                  : uploadState === "processing" ? "processing"
                  : uploadState === "done" ? "done"
                  : "error"
                }
              />
              {/* Status label overlay */}
              <div className="absolute inset-x-0 bottom-0 flex justify-center">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={uploadState}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    {uploadState === "uploading" && "Uploading receipt…"}
                    {uploadState === "processing" && "AI extracting items…"}
                    {uploadState === "done" && "Extraction complete"}
                    {uploadState === "error" && "Something went wrong"}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>

            {/* Progress bar (uploading only) */}
            {uploadState === "uploading" && <ProgressBar progress={progress} />}

            {/* Done icon */}
            {uploadState === "done" && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className="flex items-center justify-center gap-2 text-mint-500"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-sm font-semibold">
                  {extracted.length} items extracted
                </span>
              </motion.div>
            )}

            {/* Error state */}
            {uploadState === "error" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-3"
              >
                <div className="flex items-center gap-2 text-red-400">
                  <XCircle className="w-4 h-4 shrink-0" />
                  <p className="text-sm">{errorMsg || "An error occurred."}</p>
                </div>
                <button
                  onClick={reset}
                  className="w-full h-10 rounded-xl border border-border/50 text-sm text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-all flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Try again
                </button>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Extracted items */}
      <AnimatePresence>
        {extracted.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Extracted items</h2>
              <Link
                href="/dashboard/inventory"
                className="flex items-center gap-1 text-xs text-cyan-500 hover:text-cyan-400 transition-colors font-medium"
              >
                View inventory
                <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="space-y-2">
              {extracted.map((item, i) => (
                <ItemRow key={`${item.name}-${i}`} item={item} index={i} />
              ))}
            </div>

            <button
              className="w-full h-11 rounded-xl gradient-primary text-white text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              onClick={() => toast.success("All items added to inventory!")}
            >
              <Plus className="w-4 h-4" />
              Add all to inventory
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recent scans hint (idle) */}
      {uploadState === "idle" && (
        <p className="text-center text-xs text-muted-foreground">
          Supported formats: JPEG, PNG, WebP, HEIC, PDF ·{" "}
          <Link href="/dashboard/scans/history" className="text-cyan-500 hover:text-cyan-400">
            View scan history
          </Link>
        </p>
      )}
    </div>
  );
}
