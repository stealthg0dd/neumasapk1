"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { listInventoryItems, listRecentScans, postScanUpload, getScanStatus } from "@/lib/api/endpoints";
import type { InventoryItem, ScanStatusResponse } from "@/lib/api/types";

function cardClassName() {
  return "border border-gray-100 rounded-xl shadow-sm p-6 bg-white hover:border-blue-200 transition-colors duration-200";
}

function getStatus(item: InventoryItem): "In Stock" | "Low Stock" | "Out" {
  if (item.stock_status === "out_of_stock" || item.quantity <= 0) return "Out";
  if (item.stock_status === "low_stock" || item.quantity <= item.min_quantity) return "Low Stock";
  return "In Stock";
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [scansCount, setScansCount] = useState(0);
  const [search, setSearch] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanResult, setScanResult] = useState<ScanStatusResponse | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const [inv, recent] = await Promise.all([
          listInventoryItems({ limit: 100 }),
          listRecentScans({ limit: 20 }),
        ]);
        setItems(inv.items ?? []);
        setScansCount(recent.length);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  const lowStockCount = useMemo(
    () => items.filter((i) => getStatus(i) !== "In Stock").length,
    [items]
  );

  const onFile = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return;
    setFile(f);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    onFile(e.dataTransfer.files?.[0] ?? null);
  };

  const onScan = async () => {
    if (!file) return;
    setScanBusy(true);
    setScanResult(null);
    try {
      const queued = await postScanUpload(file, "receipt");
      const id = queued.scan_id || queued.id;
      if (!id) return;
      let done = false;
      while (!done) {
        const status = await getScanStatus(id);
        if (status.status === "completed" || status.status === "failed") {
          setScanResult(status);
          done = true;
        } else {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    } finally {
      setScanBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        <div className={cardClassName()}>
          <p className="text-gray-600">Total Inventory Items</p>
          <p className="text-3xl font-semibold text-gray-900 mt-2">{loading ? "Getting data..." : items.length}</p>
        </div>
        <div className={cardClassName()}>
          <p className="text-gray-600">Low / Out of Stock</p>
          <p className="text-3xl font-semibold text-gray-900 mt-2">{loading ? "Getting data..." : lowStockCount}</p>
        </div>
        <div className={cardClassName()}>
          <p className="text-gray-600">Recent Scans</p>
          <p className="text-3xl font-semibold text-gray-900 mt-2">{loading ? "Getting data..." : scansCount}</p>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.08 }}
        className={cardClassName()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-gray-900 font-semibold">Inventory</h2>
          <input
            value={search}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            placeholder="Search inventory..."
            className="w-64 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="py-2">Item name</th>
                <th className="py-2">Quantity</th>
                <th className="py-2">Status</th>
                <th className="py-2">Last updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 50).map((item) => {
                const status = getStatus(item);
                const pillClass =
                  status === "In Stock"
                    ? "bg-emerald-50 text-emerald-700"
                    : status === "Low Stock"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-red-50 text-red-700";
                return (
                  <tr key={item.id} className="border-b border-gray-50">
                    <td className="py-3 text-gray-900">{item.name}</td>
                    <td className="py-3 text-gray-700">{item.quantity}</td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${pillClass}`}>{status}</span>
                    </td>
                    <td className="py-3 text-gray-600">{new Date(item.updated_at).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.16 }}
        className={cardClassName()}
      >
        <h2 className="text-gray-900 font-semibold mb-3">Upload receipt or product photo to scan</h2>
        <div
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer ${
            dragging ? "border-blue-400 bg-blue-50" : "border-blue-200"
          }`}
          onClick={() => document.getElementById("scan-upload-input")?.click()}
        >
          <input
            id="scan-upload-input"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          <p className="text-blue-600 font-medium">{file ? file.name : "Drop image here or click to upload"}</p>
        </div>
        <button
          onClick={onScan}
          disabled={!file || scanBusy}
          className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50"
        >
          {scanBusy ? "Scanning..." : "Run Scan"}
        </button>

        {scanResult && (
          <div className="mt-4 border border-gray-100 rounded-lg p-4 bg-gray-50">
            <p className="text-sm text-gray-700">Status: {scanResult.status}</p>
            <p className="text-sm text-gray-700">Items detected: {scanResult.items_detected ?? 0}</p>
          </div>
        )}
      </motion.section>
    </div>
  );
}
