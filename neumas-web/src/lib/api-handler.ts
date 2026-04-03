/**
 * Higher-order functions for Next.js App Router API route handlers.
 *
 * withLogger      — structured pino logging (method, path, status, duration_ms)
 * withErrorHandler — catches unhandled errors, captures to Sentry, and returns
 *                    a JSON error envelope: { error, message, trace_id, timestamp }
 *
 * Compose both for production API routes:
 *   export const GET = withErrorHandler(withLogger(handler));
 *
 * Or use withErrorHandler on its own when you don't need logging:
 *   export const GET = withErrorHandler(handler);
 */

import { type NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";

type RouteHandler = (
  req: NextRequest,
  // Next.js 16+ passes params as Promise<Record<string,string>>; earlier versions
  // pass it as a plain Record. Accept both so the wrapper works across versions.
  ctx?: { params?: Promise<Record<string, string>> | Record<string, string> }
) => Promise<NextResponse | Response> | NextResponse | Response;

// ── withLogger ────────────────────────────────────────────────────────────────

/**
 * Wraps a route handler with structured pino logging.
 * Logs method, path, status, and duration_ms for every request.
 */
export function withLogger(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    const start = Date.now();
    const method = req.method;
    const path = new URL(req.url).pathname;

    let response: NextResponse | Response;
    try {
      response = await handler(req, ctx);
    } catch (err) {
      const duration_ms = Date.now() - start;
      logger.error({ method, path, status: 500, duration_ms, err }, "unhandled route error");
      throw err;
    }

    const duration_ms = Date.now() - start;
    logger.info({ method, path, status: response.status, duration_ms }, "api request");
    return response;
  };
}

// ── withErrorHandler ──────────────────────────────────────────────────────────

/**
 * Wraps a route handler so that any unhandled exception is:
 *  1. Captured in Sentry (returns an event ID used as trace_id)
 *  2. Logged via pino
 *  3. Returned as a structured JSON error envelope instead of a raw 500
 *
 * Error envelope shape:
 *  {
 *    error: true,
 *    message: string,          // human-readable (sanitised in production)
 *    trace_id: string | null,  // Sentry event ID — cite when contacting support
 *    timestamp: string,        // ISO 8601
 *  }
 */
export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      const traceId = Sentry.captureException(err);

      const isProduction = process.env.NODE_ENV === "production";
      const message = isProduction
        ? "An unexpected error occurred. Please try again or contact support."
        : err instanceof Error
        ? err.message
        : String(err);

      logger.error(
        {
          method: req.method,
          path: new URL(req.url).pathname,
          trace_id: traceId,
          err,
        },
        "api route unhandled error"
      );

      return NextResponse.json(
        {
          error: true,
          message,
          trace_id: traceId ?? null,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }
  };
}
