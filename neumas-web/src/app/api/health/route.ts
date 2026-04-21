/**
 * GET /api/health
 *
 * Returns backend connectivity from the web surface so production checks hit the
 * same origin as the browser while still proving the Railway API is reachable.
 *
 * Response shape:
 *  {
 *    status:      "healthy" | "unhealthy"
 *    backend:     "ok" | "error"
 *    supabase:    "ok" | "error" | "not_configured"
 *    redis:       "ok" | "error" | "not_configured"
 *    version:     string
 *    environment: string
 *  }
 */

import { type NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/backend-url";
import { publicConfig, serverConfig } from "@/lib/config";
import { withLogger, withErrorHandler } from "@/lib/api-handler";

export const runtime = "nodejs";

type BackendHealthPayload = {
  status?: string;
  service?: string;
  version?: string;
  environment?: string;
  supabase?: string | boolean | null;
  redis?: string | boolean | null;
  checks?: {
    supabase?: boolean | null;
    redis?: boolean | null;
  };
};

function extractHealthPayload(raw: unknown): BackendHealthPayload {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  if ("detail" in raw) {
    const detail = (raw as { detail?: unknown }).detail;
    if (detail && typeof detail === "object") {
      return detail as BackendHealthPayload;
    }
  }

  return raw as BackendHealthPayload;
}

function normalizeCheckStatus(value: unknown): "ok" | "error" | "not_configured" {
  if (value === true || value === "ok" || value === "healthy") {
    return "ok";
  }
  if (value === false || value === "error" || value === "unhealthy") {
    return "error";
  }
  return "not_configured";
}

async function handler(_req: NextRequest): Promise<NextResponse> {
  try {
    const backendResponse = await fetch(`${BACKEND_URL}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });

    const raw = await backendResponse.json().catch(() => ({}));
    const payload = extractHealthPayload(raw);

    const supabase = normalizeCheckStatus(payload.supabase ?? payload.checks?.supabase);
    const redis = normalizeCheckStatus(payload.redis ?? payload.checks?.redis);
    const isHealthy = backendResponse.ok && (payload.status === "healthy" || payload.status === "ok");

    return NextResponse.json(
      {
        status: isHealthy ? "healthy" : "unhealthy",
        service: payload.service ?? "neumas-api",
        backend: backendResponse.ok ? "ok" : "error",
        version: payload.version ?? process.env.npm_package_version ?? "0.1.0",
        environment: payload.environment ?? (serverConfig.environment || publicConfig.environment),
        supabase,
        redis,
      },
      { status: backendResponse.status }
    );
  } catch {
    return NextResponse.json(
      {
        status: "unhealthy",
        service: "neumas-api",
        backend: "error",
        version: process.env.npm_package_version ?? "0.1.0",
        environment: serverConfig.environment || publicConfig.environment,
        supabase: "error",
        redis: "error",
      },
      { status: 503 }
    );
  }
}

export const GET = withErrorHandler(withLogger(handler));
