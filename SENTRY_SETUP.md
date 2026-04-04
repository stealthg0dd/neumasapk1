# Neumas — Sentry Observability Setup

> Last updated: 2026-04-03

---

## 1. Projects and DSNs

| Service | Sentry Project | DSN |
|---------|---------------|-----|
| **neumas-web** (Next.js) | `neumas-web` | `https://f149d55bb0fc5b21f18bb82311b84b05@o4511137130938368.ingest.de.sentry.io/4511153825054800` |
| **neumas-backend** (FastAPI + Celery worker) | `neumas-worker` | Set as `SENTRY_DSN` in backend env — obtain from Sentry dashboard |

Both projects sit in the same Sentry organisation (org ID `4511137130938368`).

---

## 2. Environment Variables

### neumas-web

| Variable | Value / Notes |
|----------|--------------|
| `NEXT_PUBLIC_SENTRY_DSN` | `https://f149d55bb0fc5b21f18bb82311b84b05@o4511137130938368.ingest.de.sentry.io/4511153825054800` |
| `SENTRY_DSN` | Same DSN as above (for server-side API route capture) |
| `SENTRY_AUTH_TOKEN` | **Secret** — see §3. Set in CI/CD env only, never commit. |
| `SENTRY_ORG` | Your Sentry org slug (visible in `sentry.io/organizations/<slug>/`) |
| `NEXT_PUBLIC_APP_VERSION` | Git SHA or semver tag — set by CI pipeline at build time |
| `ENVIRONMENT` | `development` / `staging` / `production` |

### neumas-backend

| Variable | Value / Notes |
|----------|--------------|
| `SENTRY_DSN` | DSN from `neumas-worker` Sentry project |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1` in production, `1.0` in development |

---

## 3. Auth Token (SENTRY_AUTH_TOKEN)

The auth token is used **only during the CI/CD build** to upload source maps so Sentry shows readable stack traces. It is **never bundled into the running application**.

```
Token value: 568123a580567d35263ee040ac489c3400551a3260dba4c31a8f03d36a90214c
```

**Where to set it:**
- **Vercel**: Project → Settings → Environment Variables → `SENTRY_AUTH_TOKEN` (Production + Preview)
- **Railway** (neumas-web): Service → Variables → `SENTRY_AUTH_TOKEN`
- **GitHub Actions**: Repository → Settings → Secrets → `SENTRY_AUTH_TOKEN`

Do NOT add this token to `.env.local` files or commit it to source control.

---

## 4. Release Format

Set `NEXT_PUBLIC_APP_VERSION` to the release identifier at build time.

**Recommended CI pattern (GitHub Actions):**
```yaml
env:
  NEXT_PUBLIC_APP_VERSION: ${{ github.sha }}
```

For tagged releases:
```yaml
NEXT_PUBLIC_APP_VERSION: ${{ github.ref_name }}   # e.g. v1.2.3
```

Sentry groups issues by release. Use consistent values so you can correlate
errors to specific deploys.

---

## 5. What is Instrumented

### neumas-web (Next.js)

| Layer | How |
|-------|-----|
| Browser JS errors | `sentry.client.config.ts` — auto-captured |
| Session replay on error | `sentry.client.config.ts` — 100% of error sessions |
| API route unhandled errors | `withErrorHandler()` HOF in `src/lib/api-handler.ts` |
| Root layout render errors | `src/app/global-error.tsx` App Router boundary |
| Route-level render errors | `src/app/error.tsx` App Router boundary |
| React component errors | `src/components/error-boundary.tsx` class component |
| Server-side Node.js errors | `sentry.server.config.ts` via `instrumentation.ts` |
| Edge runtime errors | `sentry.edge.config.ts` via `instrumentation.ts` |

**Trace ID flow**: When an API route throws, `withErrorHandler` calls
`Sentry.captureException(err)` which returns a Sentry event ID. This is
returned to the caller as `trace_id` in the JSON error envelope:

```json
{
  "error": true,
  "message": "An unexpected error occurred. Please try again or contact support.",
  "trace_id": "a1b2c3d4e5f6...",
  "timestamp": "2026-04-03T12:00:00.000Z"
}
```

When users contact support they provide this `trace_id`, which maps directly
to the Sentry event.

### neumas-backend (FastAPI + Celery)

| Layer | How |
|-------|-----|
| HTTP request errors | `FastApiIntegration` + `StarletteIntegration` in `main.py` |
| Celery task failures | `CeleryIntegration` in `celery_app.py` |
| Celery Beat monitoring | `monitor_beat_tasks=True` in `CeleryIntegration` |

---

## 6. Alert Rules to Create in Sentry UI

Navigate to **Project Settings → Alerts → Create Alert Rule** for each rule below.

### 6.1 High Error Rate — neumas-web
- **Type**: Issue alert
- **Condition**: "The issue is seen more than 10 times in 1 hour"
- **Action**: Send email / Slack to `#neumas-errors`
- **Tags filter**: `environment:production`

### 6.2 New Issue in Production — neumas-web
- **Type**: Issue alert
- **Condition**: "A new issue is created"
- **Action**: Send to `#neumas-errors` Slack channel
- **Tags filter**: `environment:production`

### 6.3 High Error Rate — neumas-worker
- **Type**: Issue alert (on `neumas-worker` project)
- **Condition**: "The issue is seen more than 5 times in 30 minutes"
- **Action**: Page on-call (PagerDuty or Slack)
- **Tags filter**: `environment:production`

### 6.4 Scan Task Failure Spike
- **Type**: Metric alert
- **Dataset**: Errors
- **Metric**: Number of errors where `tags[celery.task_name] = "scans.process_scan"`
- **Condition**: > 3 errors in a 5-minute window
- **Critical threshold**: 10 errors
- **Action**: PagerDuty + Slack

### 6.5 Performance Regression — P95 API latency
- **Type**: Metric alert
- **Dataset**: Transactions
- **Metric**: p95(transaction.duration)
- **Condition**: > 2000 ms for 10 minutes
- **Filter**: `transaction.op:http.server`

### 6.6 Session Replay — Checkout / Scan Funnel Errors
- **Type**: Issue alert
- **Condition**: "The issue is first seen" AND has a session replay
- **Filter**: `url:*/dashboard/scans*`
- **Action**: Notify `#neumas-product`

---

## 7. Sampling Strategy

| Environment | Traces Sample Rate | Replay on Error |
|------------|-------------------|-----------------|
| development | 100% (1.0) | 100% |
| staging | 100% (1.0) | 100% |
| production | 10% (0.1) | 100% |

Health-check and startup routes (`/api/health`, `/api/internal/startup`)
are excluded from transaction tracing via `tracesSampler` in
`sentry.server.config.ts`.

---

## 8. Local Testing

To verify Sentry capture in development:

```ts
// Temporarily throw in any server component or route
import * as Sentry from "@sentry/nextjs";
Sentry.captureMessage("Test event from neumas-web dev");
```

Check the **neumas-web** project in Sentry — the event should appear within
seconds. Remove the test call before committing.
