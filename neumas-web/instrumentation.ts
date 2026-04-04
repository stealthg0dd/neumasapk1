/**
 * Next.js Instrumentation hook — runs once when the server process starts.
 *
 * Responsibilities:
 *  1. Initialise Sentry (server or edge runtime).
 *  2. Validate required environment variables (exits with code 1 on failure).
 *  3. Register neumas-web with the agent OS router-system.
 *
 * Dynamic imports inside the NEXT_RUNTIME guards are required to prevent
 * Node.js-only code from being evaluated by the Edge runtime.
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // ── 1. Sentry initialisation ──────────────────────────────────────────────
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initSentryServer } = await import("./sentry.server.config");
    initSentryServer();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const { initSentryEdge } = await import("./sentry.edge.config");
    initSentryEdge();
  }

  // Remaining tasks are Node.js-only.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateServerConfig, serverConfig } = await import("@/lib/config");
  const { logger } = await import("@/lib/logger");

  // ── 2. Validate environment variables ──────────────────────────────────────
  validateServerConfig();

  logger.info(
    { environment: serverConfig.environment },
    "neumas-web environment validated"
  );

  // ── 3. Register with agent OS ──────────────────────────────────────────────
  const { agentOsUrl, agentOsApiKey } = serverConfig;

  if (!agentOsUrl) {
    logger.warn(
      "AGENT_OS_URL is not set — skipping agent OS router-system registration"
    );
    return;
  }

  try {
    const res = await fetch(`${agentOsUrl}/api/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(agentOsApiKey ? { "X-API-Key": agentOsApiKey } : {}),
      },
      body: JSON.stringify({ repo_id: "neumas-web" }),
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      logger.info({ repo_id: "neumas-web" }, "registered with agent OS router-system");
    } else {
      logger.warn(
        { status: res.status },
        "agent OS registration returned non-2xx (non-fatal)"
      );
    }
  } catch (err) {
    logger.warn({ err }, "agent OS registration failed (non-fatal)");
  }
}
