'use client'

"use client";

/**
 * error.tsx — App Router route-level error boundary.
 *
 * Catches errors from any page or layout below the root. Captures the error
 * to Sentry and shows a trace ID the user can cite when contacting support.
 */

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (error.name === "ChunkLoadError") {
      window.location.reload();
      return;
    }
    Sentry.captureException(error);
  }, [error]);

  if (error.name === "ChunkLoadError") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-md w-full rounded-xl border border-border bg-card p-8 shadow-lg text-center space-y-4">
          <p className="text-sm text-muted-foreground">Updating&hellip;</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md w-full rounded-xl border border-border bg-card p-8 shadow-lg text-center space-y-4">
        <div className="text-4xl">⚠️</div>
        <h1 className="text-xl font-semibold text-foreground">
          Something went wrong
        </h1>
        <p className="text-sm text-muted-foreground">
          An unexpected error occurred. Our team has been notified. If the
          problem persists, reload the page or contact support with the trace ID below.
        </p>
        {error.digest && (
          <code className="block rounded bg-muted px-3 py-2 text-xs font-mono text-muted-foreground">
            Digest: {error.digest}
          </code>
        )}
        <div className="flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Reload page
          </button>
        </div>
      </div>
    </div>
  );
}
