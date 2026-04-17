"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { listVendors, listCatalogItems, type Vendor } from "@/lib/api/endpoints";

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [catalogItems, setCatalogItems] = useState<Record<string, unknown>[]>([]);
  const [tab, setTab] = useState<"vendors" | "catalog">("vendors");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  async function loadVendors() {
    setLoading(true);
    setError(null);
    try {
      const resp = await listVendors({ page_size: 50 });
      setVendors(resp.vendors);
    } catch {
      setError("Failed to load vendors");
    } finally {
      setLoading(false);
    }
  }

  async function loadCatalog() {
    setLoading(true);
    setError(null);
    try {
      const resp = await listCatalogItems({ q: searchQuery || undefined, page_size: 50 });
      setCatalogItems(resp.items);
    } catch {
      setError("Failed to load catalog");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "vendors") loadVendors();
    else loadCatalog();
  }, [tab]);

  useEffect(() => {
    if (tab === "catalog") {
      const id = setTimeout(() => loadCatalog(), 300);
      return () => clearTimeout(id);
    }
  }, [searchQuery, tab]);

  const filteredVendors = vendors.filter(
    (v) =>
      !searchQuery ||
      v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (v.contact_name ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-gray-900 font-semibold text-lg">Vendors</h1>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 text-sm">
          {(["vendors", "catalog"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-md capitalize transition-colors ${
                tab === t
                  ? "bg-white text-gray-900 shadow-sm font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "catalog" ? "Price Catalog" : "Vendors"}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <input
        type="search"
        placeholder={tab === "vendors" ? "Search vendors…" : "Search catalog items…"}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
      />

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
          Loading…
        </div>
      ) : error ? (
        <div className="border border-red-200 rounded-xl bg-red-50 p-4 text-red-700 text-sm">
          {error}
        </div>
      ) : tab === "vendors" ? (
        !filteredVendors.length ? (
          <div className="border border-gray-100 rounded-xl bg-white p-8 text-center text-gray-400 text-sm">
            No vendors found
          </div>
        ) : (
          <div className="space-y-3">
            {filteredVendors.map((vendor) => (
              <div
                key={vendor.id}
                className="border border-gray-100 rounded-xl bg-white p-4 flex items-start justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{vendor.name}</p>
                    {!vendor.is_active && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                        Inactive
                      </span>
                    )}
                  </div>
                  {vendor.contact_name && (
                    <p className="text-sm text-gray-600 mt-0.5">{vendor.contact_name}</p>
                  )}
                  <div className="flex flex-wrap gap-3 mt-1">
                    {vendor.contact_email && (
                      <a
                        href={`mailto:${vendor.contact_email}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {vendor.contact_email}
                      </a>
                    )}
                    {vendor.phone && (
                      <span className="text-xs text-gray-500">{vendor.phone}</span>
                    )}
                  </div>
                  {vendor.notes && (
                    <p className="text-xs text-gray-400 mt-1 italic">{vendor.notes}</p>
                  )}
                </div>
                <p className="text-xs text-gray-400 shrink-0">
                  {new Date(vendor.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )
      ) : (
        // Catalog tab
        !catalogItems.length ? (
          <div className="border border-gray-100 rounded-xl bg-white p-8 text-center text-gray-400 text-sm">
            No catalog items found
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-100 rounded-xl bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-3 font-medium text-gray-700">Item</th>
                  <th className="px-4 py-3 font-medium text-gray-700">Category</th>
                  <th className="px-4 py-3 font-medium text-gray-700">Unit</th>
                  <th className="px-4 py-3 font-medium text-gray-700 text-right">Last Price</th>
                </tr>
              </thead>
              <tbody>
                {catalogItems.map((item, idx) => (
                  <tr key={String(item.id ?? idx)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {String(item.name ?? "—")}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {String(item.category ?? "—")}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {String(item.unit ?? "—")}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {item.last_price != null
                        ? `$${Number(item.last_price).toFixed(2)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </motion.div>
  );
}
