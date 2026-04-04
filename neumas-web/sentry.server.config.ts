/**
 * Sentry server-side (Node.js runtime) initialisation.
 * Called from instrumentation.ts when NEXT_RUNTIME === "nodejs".
 */

import * as Sentry from "@sentry/nextjs";

export function initSentryServer() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.ENVIRONMENT ?? "development",
    release: process.env.NEXT_PUBLIC_APP_VERSION,

    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // Exclude noisy health-check paths from traces.
    tracesSampler: (samplingContext) => {
      const path = samplingContext?.attributes?.["http.target"] as string | undefined
        ?? samplingContext?.name ?? "";
      if (path.includes("/api/health") || path.includes("/api/internal/startup")) {
        return 0;
      }
      return process.env.NODE_ENV === "production" ? 0.1 : 1.0;
    },

    debug: false,
  });
}
