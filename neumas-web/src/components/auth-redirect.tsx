"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { selectHasSession, useAuthStore } from "@/lib/store/auth";

/**
 * Silently redirects authenticated users to /dashboard.
 * Renders nothing — purely a side-effect client component so that
 * the parent (RootPage) can remain a server component and be fully
 * SSR-rendered for crawlers and LLMs.
 */
export function AuthRedirectIfLoggedIn() {
  const router = useRouter();
  const hasSession = useAuthStore(selectHasSession);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (hasHydrated && hasSession) {
      router.replace("/dashboard");
    }
  }, [hasHydrated, hasSession, router]);

  return null;
}
