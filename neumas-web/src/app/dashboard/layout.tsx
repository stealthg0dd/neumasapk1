"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Sidebar } from "@/components/layout/Sidebar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
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
    <ErrorBoundary
      fallback={(traceId) => (
        <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-4">
          <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900">Something went wrong</h2>
            <p className="mt-2 text-sm text-gray-500">
              The dashboard hit an unexpected error. Reload the page to recover.
            </p>
            {traceId && (
              <code className="mt-4 block rounded-lg bg-gray-50 px-3 py-2 text-left text-xs text-gray-500 break-all">
                Trace ID: {traceId}
              </code>
            )}
            <div className="mt-6 flex justify-center">
              <Button
                type="button"
                className="bg-[#0071a3] text-white hover:bg-[#005f8a]"
                onClick={() => window.location.reload()}
              >
                Reload page
              </Button>
            </div>
          </div>
        </div>
      )}
    >
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
    </ErrorBoundary>
  );
}
