"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import { Sidebar } from "@/components/layout/Sidebar";
import { Navbar } from "@/components/layout/Navbar";
import { useAuthStore, selectIsAuthenticated } from "@/lib/store/auth";
import { fadeIn } from "@/lib/design-system";
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

  // Client-side auth guard — redirect to /login if not authenticated
  useEffect(() => {
    if (hasHydrated && !isAuth) {
      router.replace("/login");
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
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Navbar />

        {/* Scrollable page area */}
        <motion.main
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8"
        >
          {children}
        </motion.main>

        {/* Footer */}
        <footer className="shrink-0 h-10 flex items-center justify-between px-6 border-t border-border/40 text-xs text-muted-foreground">
          <span>Neumas v0.1.0</span>
          <div className="flex items-center gap-1.5">
            {workerOk === null ? (
              <span className="w-1.5 h-1.5 rounded-full bg-border animate-pulse" />
            ) : workerOk ? (
              <span className="w-1.5 h-1.5 rounded-full bg-mint-500 animate-pulse" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            )}
            <span>
              {workerOk === null
                ? "Checking status…"
                : workerOk
                ? "All systems operational"
                : "Background worker unavailable"}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
