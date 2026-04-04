/**
 * Sentry client-side (browser) initialisation.
 * Automatically imported by @sentry/nextjs via next.config.ts withSentryConfig.
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_ENVIRONMENT ?? process.env.ENVIRONMENT ?? "development",
  release: process.env.NEXT_PUBLIC_APP_VERSION,

  // Capture 100% of transactions in development, 10% in production.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Capture 100% of replays on error; 0% of session replays (cost control).
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Suppress noisy console output in development.
  debug: false,
});
