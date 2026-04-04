"use client";

/**
 * global-error.tsx — App Router root-level error boundary.
 *
 * Catches errors thrown by the root layout or any page that don't have a
 * closer error.tsx handler. Must include <html> and <body> because it
 * replaces the entire root layout when active.
 *
 * Sentry capture happens automatically via the SDK's Next.js integration;
 * this component surfaces the Sentry event ID as a trace ID for support.
 */

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect, useState } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [traceId, setTraceId] = useState<string | null>(null);

  useEffect(() => {
    const eventId = Sentry.captureException(error);
    setTraceId(eventId ?? null);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex items-center justify-center bg-[oklch(0.08_0.005_240)] text-[oklch(0.95_0.005_240)] px-4">
        <div className="max-w-md w-full rounded-xl border border-[oklch(0.22_0.01_240/0.6)] bg-[oklch(0.13_0.008_240)] p-8 shadow-lg text-center space-y-4">
          <div className="text-4xl">⚠️</div>
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-[oklch(0.65_0.01_240)]">
            An unexpected error has occurred. Our engineering team has been
            notified. If the problem persists, please contact support and
            include the trace ID below.
          </p>
          {traceId && (
            <code className="block rounded bg-[oklch(0.18_0.008_240)] px-3 py-2 text-xs font-mono text-[oklch(0.65_0.01_240)] break-all">
              Trace ID: {traceId}
            </code>
          )}
          {error.digest && (
            <code className="block rounded bg-[oklch(0.18_0.008_240)] px-3 py-2 text-xs font-mono text-[oklch(0.65_0.01_240)]">
              Digest: {error.digest}
            </code>
          )}
          <button
            onClick={reset}
            className="rounded-md bg-[oklch(0.55_0.18_260)] px-4 py-2 text-sm font-medium text-white hover:bg-[oklch(0.5_0.18_260)] transition-colors"
          >
            Try again
          </button>
        </div>
        {/* Invisible NextError keeps Next.js status code reporting intact */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
