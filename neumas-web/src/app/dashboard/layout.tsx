'use client'

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Sidebar } from "@/components/layout/Sidebar";
import { useAuthStore, selectIsAuthenticated } from "@/lib/store/auth";
import { get } from "@/lib/api/client";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router        = useRouter();
  const isAuth        = useAuthStore(selectIsAuthenticated);
  const hasHydrated   = useAuthStore((s) => s._hasHydrated);

  // Health: null=checking, true=ok, false=degraded
  const [workerOk, setWorkerOk] = useState<boolean | null>(null);

  useEffect(() => {
    // Lightweight health probe — just hit a fast read-only endpoint
    get<unknown>("/api/predictions/", { limit: 1 })
      .then(() => setWorkerOk(true))
      .catch((err: { response?: { status: number } }) => {
        // 401 means API is reachable; only mark degraded on 5xx / network error
        const status = err?.response?.status;
        setWorkerOk(!status || status < 500);
      });
  }, []);

  // Client-side auth guard — redirect to /auth if not authenticated
  useEffect(() => {
    if (hasHydrated && !isAuth) {
      router.replace("/auth");
    }
  }, [hasHydrated, isAuth, router]);

  // Show minimal skeleton while Zustand rehydrates from localStorage
  if (!hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-500 animate-pulse" />
          <div className="w-24 h-1 rounded-full shimmer" />
        </div>
      </div>
    );
  }

  if (!isAuth) return null; // redirect in progress

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc]">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
        <footer className="h-10 px-6 border-t border-gray-100 bg-white flex items-center justify-between text-xs text-gray-500">
          <span>Neumas</span>
          <span>{workerOk === null ? "Checking status..." : workerOk ? "Systems operational" : "Worker unavailable"}</span>
        </footer>
      </div>
    </div>
  );
}
