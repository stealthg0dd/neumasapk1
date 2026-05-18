/**
 * POST /api/internal/startup
 *
 * Registers neumas-web with the agent OS router-system.
 * Called externally (e.g. post-deploy health probe) or from instrumentation.ts.
 *
 * Returns 200 on success, 503 if AGENT_OS_URL is not configured.
 */

import { NextResponse } from "next/server";
import { serverConfig } from "@/lib/config";
import { withLogger, withErrorHandler } from "@/lib/api-handler";

export const runtime = "nodejs";

async function handler(): Promise<NextResponse> {
  const { agentOsUrl, agentOsApiKey } = serverConfig;

  if (!agentOsUrl) {
    return NextResponse.json(
      { error: "AGENT_OS_URL is not configured" },
      { status: 503 }
    );
  }

  const res = await fetch(`${agentOsUrl}/api/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(agentOsApiKey ? { "X-API-Key": agentOsApiKey } : {}),
    },
    body: JSON.stringify({
      repo_id: "neumas-web",
      service_name: "neumas-web",
      health_url: `${serverConfig.appUrl}/api/health`,
      base_url: serverConfig.appUrl,
      version: serverConfig.appVersion,
      environment: serverConfig.environment,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const details = await res.text().catch(() => "");
    return NextResponse.json(
      { registered: false, error: "Agent OS returned non-2xx", details },
      { status: res.status }
    );
  }

  return NextResponse.json({ registered: true });
}

export const POST = withErrorHandler(withLogger(handler));
