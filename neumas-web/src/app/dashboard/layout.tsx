"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Sidebar } from "@/components/layout/Sidebar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { listScans } from "@/lib/api/endpoints";
import { isOnboardingComplete } from "@/lib/onboarding";
import { useAuthStore, selectHasSession } from "@/lib/store/auth";
import { get } from "@/lib/api/client";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const hasSession = useAuthStore(selectHasSession);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [workerOk, setWorkerOk] = useState<boolean | null>(null);
  const [allowDashboard, setAllowDashboard] = useState(false);

  useEffect(() => {
    get<unknown>("/api/predictions/", { limit: 1 })
      .then(() => setWorkerOk(true))
      .catch((err: { response?: { status: number } }) => {
        const status = err?.response?.status;
        setWorkerOk(!status || status < 500);
      });
  }, []);

  useEffect(() => {
    if (!hasHydrated || !hasSession) return;
    let cancelled = false;
    (async () => {
      try {
        const scans = await listScans({ limit: 1 });
        if (cancelled) return;
        if (scans.length === 0 && !isOnboardingComplete()) {
          router.replace("/onboard");
          return;
        }
      } catch {
        /* allow dashboard if scan check fails */
      }
      if (!cancelled) setAllowDashboard(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [hasHydrated, hasSession, router]);

  useEffect(() => {
    if (hasHydrated && !hasSession) {
      setAllowDashboard(false);
      router.replace("/login");
    }
  }, [hasHydrated, hasSession, router]);

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

  if (!hasSession) return null;

  if (!allowDashboard) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-500 animate-pulse" />
          <div className="w-24 h-1 rounded-full shimmer" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto px-4 pt-4 pb-20 sm:px-6 sm:pt-6 sm:pb-6">{children}</main>
        <MobileBottomNav />
        <footer className="hidden h-10 items-center justify-between border-t border-gray-100 bg-white px-6 text-xs text-gray-500 sm:flex">
          <span>Neumas</span>
          <span>
            {workerOk === null ? "Checking status..." : workerOk ? "Systems operational" : "Worker unavailable"}
          </span>
        </footer>
      </div>
    </div>
  );
}
