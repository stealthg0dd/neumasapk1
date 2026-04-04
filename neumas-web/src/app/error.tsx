"use client";

/**
 * error.tsx — App Router route-level error boundary.
 *
 * Catches errors from any page or layout below the root. Captures the error
 * to Sentry and shows a trace ID the user can cite when contacting support.
 */

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";

export default function RouteError({
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
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md w-full rounded-xl border border-border bg-card p-8 shadow-lg text-center space-y-4">
        <div className="text-4xl">⚠️</div>
        <h1 className="text-xl font-semibold text-foreground">
          Something went wrong
        </h1>
        <p className="text-sm text-muted-foreground">
          An unexpected error occurred. Our team has been notified. If the
          problem persists, please contact support with the trace ID below.
        </p>
        {traceId && (
          <code className="block rounded bg-muted px-3 py-2 text-xs font-mono text-muted-foreground break-all">
            Trace ID: {traceId}
          </code>
        )}
        {error.digest && (
          <code className="block rounded bg-muted px-3 py-2 text-xs font-mono text-muted-foreground">
            Digest: {error.digest}
          </code>
        )}
        <button
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
