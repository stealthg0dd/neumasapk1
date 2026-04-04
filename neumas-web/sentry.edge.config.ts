/**
 * Sentry Edge runtime initialisation.
 * Called from instrumentation.ts when NEXT_RUNTIME === "edge".
 */

import * as Sentry from "@sentry/nextjs";

export function initSentryEdge() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.ENVIRONMENT ?? "development",
    release: process.env.NEXT_PUBLIC_APP_VERSION,

    // Edge runs are typically short—capture all of them.
    tracesSampleRate: 1.0,

    debug: false,
  });
}
