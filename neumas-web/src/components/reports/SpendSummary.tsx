import React, { useEffect, useState } from "react";
import { listDocuments, type Document } from "@/lib/api/endpoints";

export default function SpendSummary() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const resp = await listDocuments({ page_size: 100 });
        setDocs(resp.documents);
      } catch {
        setError("Failed to load documents");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Aggregate spend by vendor and category
  const spendByVendor: Record<string, number> = {};
  const spendByCategory: Record<string, number> = {};
  docs.forEach((doc) => {
    if (!doc.line_items) return;
    doc.line_items.forEach((li) => {
      const vendor = doc.raw_vendor_name || "Unknown";
      spendByVendor[vendor] = (spendByVendor[vendor] || 0) + (li.raw_total || 0);
      const cat = li.normalized_name || li.raw_name || "Uncategorized";
      spendByCategory[cat] = (spendByCategory[cat] || 0) + (li.raw_total || 0);
    });
  });

  return (
    <div className="mt-8 grid md:grid-cols-2 gap-8">
      <div>
        <h3 className="text-lg font-semibold mb-2 text-gray-900">Spend by Vendor</h3>
        {loading ? (
          <div className="text-gray-400 text-sm">Loading…</div>
        ) : error ? (
          <div className="text-red-600 text-sm">{error}</div>
        ) : (
          <ul className="space-y-1">
            {Object.entries(spendByVendor)
              .sort((a, b) => b[1] - a[1])
              .map(([vendor, total]) => (
                <li key={vendor} className="flex justify-between text-sm">
                  <span>{vendor}</span>
                  <span className="font-mono">${total.toFixed(2)}</span>
                </li>
              ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="text-lg font-semibold mb-2 text-gray-900">Spend by Category</h3>
        {loading ? (
          <div className="text-gray-400 text-sm">Loading…</div>
        ) : error ? (
          <div className="text-red-600 text-sm">{error}</div>
        ) : (
          <ul className="space-y-1">
            {Object.entries(spendByCategory)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, total]) => (
                <li key={cat} className="flex justify-between text-sm">
                  <span>{cat}</span>
                  <span className="font-mono">${total.toFixed(2)}</span>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}
