'use client'

"use client";

import { useEffect, useState } from "react";
import { listScans } from "@/lib/api/endpoints";
import type { Scan } from "@/lib/api/types";
import { captureUIError } from "@/lib/analytics";
import { PageErrorState, PageLoadingState } from "@/components/ui/PageState";

export default function ScansHistoryPage() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchScans() {
      try {
        setError(null);
        const data = await listScans({ limit: 50 });
        setScans(data);
      } catch (err) {
        setError("We couldn't load scan history.");
        captureUIError("load_scan_history", err);
      } finally {
        setLoading(false);
      }
    }
    fetchScans();
  }, []);

  if (loading) {
    return <PageLoadingState title="Loading scan history" message="Fetching your recent receipt scans." />;
  }

  if (error) {
    return <PageErrorState title="Scan history unavailable" message={error} onRetry={() => window.location.reload()} />;
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Scan History</h1>
      <div className="space-y-4">
        {scans.length === 0 ? (
          <p className="text-gray-500">No scans yet.</p>
        ) : scans.map((scan) => (
          <div key={scan.id} className="border rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">{scan.scan_type}</p>
                <p className="text-sm text-gray-600">
                  {new Date(scan.created_at).toLocaleString()}
                </p>
              </div>
              <span className={`px-2 py-1 rounded text-sm ${
                scan.status === "completed" ? "bg-green-100 text-green-800" :
                scan.status === "processing" ? "bg-yellow-100 text-yellow-800" :
                "bg-gray-100 text-gray-800"
              }`}>
                {scan.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
