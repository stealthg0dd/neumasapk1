"use client";

import { useEffect, useState } from "react";
import { getReorderRecommendations, type ReorderRecommendation } from "@/lib/api/endpoints";

const URGENCY_BADGE: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  urgent: "bg-orange-100 text-orange-800",
  soon: "bg-yellow-100 text-yellow-800",
  monitor: "bg-gray-100 text-gray-600",
};

const REASON_LABEL: Record<string, string> = {
  OUT_OF_STOCK: "Out of stock",
  CRITICALLY_LOW: "Critically low",
  BELOW_PAR: "Below par level",
  PROJECTED_STOCKOUT: "Projected stockout",
  RECOMMENDED_REORDER: "Recommended",
};

interface Props {
  propertyName?: string;
}

export function ReorderWidget({ propertyName }: Props) {
  const [recs, setRecs] = useState<ReorderRecommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getReorderRecommendations()
      .then(setRecs)
      .catch(() => setRecs([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-lg bg-gray-100" />)}
      </div>
    );
  }

  if (!recs.length) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-400">
        No reorder recommendations
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {recs.map((rec) => (
        <div
          key={rec.item_id}
          className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                URGENCY_BADGE[rec.urgency] ?? URGENCY_BADGE.monitor
              }`}
            >
              {rec.urgency}
            </span>
            <div className="min-w-0">
              <div className="font-medium text-gray-800 truncate">{rec.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {REASON_LABEL[rec.reason] ?? rec.reason}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0 ml-4">
            <div className="font-semibold text-gray-800">
              {rec.reorder_qty} {rec.unit}
            </div>
            <div className="text-xs text-gray-400">
              on hand: {rec.on_hand}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
