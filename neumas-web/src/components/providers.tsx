"use client";

import { useEffect } from "react";
import { PostHogProvider } from "posthog-js/react";
import posthog from "posthog-js";
import { Toaster } from "sonner";

import { initPostHog } from "@/lib/analytics";
import { PageTracker } from "@/components/analytics/PageTracker";

export function Providers({ children }: { children: React.ReactNode }) {
  // Initialise PostHog once on the client. initPostHog() is idempotent and
  // guards against server-side execution.
  useEffect(() => {
    initPostHog();
  }, []);

  return (
    <PostHogProvider client={posthog}>
      <PageTracker />
      {children}
      <Toaster
        position="bottom-right"
        theme="light"
        toastOptions={{
          classNames: {
            success:
              "!bg-[var(--surface)] !border !border-[rgba(0,113,163,0.25)] !text-[var(--text-primary)] [&_[data-icon]]:!text-[#0071a3]",
            error:
              "!bg-[var(--surface)] !border !border-[rgba(255,59,48,0.35)] !text-[var(--text-primary)] [&_[data-icon]]:!text-[#ff3b30]",
            warning:
              "!bg-[var(--surface)] !border !border-[rgba(255,149,0,0.35)] !text-[var(--text-primary)] [&_[data-icon]]:!text-[#ff9500]",
          },
          style: {
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
          },
        }}
      />
    </PostHogProvider>
  );
}
