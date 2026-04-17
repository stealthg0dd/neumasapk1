import React, { useState } from "react";
import type { DocumentLineItem } from "@/lib/api/endpoints";
import { updateDocumentLineItem } from "@/lib/api/endpoints";

interface EditableLineItemsProps {
  documentId: string;
  lineItems: DocumentLineItem[];
}

export default function EditableLineItems({ documentId, lineItems }: EditableLineItemsProps) {
  const [items, setItems] = useState(lineItems);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(idx: number, key: keyof DocumentLineItem, value: string | number | null) {
    const item = items[idx];
    setItems(items.map((it, i) => (i === idx ? { ...it, [key]: value } : it)));
    setSavingId(item.id);
    setError(null);
    try {
      await updateDocumentLineItem(documentId, item.id, { [key]: value });
    } catch (e) {
      setError("Failed to save. Try again.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="overflow-x-auto mt-4">
      <table className="min-w-full border text-sm bg-white rounded-xl">
        <thead>
          <tr className="bg-gray-50">
            <th className="px-3 py-2 text-left font-semibold">Item</th>
            <th className="px-3 py-2 text-left font-semibold">Qty</th>
            <th className="px-3 py-2 text-left font-semibold">Unit</th>
            <th className="px-3 py-2 text-left font-semibold">Price</th>
            <th className="px-3 py-2 text-left font-semibold">Total</th>
            <th className="px-3 py-2 text-left font-semibold">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id} className="border-t">
              <td className="px-3 py-2">
                <input
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={item.normalized_name ?? item.raw_name ?? ""}
                  onChange={e => handleChange(idx, "normalized_name", e.target.value)}
                  disabled={savingId === item.id}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  className="w-16 border rounded px-2 py-1 text-sm"
                  type="number"
                  value={item.normalized_quantity ?? item.raw_quantity ?? ""}
                  onChange={e => handleChange(idx, "normalized_quantity", Number(e.target.value))}
                  disabled={savingId === item.id}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  className="w-16 border rounded px-2 py-1 text-sm"
                  value={item.normalized_unit ?? item.raw_unit ?? ""}
                  onChange={e => handleChange(idx, "normalized_unit", e.target.value)}
                  disabled={savingId === item.id}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  className="w-20 border rounded px-2 py-1 text-sm"
                  type="number"
                  value={item.raw_price ?? ""}
                  onChange={e => handleChange(idx, "raw_price", Number(e.target.value))}
                  disabled={savingId === item.id}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  className="w-20 border rounded px-2 py-1 text-sm"
                  type="number"
                  value={item.raw_total ?? ""}
                  onChange={e => handleChange(idx, "raw_total", Number(e.target.value))}
                  disabled={savingId === item.id}
                />
              </td>
              <td className="px-3 py-2 text-center">
                <span className={`inline-block px-2 py-0.5 rounded text-xs ${item.confidence >= 0.9 ? "bg-green-100 text-green-700" : item.confidence >= 0.75 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                  {Math.round(item.confidence * 100)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <div className="text-red-600 mt-2 text-sm">{error}</div>}
    </div>
  );
}
