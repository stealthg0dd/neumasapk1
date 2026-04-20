"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { LandingPage } from "@/components/landing/LandingPage";
import { selectHasSession, useAuthStore } from "@/lib/store/auth";

export default function RootPage() {
  const router = useRouter();
  const hasSession = useAuthStore(selectHasSession);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (hasHydrated && hasSession) {
      router.replace("/dashboard");
    }
  }, [hasHydrated, hasSession, router]);

  if (!hasHydrated) {
    return (
      <div className="min-h-screen bg-white">
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-gray-200" />
        </div>
      </div>
    );
  }

  if (hasSession) {
    return null;
  }

  return <LandingPage />;
}
