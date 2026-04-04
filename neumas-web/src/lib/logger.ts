/**
 * Server-side pino logger for neumas-web.
 *
 * Outputs JSON in production and colorised, human-readable text in development
 * (via pino-pretty). Import this only in Server Components, API route handlers,
 * and instrumentation.ts — never in browser-side code.
 */

import pino from "pino";

const isDev = process.env.NODE_ENV === "development";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  base: { service: "neumas-web" },
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:HH:MM:ss",
        ignore: "pid,hostname,service",
      },
    },
  }),
});
