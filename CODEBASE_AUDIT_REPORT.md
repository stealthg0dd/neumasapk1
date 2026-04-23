# 1. Executive Summary

## Tech stack
- Monorepo with pnpm workspaces: [package.json](package.json#L1)
- Web app: Next.js 16 App Router + React 19 + TypeScript + Axios + Supabase SSR + Sentry + PostHog: [neumas-web/package.json](neumas-web/package.json#L1)
- Backend: FastAPI + Pydantic v2 + Supabase + Celery/Redis + Sentry: [neumas-backend/pyproject.toml](neumas-backend/pyproject.toml#L1), [neumas-backend/app/main.py](neumas-backend/app/main.py#L1)
- Background processing: Celery workers/beat with Redis: [neumas-backend/app/core/celery_app.py](neumas-backend/app/core/celery_app.py#L1)
- Health sidecar service: separate FastAPI health agent: [neumas-health-agent/main.py](neumas-health-agent/main.py#L1)
- Legacy frontend (deprecated) still present: [neumas-web-vite/DEPRECATED.md](neumas-web-vite/DEPRECATED.md#L1)

## Architecture style
- Multi-service monorepo:
1. Next.js frontend in [neumas-web](neumas-web)
2. FastAPI backend in [neumas-backend](neumas-backend)
3. Health agent in [neumas-health-agent](neumas-health-agent)
4. Deprecated Vite frontend in [neumas-web-vite](neumas-web-vite)

## Overall health score
- 5.5/10
- Verdict: good momentum and broad feature coverage, but critical security/config drift and route correctness bugs can cause production incidents or bypass intent.

## Biggest risks
1. Unsafe default internal admin secret plus query-param auth on hidden endpoint:
[neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L111), [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L112), [neumas-backend/app/api/routes/insights.py](neumas-backend/app/api/routes/insights.py#L90)
2. Route-order bug in inventory (dynamic route declared before static single-segment paths):
[neumas-backend/app/api/routes/inventory.py](neumas-backend/app/api/routes/inventory.py#L76), [neumas-backend/app/api/routes/inventory.py](neumas-backend/app/api/routes/inventory.py#L195), [neumas-backend/app/api/routes/inventory.py](neumas-backend/app/api/routes/inventory.py#L285)
3. Next env validation mismatch can hard-fail startup:
[neumas-web/src/lib/config.ts](neumas-web/src/lib/config.ts#L33), [neumas-web/.env.example](neumas-web/.env.example#L26), [neumas-web/instrumentation.ts](neumas-web/instrumentation.ts#L34)
4. Security workflow for npm audit is broken due missing lockfile:
[.github/workflows/security-scan.yml](.github/workflows/security-scan.yml#L21), [.github/workflows/security-scan.yml](.github/workflows/security-scan.yml#L25), [neumas-web/package.json](neumas-web/package.json#L1)

## Quick wins
1. Rotate and enforce non-default ADMIN_SECRET_KEY; move away from query-param secret auth.
2. Reorder FastAPI routes so static paths are registered before dynamic UUID path params.
3. Fix env key naming mismatch (SUPABASE_SERVICE_KEY vs SUPABASE_SERVICE_ROLE_KEY).
4. Repair security workflow to use pnpm lock/audit path.
5. Remove or isolate dead admin modules and deprecated frontend residue.

---

# 2. File Tree & Structure Analysis

## Full tree (source-focused; generated/vendor folders excluded)
Excluded for readability: .git, node_modules, .next, dist, build, coverage, .venv, __pycache__, .ruff_cache.

~~~text
.
.env.example
.github/
.github/SECRETS.md
.github/workflows/
.github/workflows/ci.yml
.github/workflows/deploy-web.yml
.github/workflows/deploy-worker.yml
.github/workflows/security-scan.yml
.gitignore
ARCHITECTURE.md
DEPLOYMENT.md
DEPLOYMENT_RUNBOOK.md
Procfile
SENTRY_SETUP.md
docker-compose.yml
docs/
docs/adr/
docs/adr/001-canonical-schema-strategy.md
docs/adr/002-auth-session-model.md
docs/adr/003-inventory-ledger-model.md
docs/adr/004-ai-routing-and-cost-accounting.md
docs/adr/005-retrieval-architecture.md
docs/api/
docs/api/admin-api-contract.md
docs/api/mobile-api-contract.md
docs/api/product-surface.md
docs/runbooks/
docs/runbooks/auth-recovery.md
docs/runbooks/report-generation.md
docs/runbooks/retry-and-idempotency.md
docs/runbooks/scan-failure-recovery.md
neumas-backend/
neumas-backend/.env.example
neumas-backend/Dockerfile
neumas-backend/README.md
neumas-backend/app/
neumas-backend/app/api/
neumas-backend/app/api/admin/
neumas-backend/app/api/admin/audit.py
neumas-backend/app/api/admin/health.py
neumas-backend/app/api/admin/organizations.py
neumas-backend/app/api/admin/overview.py
neumas-backend/app/api/admin/properties.py
neumas-backend/app/api/admin/usage.py
neumas-backend/app/api/admin/users.py
neumas-backend/app/api/deps.py
neumas-backend/app/api/routes/
neumas-backend/app/api/routes/admin.py
neumas-backend/app/api/routes/alerts.py
neumas-backend/app/api/routes/analytics.py
neumas-backend/app/api/routes/auth.py
neumas-backend/app/api/routes/documents.py
neumas-backend/app/api/routes/insights.py
neumas-backend/app/api/routes/inventory.py
neumas-backend/app/api/routes/predictions.py
neumas-backend/app/api/routes/reports.py
neumas-backend/app/api/routes/scans.py
neumas-backend/app/api/routes/shopping.py
neumas-backend/app/api/routes/vendor_analytics.py
neumas-backend/app/api/routes/vendors.py
neumas-backend/app/core/
neumas-backend/app/core/celery_app.py
neumas-backend/app/core/config.py
neumas-backend/app/core/constants.py
neumas-backend/app/core/idempotency.py
neumas-backend/app/core/logging.py
neumas-backend/app/core/security.py
neumas-backend/app/core/tracing.py
neumas-backend/app/db/
neumas-backend/app/db/models.py
neumas-backend/app/db/repositories/
neumas-backend/app/db/repositories/admin.py
neumas-backend/app/db/repositories/alerts.py
neumas-backend/app/db/repositories/audit_logs.py
neumas-backend/app/db/repositories/canonical_items.py
neumas-backend/app/db/repositories/document_line_items.py
neumas-backend/app/db/repositories/documents.py
neumas-backend/app/db/repositories/email_logs.py
neumas-backend/app/db/repositories/inventory.py
neumas-backend/app/db/repositories/inventory_movements.py
neumas-backend/app/db/repositories/organizations.py
neumas-backend/app/db/repositories/patterns.py
neumas-backend/app/db/repositories/predictions.py
neumas-backend/app/db/repositories/properties.py
neumas-backend/app/db/repositories/reports.py
neumas-backend/app/db/repositories/scans.py
neumas-backend/app/db/repositories/shopping_lists.py
neumas-backend/app/db/repositories/usage_metering.py
neumas-backend/app/db/repositories/users.py
neumas-backend/app/db/repositories/vendors.py
neumas-backend/app/db/supabase_client.py
neumas-backend/app/db/supabase_client_old.py
neumas-backend/app/main.py
neumas-backend/app/schemas/
neumas-backend/app/services/
neumas-backend/app/tasks/
neumas-backend/app/templates/emails/weekly_digest.html
neumas-backend/app/utils/
neumas-backend/migrations/
neumas-backend/scripts/
neumas-backend/supabase/
neumas-backend/supabase/migrations/
neumas-backend/tests/
neumas-backend/tests/manual/
neumas-health-agent/
neumas-health-agent/.env.example
neumas-health-agent/main.py
neumas-health-agent/README.md
neumas-health-agent/requirements.txt
neumas-web/
neumas-web/.env.example
neumas-web/AGENTS.md
neumas-web/CLAUDE.md
neumas-web/Dockerfile
neumas-web/README.md
neumas-web/components.json
neumas-web/eslint.config.mjs
neumas-web/instrumentation.ts
neumas-web/next.config.ts
neumas-web/package.json
neumas-web/postcss.config.mjs
neumas-web/proxy.ts
neumas-web/public/
neumas-web/src/
neumas-web/src/app/
neumas-web/src/app/(auth)/
neumas-web/src/app/api/
neumas-web/src/app/auth/
neumas-web/src/app/dashboard/
neumas-web/src/app/insights/
neumas-web/src/components/
neumas-web/src/lib/
neumas-web/src/pages/api/pilot-intake.ts
neumas-web/src/utils/supabase/
neumas-web/tailwind.config.ts
neumas-web/tsconfig.json
neumas-web/vercel.json
neumas-web-vite/
neumas-web-vite/.env.example
neumas-web-vite/.env.local
neumas-web-vite/DEPRECATED.md
neumas-web-vite/README.md
neumas-web-vite/src/
nixpacks.toml
package.json
railway.toml
start.sh
vercel.json
~~~

## Depth analysis (deeper than 4 levels)
Depth hotspots detected:
- Depth 6 App Router API nesting is intentional and acceptable:
[neumas-web/src/app/api/internal/startup](neumas-web/src/app/api/internal/startup),
[neumas-web/src/app/api/inventory/batch](neumas-web/src/app/api/inventory/batch),
[neumas-web/src/app/api/inventory/items](neumas-web/src/app/api/inventory/items),
[neumas-web/src/app/api/scan/recent](neumas-web/src/app/api/scan/recent)
- Depth 6 dashboard dynamic routes are acceptable:
[neumas-web/src/app/dashboard/scans/[id]](neumas-web/src/app/dashboard/scans/[id]),
[neumas-web/src/app/dashboard/shopping/[id]](neumas-web/src/app/dashboard/shopping/[id])

Not acceptable chaos:
- Duplicate admin API trees create ambiguity and dead code:
[neumas-backend/app/api/routes/admin.py](neumas-backend/app/api/routes/admin.py#L1) vs [neumas-backend/app/api/admin](neumas-backend/app/api/admin)
- Mixed active/deprecated frontend apps in same monorepo with tracked local env:
[neumas-web-vite/DEPRECATED.md](neumas-web-vite/DEPRECATED.md#L1), [neumas-web-vite/.env.local](neumas-web-vite/.env.local#L1)

## Organization quality
- Good:
1. Backend largely follows routes -> services -> repositories layering.
2. Explicit migration files and ADR docs are present.
- Bad:
1. Dead module clusters: [neumas-backend/app/api/admin](neumas-backend/app/api/admin) + [neumas-backend/app/db/repositories/admin.py](neumas-backend/app/db/repositories/admin.py#L1)
2. Duplicate/legacy clients and stubs remain in hot path:
[neumas-backend/app/db/supabase_client_old.py](neumas-backend/app/db/supabase_client_old.py#L1), [neumas-web-vite](neumas-web-vite)
3. Config naming drift across apps:
[neumas-web/src/lib/config.ts](neumas-web/src/lib/config.ts#L33) vs [neumas-web/.env.example](neumas-web/.env.example#L26)

---

# 3. Routing & API Layer (Critical Section)

## Routing frameworks
- Backend: FastAPI with APIRouter include_router mounting:
[neumas-backend/app/main.py](neumas-backend/app/main.py#L530)
- Frontend: Next.js App Router route handlers + one legacy Pages API:
[neumas-web/src/app](neumas-web/src/app), [neumas-web/src/pages/api/pilot-intake.ts](neumas-web/src/pages/api/pilot-intake.ts#L1)
- Proxy/middleware surface: Next proxy matcher:
[neumas-web/proxy.ts](neumas-web/proxy.ts#L1)

## Backend endpoint inventory (mounted)

| Method | Full Path | Auth/Middleware | Handler |
|---|---|---|---|
| GET | /health | none | [neumas-backend/app/main.py](neumas-backend/app/main.py#L334) |
| GET | /ready | none | [neumas-backend/app/main.py](neumas-backend/app/main.py#L417) |
| GET | /openapi.json | admin token in prod | [neumas-backend/app/main.py](neumas-backend/app/main.py#L301) |
| GET | /docs | dev only | [neumas-backend/app/main.py](neumas-backend/app/main.py#L313) |
| GET | /redoc | dev only | [neumas-backend/app/main.py](neumas-backend/app/main.py#L327) |
| POST | /api/auth/signup | none | [neumas-backend/app/api/routes/auth.py](neumas-backend/app/api/routes/auth.py#L33) |
| POST | /api/auth/login | none | [neumas-backend/app/api/routes/auth.py](neumas-backend/app/api/routes/auth.py#L65) |
| POST | /api/auth/refresh | none | [neumas-backend/app/api/routes/auth.py](neumas-backend/app/api/routes/auth.py#L92) |
| GET | /api/auth/me | get_current_user | [neumas-backend/app/api/routes/auth.py](neumas-backend/app/api/routes/auth.py#L119) |
| GET | /api/auth/preferences/digest | get_current_user | [neumas-backend/app/api/routes/auth.py](neumas-backend/app/api/routes/auth.py#L147) |
| PATCH | /api/auth/preferences/digest | get_current_user | [neumas-backend/app/api/routes/auth.py](neumas-backend/app/api/routes/auth.py#L189) |
| POST | /api/auth/google/complete | token required | [neumas-backend/app/api/routes/auth.py](neumas-backend/app/api/routes/auth.py#L251) |
| POST | /api/auth/logout | get_current_user | [neumas-backend/app/api/routes/auth.py](neumas-backend/app/api/routes/auth.py#L328) |
| POST | /api/scan/upload | require_property | [neumas-backend/app/api/routes/scans.py](neumas-backend/app/api/routes/scans.py#L41) |
| GET | /api/scan/{scan_id}/status | get_tenant_context | [neumas-backend/app/api/routes/scans.py](neumas-backend/app/api/routes/scans.py#L111) |
| GET | /api/scan/{scan_id} | get_tenant_context | [neumas-backend/app/api/routes/scans.py](neumas-backend/app/api/routes/scans.py#L145) |
| POST | /api/scan/{scan_id}/rerun | get_tenant_context | [neumas-backend/app/api/routes/scans.py](neumas-backend/app/api/routes/scans.py#L171) |
| GET | /api/scan/ | require_property | [neumas-backend/app/api/routes/scans.py](neumas-backend/app/api/routes/scans.py#L195) |
| GET | /api/inventory/ | require_property | [neumas-backend/app/api/routes/inventory.py](neumas-backend/app/api/routes/inventory.py#L36) |
| GET | /api/inventory/{item_id} | get_tenant_context | [neumas-backend/app/api/routes/inventory.py](neumas-backend/app/api/routes/inventory.py#L75) |
| POST | /api/inventory/ | require_property | [neumas-backend/app/api/routes/inventory.py](neumas-backend/app/api/routes/inventory.py#L104) |
| PATCH | /api/inventory/{item_id} | get_tenant_context | [neumas-backend/app/api/routes/inventory.py](neumas-backend/app/api/routes/inventory.py#L131) |
| DELETE | /api/inventory/{item_id} | get_tenant_context | [neumas-backend/app/api/routes/inventory.py](neumas-backend/app/api/routes/inventory.py#L166) |
| POST | /api/inventory/update | get_tenant_context | [neumas-backend/app/api/routes/inventory.py](neumas-backend/app/api/routes/inventory.py#L194) |
| POST | /api/inventory/{item_id}/quantity/adjust | get_tenant_context | [neumas-backend/app/api/routes/inventory.py](neumas-backend/app/api/routes/inventory.py#L225) |
| GET | /api/inventory/reorder-recommendations | bad dependency declaration | [neumas-backend/app/api/routes/inventory.py](neumas-backend/app/api/routes/inventory.py#L284) |
| POST | /api/inventory/burn-rate/recompute | require_property | [neumas-backend/app/api/routes/inventory.py](neumas-backend/app/api/routes/inventory.py#L302) |
| GET | /api/inventory/restock/preview | require_property | [neumas-backend/app/api/routes/inventory.py](neumas-backend/app/api/routes/inventory.py#L321) |
| GET | /api/inventory/restock/vendors/{vendor_id}/export | require_property | [neumas-backend/app/api/routes/inventory.py](neumas-backend/app/api/routes/inventory.py#L338) |
| PATCH | /api/inventory/{item_id}/auto-reorder | get_tenant_context | [neumas-backend/app/api/routes/inventory.py](neumas-backend/app/api/routes/inventory.py#L357) |
| POST | /api/predictions/forecast | get_tenant_context | [neumas-backend/app/api/routes/predictions.py](neumas-backend/app/api/routes/predictions.py#L35) |
| GET | /api/predictions/ | require_property | [neumas-backend/app/api/routes/predictions.py](neumas-backend/app/api/routes/predictions.py#L86) |
| GET | /api/shopping-list and /api/shopping-list/ | get_tenant_context | [neumas-backend/app/api/routes/shopping.py](neumas-backend/app/api/routes/shopping.py#L93) |
| POST | /api/shopping-list/generate | require_property | [neumas-backend/app/api/routes/shopping.py](neumas-backend/app/api/routes/shopping.py#L122) |
| GET | /api/shopping-list/{list_id} | get_tenant_context | [neumas-backend/app/api/routes/shopping.py](neumas-backend/app/api/routes/shopping.py#L154) |
| PATCH | /api/shopping-list/{list_id}/approve | get_tenant_context | [neumas-backend/app/api/routes/shopping.py](neumas-backend/app/api/routes/shopping.py#L187) |
| PATCH | /api/shopping-list/{list_id}/items/{item_id}/purchase | get_tenant_context | [neumas-backend/app/api/routes/shopping.py](neumas-backend/app/api/routes/shopping.py#L217) |
| GET | /api/analytics/summary | require_property | [neumas-backend/app/api/routes/analytics.py](neumas-backend/app/api/routes/analytics.py#L86) |
| GET | /api/insights/executive-briefing | get_tenant_context | [neumas-backend/app/api/routes/insights.py](neumas-backend/app/api/routes/insights.py#L24) |
| GET | /api/insights/posts | public | [neumas-backend/app/api/routes/insights.py](neumas-backend/app/api/routes/insights.py#L31) |
| GET | /api/insights/posts/{slug} | public | [neumas-backend/app/api/routes/insights.py](neumas-backend/app/api/routes/insights.py#L57) |
| POST | /api/insights/generate | query secret | [neumas-backend/app/api/routes/insights.py](neumas-backend/app/api/routes/insights.py#L89) |
| GET | /api/admin/org | admin role check in-handler | [neumas-backend/app/api/routes/admin.py](neumas-backend/app/api/routes/admin.py#L52) |
| GET | /api/admin/users | admin role check in-handler | [neumas-backend/app/api/routes/admin.py](neumas-backend/app/api/routes/admin.py#L68) |
| GET | /api/admin/properties | admin role check in-handler | [neumas-backend/app/api/routes/admin.py](neumas-backend/app/api/routes/admin.py#L82) |
| GET | /api/admin/audit-log | admin role check in-handler | [neumas-backend/app/api/routes/admin.py](neumas-backend/app/api/routes/admin.py#L101) |
| GET | /api/admin/feature-flags | admin role check in-handler | [neumas-backend/app/api/routes/admin.py](neumas-backend/app/api/routes/admin.py#L132) |
| PATCH | /api/admin/feature-flags/{flag_name} | admin role check in-handler | [neumas-backend/app/api/routes/admin.py](neumas-backend/app/api/routes/admin.py#L145) |
| GET | /api/admin/system-health | admin role check in-handler | [neumas-backend/app/api/routes/admin.py](neumas-backend/app/api/routes/admin.py#L180) |
| GET | /api/admin/usage | admin role check in-handler | [neumas-backend/app/api/routes/admin.py](neumas-backend/app/api/routes/admin.py#L200) |
| GET | /api/admin/stats | admin role check in-handler | [neumas-backend/app/api/routes/admin.py](neumas-backend/app/api/routes/admin.py#L237) |
| GET | /api/admin/properties/stock-health | admin role check in-handler | [neumas-backend/app/api/routes/admin.py](neumas-backend/app/api/routes/admin.py#L301) |
| POST | /api/admin/reports/send-digest | admin role check in-handler | [neumas-backend/app/api/routes/admin.py](neumas-backend/app/api/routes/admin.py#L407) |
| GET | /api/admin/reports/email-logs | admin role check in-handler | [neumas-backend/app/api/routes/admin.py](neumas-backend/app/api/routes/admin.py#L439) |
| GET | /api/documents/ | get_tenant_context | [neumas-backend/app/api/routes/documents.py](neumas-backend/app/api/routes/documents.py#L27) |
| GET | /api/documents/review-queue | get_tenant_context | [neumas-backend/app/api/routes/documents.py](neumas-backend/app/api/routes/documents.py#L52) |
| GET | /api/documents/{document_id} | get_tenant_context | [neumas-backend/app/api/routes/documents.py](neumas-backend/app/api/routes/documents.py#L63) |
| POST | /api/documents/{document_id}/approve | get_tenant_context | [neumas-backend/app/api/routes/documents.py](neumas-backend/app/api/routes/documents.py#L78) |
| PATCH | /api/documents/{document_id}/line-items/{line_item_id} | get_tenant_context | [neumas-backend/app/api/routes/documents.py](neumas-backend/app/api/routes/documents.py#L101) |
| GET | /api/vendors/ | get_tenant_context | [neumas-backend/app/api/routes/vendors.py](neumas-backend/app/api/routes/vendors.py#L45) |
| POST | /api/vendors/ | get_tenant_context | [neumas-backend/app/api/routes/vendors.py](neumas-backend/app/api/routes/vendors.py#L56) |
| GET | /api/vendors/{vendor_id} | get_tenant_context | [neumas-backend/app/api/routes/vendors.py](neumas-backend/app/api/routes/vendors.py#L70) |
| POST | /api/vendors/merge | get_tenant_context | [neumas-backend/app/api/routes/vendors.py](neumas-backend/app/api/routes/vendors.py#L81) |
| POST | /api/vendors/normalise | get_tenant_context | [neumas-backend/app/api/routes/vendors.py](neumas-backend/app/api/routes/vendors.py#L92) |
| GET | /api/vendors/catalog/items | get_tenant_context | [neumas-backend/app/api/routes/vendors.py](neumas-backend/app/api/routes/vendors.py#L106) |
| POST | /api/vendors/catalog/items/{item_id}/aliases | get_tenant_context | [neumas-backend/app/api/routes/vendors.py](neumas-backend/app/api/routes/vendors.py#L122) |
| GET | /api/vendor-analytics/spend | get_tenant_context | [neumas-backend/app/api/routes/vendor_analytics.py](neumas-backend/app/api/routes/vendor_analytics.py#L16) |
| GET | /api/vendor-analytics/trends | get_tenant_context | [neumas-backend/app/api/routes/vendor_analytics.py](neumas-backend/app/api/routes/vendor_analytics.py#L24) |
| GET | /api/vendor-analytics/price-intel | get_tenant_context | [neumas-backend/app/api/routes/vendor_analytics.py](neumas-backend/app/api/routes/vendor_analytics.py#L32) |
| GET | /api/vendor-analytics/compare | get_tenant_context | [neumas-backend/app/api/routes/vendor_analytics.py](neumas-backend/app/api/routes/vendor_analytics.py#L41) |
| GET | /api/vendor-analytics/alerts | get_tenant_context | [neumas-backend/app/api/routes/vendor_analytics.py](neumas-backend/app/api/routes/vendor_analytics.py#L49) |
| GET | /api/alerts/ | get_tenant_context | [neumas-backend/app/api/routes/alerts.py](neumas-backend/app/api/routes/alerts.py#L25) |
| GET | /api/alerts/{alert_id} | get_tenant_context | [neumas-backend/app/api/routes/alerts.py](neumas-backend/app/api/routes/alerts.py#L54) |
| POST | /api/alerts/{alert_id}/snooze | get_tenant_context | [neumas-backend/app/api/routes/alerts.py](neumas-backend/app/api/routes/alerts.py#L65) |
| POST | /api/alerts/{alert_id}/resolve | get_tenant_context | [neumas-backend/app/api/routes/alerts.py](neumas-backend/app/api/routes/alerts.py#L80) |
| POST | /api/reports/ | get_tenant_context | [neumas-backend/app/api/routes/reports.py](neumas-backend/app/api/routes/reports.py#L26) |
| GET | /api/reports/ | get_tenant_context | [neumas-backend/app/api/routes/reports.py](neumas-backend/app/api/routes/reports.py#L39) |
| GET | /api/reports/{report_id} | get_tenant_context | [neumas-backend/app/api/routes/reports.py](neumas-backend/app/api/routes/reports.py#L54) |

## Next.js routes inventory

### App Router API handlers
| Method | Path | Handler |
|---|---|---|
| GET | /api/health | [neumas-web/src/app/api/health/route.ts](neumas-web/src/app/api/health/route.ts#L1) |
| POST | /api/internal/startup | [neumas-web/src/app/api/internal/startup/route.ts](neumas-web/src/app/api/internal/startup/route.ts#L1) |
| GET | /api/inventory/items | [neumas-web/src/app/api/inventory/items/route.ts](neumas-web/src/app/api/inventory/items/route.ts#L1) |
| PATCH | /api/inventory/batch | [neumas-web/src/app/api/inventory/batch/route.ts](neumas-web/src/app/api/inventory/batch/route.ts#L1) |
| POST | /api/scan | [neumas-web/src/app/api/scan/route.ts](neumas-web/src/app/api/scan/route.ts#L1) |
| GET | /api/scan/recent | [neumas-web/src/app/api/scan/recent/route.ts](neumas-web/src/app/api/scan/recent/route.ts#L1) |

### App Router route handlers (non-api)
| Method | Path | Handler |
|---|---|---|
| GET | /auth/callback | [neumas-web/src/app/auth/callback/route.ts](neumas-web/src/app/auth/callback/route.ts#L1) |

### Legacy Pages Router
| Method | Path | Handler |
|---|---|---|
| POST | /api/pilot-intake | [neumas-web/src/pages/api/pilot-intake.ts](neumas-web/src/pages/api/pilot-intake.ts#L1) |

### Rewrites and proxy
- Rewrites /api/:path to backend unless local route exists:
[neumas-web/next.config.ts](neumas-web/next.config.ts#L45)
- Proxy matcher applied broadly:
[neumas-web/proxy.ts](neumas-web/proxy.ts#L9)

## Routing errors and problems

### Critical
1. Inventory static paths likely shadowed by dynamic UUID route declaration order.
- Dynamic registered early: [neumas-backend/app/api/routes/inventory.py](neumas-backend/app/api/routes/inventory.py#L76)
- Static one-segment paths registered later: [neumas-backend/app/api/routes/inventory.py](neumas-backend/app/api/routes/inventory.py#L195), [neumas-backend/app/api/routes/inventory.py](neumas-backend/app/api/routes/inventory.py#L285)

Snippet:
~~~python
@router.get("/{item_id}")
...
@router.post("/update")
...
@router.get("/reorder-recommendations")
~~~

2. Incorrect dependency declaration in reorder route.
- [neumas-backend/app/api/routes/inventory.py](neumas-backend/app/api/routes/inventory.py#L290)

Snippet:
~~~python
tenant: Annotated[TenantContext, Depends(require_property)]
~~~
This wraps a dependency factory incorrectly and is inconsistent with other routes using require_property().

3. Hidden admin generation endpoint relies on query secret with insecure default.
- [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L112)
- [neumas-backend/app/api/routes/insights.py](neumas-backend/app/api/routes/insights.py#L90)

Snippet:
~~~python
ADMIN_SECRET_KEY default="change-me"
...
if not admin_key or admin_key != expected: raise HTTPException(403)
~~~

### High
4. API contract drift: docs list endpoints not implemented or wrong paths.
- Contracts: [docs/api/product-surface.md](docs/api/product-surface.md#L1), [docs/api/admin-api-contract.md](docs/api/admin-api-contract.md#L1), [docs/api/mobile-api-contract.md](docs/api/mobile-api-contract.md#L1)
- Actual mounted routes from [neumas-backend/app/main.py](neumas-backend/app/main.py#L530)

5. Duplicate admin router surface exists but is unmounted and references missing dependency.
- Unmounted modules: [neumas-backend/app/api/admin](neumas-backend/app/api/admin)
- Missing symbol import target: [neumas-backend/app/api/admin/overview.py](neumas-backend/app/api/admin/overview.py#L3)
- No get_current_admin in security module: [neumas-backend/app/core/security.py](neumas-backend/app/core/security.py#L1)

6. Next has mixed routing paradigms with legacy pages api left behind.
- [neumas-web/src/pages/api/pilot-intake.ts](neumas-web/src/pages/api/pilot-intake.ts#L1)
- [neumas-web/src/app/api](neumas-web/src/app/api)

### Medium
7. Some API handlers bypass shared error wrapper and can leak backend messages.
- Wrapped example: [neumas-web/src/app/api/health/route.ts](neumas-web/src/app/api/health/route.ts#L106)
- Unwrapped proxy handlers: [neumas-web/src/app/api/scan/route.ts](neumas-web/src/app/api/scan/route.ts#L8)

8. Scan upload error leaks exception text to clients.
- [neumas-backend/app/api/routes/scans.py](neumas-backend/app/api/routes/scans.py#L107)

Snippet:
~~~python
detail=f"Failed to process scan upload: {e}"
~~~

---

# 4. Environment Variables & Configuration

## Master env variable inventory (referenced/declared)
From code references, env templates, and backend settings declarations.

| Variable | Category | Sensitivity | Evidence |
|---|---|---|---|
| ENV | required backend | low | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L24) |
| DEBUG | optional | low | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L28) |
| BASE_URL | optional | medium | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L31) |
| DEV_MODE | optional | medium | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L35) |
| CORS_ORIGINS | required prod | medium | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L57) |
| SUPABASE_URL | required | high | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L71) |
| SUPABASE_SERVICE_ROLE_KEY | required | critical | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L74) |
| SUPABASE_ANON_KEY | required for user client | medium | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L77) |
| SUPABASE_JWT_SECRET | required auth integrity | critical | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L80) |
| DATABASE_URL | optional | high | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L85) |
| REDIS_URL | required for workers | high | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L91) |
| REDIS_PRIVATE_URL | optional railway | high | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L95) |
| REDISHOST / REDISPORT / REDISPASSWORD / REDISUSER | optional railway | high | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L105) |
| ADMIN_SECRET_KEY | required internal security | critical | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L111) |
| OPENAI_API_KEY | optional feature | critical | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L117) |
| ANTHROPIC_API_KEY | optional feature | critical | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L118) |
| GOOGLE_API_KEY | optional feature | critical | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L119) |
| SENDGRID_API_KEY | optional feature | critical | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L122) |
| FROM_EMAIL / FROM_NAME | optional | medium | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L123) |
| JWT_ALGORITHM | optional | low | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L127) |
| ACCESS_TOKEN_EXPIRE_MINUTES | optional | low | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L128) |
| CELERY_BROKER_URL / CELERY_RESULT_BACKEND | optional | high | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L133) |
| CELERY_TASK_ALWAYS_EAGER | optional tests | medium | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L139) |
| AGENT_OS_URL / AGENT_OS_API_KEY | optional integration | high | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L153) |
| SENTRY_DSN / SENTRY_TRACES_SAMPLE_RATE | optional observability | high | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L163) |
| STORAGE_BUCKET_RECEIPTS / STORAGE_PUBLIC_RECEIPTS / STORAGE_SIGNED_URL_EXPIRY | optional storage | medium | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L173) |
| NEXT_PUBLIC_API_URL | required web | low | [neumas-web/src/lib/config.ts](neumas-web/src/lib/config.ts#L16) |
| NEXT_PUBLIC_SUPABASE_URL | required web | medium | [neumas-web/src/lib/config.ts](neumas-web/src/lib/config.ts#L17) |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | required web | medium | [neumas-web/src/lib/config.ts](neumas-web/src/lib/config.ts#L18) |
| NEXT_PUBLIC_SENTRY_DSN | optional | low | [neumas-web/src/lib/config.ts](neumas-web/src/lib/config.ts#L19) |
| NEXT_PUBLIC_POSTHOG_KEY / NEXT_PUBLIC_POSTHOG_HOST | optional | low | [neumas-web/src/lib/config.ts](neumas-web/src/lib/config.ts#L20) |
| NEXT_PUBLIC_ENVIRONMENT / ENVIRONMENT | required | low | [neumas-web/src/lib/config.ts](neumas-web/src/lib/config.ts#L24) |
| SUPABASE_SERVICE_KEY | currently required by validation | critical | [neumas-web/src/lib/config.ts](neumas-web/src/lib/config.ts#L33) |
| APP_URL / RAILWAY_PUBLIC_DOMAIN | required runtime URL | medium | [neumas-web/src/lib/config.ts](neumas-web/src/lib/config.ts#L38) |
| NEXT_PUBLIC_APP_VERSION | optional | low | [neumas-web/src/lib/config.ts](neumas-web/src/lib/config.ts#L43) |
| BACKEND_URL / NEXT_PUBLIC_BACKEND_URL / NEXT_PUBLIC_SITE_URL | optional routing | medium | [neumas-web/src/lib/backend-url.ts](neumas-web/src/lib/backend-url.ts#L12) |
| NODE_ENV / NEXT_RUNTIME | runtime | low | [neumas-web/instrumentation.ts](neumas-web/instrumentation.ts#L17) |
| LOG_LEVEL | optional | low | [neumas-web/src/lib/logger.ts](neumas-web/src/lib/logger.ts#L14) |
| VITE_API_BASE_URL | deprecated app | low | [neumas-web-vite/.env.example](neumas-web-vite/.env.example#L1) |
| NEUMAS_BACKEND_URL / HEARTBEAT_INTERVAL_SECONDS / APP_VERSION / BASE_URL | health agent | medium | [neumas-health-agent/main.py](neumas-health-agent/main.py#L24) |

## .env template consistency check
- Root and service examples exist: [.env.example](.env.example#L1), [neumas-web/.env.example](neumas-web/.env.example#L1), [neumas-backend/.env.example](neumas-backend/.env.example#L1)
- Critical mismatch:
1. Web config requires SUPABASE_SERVICE_KEY:
[neumas-web/src/lib/config.ts](neumas-web/src/lib/config.ts#L33)
2. Web env template defines SUPABASE_SERVICE_ROLE_KEY:
[neumas-web/.env.example](neumas-web/.env.example#L26)

Impact: startup can terminate via validateServerConfig:
[neumas-web/instrumentation.ts](neumas-web/instrumentation.ts#L34)

## Hardcoded secrets and unsafe defaults
- Unsafe default admin secret:
[neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L112)
- Hardcoded production backend fallback in multiple web files:
[neumas-web/next.config.ts](neumas-web/next.config.ts#L5), [neumas-web/src/lib/backend-url.ts](neumas-web/src/lib/backend-url.ts#L1), [neumas-web/src/lib/api/client.ts](neumas-web/src/lib/api/client.ts#L27), [neumas-web/src/app/auth/callback/route.ts](neumas-web/src/app/auth/callback/route.ts#L9)
- Placeholder values are in examples, but examples include real-looking Sentry DSN and actual Google client id:
[.env.example](.env.example#L53), [neumas-web/.env.example](neumas-web/.env.example#L33)

## Key config file audit
- Next rewrite/proxy strategy is coherent but error-prone under missing env:
[neumas-web/next.config.ts](neumas-web/next.config.ts#L45)
- TS strict true enabled:
[neumas-web/tsconfig.json](neumas-web/tsconfig.json#L10)
- ESLint ignores .next/build only; fine:
[neumas-web/eslint.config.mjs](neumas-web/eslint.config.mjs#L10)
- Backend pydantic settings centralized but default weak secrets and many optional critical keys:
[neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L1)

---

# 5. What’s Working vs What’s Not Working

## Working
1. Language diagnostics currently clean:
get_errors returned no problems.
2. Backend tests exist and are reasonably broad in domain coverage:
[neumas-backend/tests/test_auth.py](neumas-backend/tests/test_auth.py),
[neumas-backend/tests/test_inventory_ledger.py](neumas-backend/tests/test_inventory_ledger.py),
[neumas-backend/tests/test_scan_pipeline.py](neumas-backend/tests/test_scan_pipeline.py)
3. CI pipeline has split jobs for web/backend and path-based filtering:
[.github/workflows/ci.yml](.github/workflows/ci.yml#L1)

## Not working / fragile
1. Security scan npm job likely broken:
- expects package-lock:
[.github/workflows/security-scan.yml](.github/workflows/security-scan.yml#L21)
- runs npm ci:
[.github/workflows/security-scan.yml](.github/workflows/security-scan.yml#L25)
- but project uses pnpm lock, no package-lock:
[neumas-web/package.json](neumas-web/package.json#L1)
2. Deploy-worker workflow does not actually gate on CI pass:
[.github/workflows/deploy-worker.yml](.github/workflows/deploy-worker.yml#L20)
3. Legacy pilot endpoint is stubbed and logs payload:
[neumas-web/src/pages/api/pilot-intake.ts](neumas-web/src/pages/api/pilot-intake.ts#L9)
4. Contract docs are out of sync with live routes:
[docs/api/product-surface.md](docs/api/product-surface.md#L1), [neumas-backend/app/main.py](neumas-backend/app/main.py#L530)

## Runtime red flags
1. Backend readiness/health intentionally masks Redis failures as healthy in some cases:
[neumas-backend/app/main.py](neumas-backend/app/main.py#L374), [neumas-backend/app/main.py](neumas-backend/app/main.py#L478)
2. Global exception handler may hide bug class detail in prod while losing structured context for some flows:
[neumas-backend/app/main.py](neumas-backend/app/main.py#L621)
3. Frontend auth/session depends on localStorage token only (single key), no secure httpOnly session bridge:
[neumas-web/src/lib/auth-session.ts](neumas-web/src/lib/auth-session.ts#L23)

---

# 6. Code Quality & Existing Issues

## Static quality
- No immediate editor diagnostics from tool scan.
- Strong typing enabled in web.
- Backend strict mypy configured but not necessarily enforced in CI.

## Security issues
1. Insecure default internal secret and weak auth mechanism (query param).
- [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L112)
- [neumas-backend/app/api/routes/insights.py](neumas-backend/app/api/routes/insights.py#L90)

2. Missing effective API rate limiting on routes.
- Decorator exists but unused:
[neumas-backend/app/core/security.py](neumas-backend/app/core/security.py#L223)

3. API key validation is TODO/no-op style.
- [neumas-backend/app/core/security.py](neumas-backend/app/core/security.py#L511)

4. Detailed exception leakage in scan upload.
- [neumas-backend/app/api/routes/scans.py](neumas-backend/app/api/routes/scans.py#L107)

5. Hardcoded prod backend URL fallback can cause accidental prod data flow from dev/misconfigured env.
- [neumas-web/src/lib/backend-url.ts](neumas-web/src/lib/backend-url.ts#L1)

## Performance issues
1. /api/inventory/batch performs sequential per-item network calls.
- [neumas-web/src/app/api/inventory/batch/route.ts](neumas-web/src/app/api/inventory/batch/route.ts#L28)
2. Heavy analytics route performs multiple full-list fetches and post-processing in request path.
- [neumas-backend/app/api/routes/analytics.py](neumas-backend/app/api/routes/analytics.py#L86)

## Code smells
1. Dead admin API modules and placeholder repository.
- [neumas-backend/app/api/admin](neumas-backend/app/api/admin)
- [neumas-backend/app/db/repositories/admin.py](neumas-backend/app/db/repositories/admin.py#L1)
2. Deprecated frontend remains in tree and has tracked .env.local.
- [neumas-web-vite/DEPRECATED.md](neumas-web-vite/DEPRECATED.md#L1)
- [neumas-web-vite/.env.local](neumas-web-vite/.env.local#L1)
3. API docs/contract drift severe.
- [docs/api/product-surface.md](docs/api/product-surface.md#L1)

## Dead code and unused files
- Entire unmounted admin endpoint set:
[neumas-backend/app/api/admin](neumas-backend/app/api/admin)
- Legacy Supabase client:
[neumas-backend/app/db/supabase_client_old.py](neumas-backend/app/db/supabase_client_old.py#L1)

## Dependency vulnerabilities
- Cannot determine current vulnerability status statically from source only.
- Security workflow exists but partially misconfigured as above.

---

# 7. Missing / Incomplete / Inconsistent Parts

1. Pilot intake path incomplete:
- frontend notes TODO: [neumas-web/src/components/PilotIntake.tsx](neumas-web/src/components/PilotIntake.tsx#L39)
- API route TODO and console logging only: [neumas-web/src/pages/api/pilot-intake.ts](neumas-web/src/pages/api/pilot-intake.ts#L9)

2. Dead/incomplete admin repo methods:
[neumas-backend/app/db/repositories/admin.py](neumas-backend/app/db/repositories/admin.py#L3)

3. Inconsistent admin surface:
- active mounted admin router: [neumas-backend/app/api/routes/admin.py](neumas-backend/app/api/routes/admin.py#L1)
- separate unmounted admin modules: [neumas-backend/app/api/admin](neumas-backend/app/api/admin)

4. Frontend-backend contract mismatch examples:
- Product surface says /api/shopping but implementation uses /api/shopping-list:
[docs/api/product-surface.md](docs/api/product-surface.md#L89), [neumas-backend/app/main.py](neumas-backend/app/main.py#L565)
- Product surface lists /api/inventory/bulk and /movements not present as documented:
[docs/api/product-surface.md](docs/api/product-surface.md#L37)
- Admin contract lists many endpoints not matching actual mounted set:
[docs/api/admin-api-contract.md](docs/api/admin-api-contract.md#L1)

5. Missing frontend tests.
- none found under [neumas-web](neumas-web)

---

# 8. Other Critical Angles

## Authentication & Authorization
- Centralized dependency injection is strong:
[neumas-backend/app/api/deps.py](neumas-backend/app/api/deps.py#L1)
- But auth fallback paths can obscure root causes and reduce strictness:
[neumas-backend/app/api/deps.py](neumas-backend/app/api/deps.py#L157), [neumas-backend/app/api/deps.py](neumas-backend/app/api/deps.py#L276)
- Query-secret endpoint should be replaced with proper JWT role gate:
[neumas-backend/app/api/routes/insights.py](neumas-backend/app/api/routes/insights.py#L89)

## Database / ORM / migration layer
- SQL migrations and Supabase schema assets are substantial and versioned.
- Repository pattern mostly consistent.
- Dead duplicate repository module exists:
[neumas-backend/app/db/repositories/admin.py](neumas-backend/app/db/repositories/admin.py#L1)

## Error handling & logging
- Backend has global exception handler and request logging middleware.
- Frontend has wrapper-based API error handling but not uniformly used:
[neumas-web/src/lib/api-handler.ts](neumas-web/src/lib/api-handler.ts#L1)

## State management (frontend)
- Zustand auth store plus token helper orchestrator present:
[neumas-web/src/lib/store/auth.ts](neumas-web/src/lib/store/auth.ts), [neumas-web/src/lib/auth-session.ts](neumas-web/src/lib/auth-session.ts#L1)
- Token only in localStorage increases XSS blast radius.

## Caching / rate limiting / background jobs
- Celery queues and schedules are mature:
[neumas-backend/app/core/celery_app.py](neumas-backend/app/core/celery_app.py#L62)
- Route-level rate limiting effectively absent.
- Idempotency middleware exists and is positive:
[neumas-backend/app/core/idempotency.py](neumas-backend/app/core/idempotency.py#L1)

## Testing strategy
- Backend has integration-style tests and manual suites.
- Frontend has no test suite in repo.
- CI runs backend tests + web type/build, not frontend unit/e2e.

## Documentation quality
- Lots of docs present (ADR/runbooks/contracts).
- Major contract drift makes docs unreliable without code verification.

## Accessibility / i18n / SEO
- App has sitemap/manifest files:
[neumas-web/src/app/sitemap.ts](neumas-web/src/app/sitemap.ts), [neumas-web/src/app/manifest.ts](neumas-web/src/app/manifest.ts)
- No clear i18n strategy found.
- Accessibility posture cannot be guaranteed statically without UI audit tooling.

## Scalability & deployment readiness
- Docker and Railway/Vercel workflows exist and are generally production-oriented.
- One deploy workflow not truly gated by CI and security scanning has broken npm setup.

---

# 9. Prioritized Action Items

| Priority | Issue | File(s) | Suggested fix |
|---|---|---|---|
| Critical | Replace insecure admin query-secret endpoint and rotate secret | [neumas-backend/app/core/config.py](neumas-backend/app/core/config.py#L111), [neumas-backend/app/api/routes/insights.py](neumas-backend/app/api/routes/insights.py#L89) | Remove query param auth. Require Bearer token + admin role dependency. Enforce non-default secret at startup for any internal keys. |
| Critical | Fix route-order bugs in inventory | [neumas-backend/app/api/routes/inventory.py](neumas-backend/app/api/routes/inventory.py#L75) | Register static one-segment routes before /{item_id}. Add tests for /update and /reorder-recommendations. |
| Critical | Fix incorrect dependency declaration | [neumas-backend/app/api/routes/inventory.py](neumas-backend/app/api/routes/inventory.py#L290) | Change to require_property() usage consistent with other handlers. |
| Critical | Resolve env key mismatch causing startup failure | [neumas-web/src/lib/config.ts](neumas-web/src/lib/config.ts#L33), [neumas-web/.env.example](neumas-web/.env.example#L26) | Support both SUPABASE_SERVICE_ROLE_KEY and SUPABASE_SERVICE_KEY or standardize one key across all code/docs. |
| High | Repair security workflow npm audit job | [.github/workflows/security-scan.yml](.github/workflows/security-scan.yml#L21), [neumas-web/package.json](neumas-web/package.json#L1) | Switch to pnpm audit flow or add lock strategy that matches package manager. |
| High | Remove or quarantine dead admin API modules | [neumas-backend/app/api/admin](neumas-backend/app/api/admin), [neumas-backend/app/db/repositories/admin.py](neumas-backend/app/db/repositories/admin.py#L1) | Delete if obsolete or mount intentionally with full implementations and tests. |
| High | Stop leaking exception text from scan endpoint | [neumas-backend/app/api/routes/scans.py](neumas-backend/app/api/routes/scans.py#L107) | Return generic error detail and log internal exception server-side only. |
| High | Add effective rate limiting for high-risk endpoints | [neumas-backend/app/core/security.py](neumas-backend/app/core/security.py#L223), [neumas-backend/app/main.py](neumas-backend/app/main.py#L1) | Apply limiter middleware/decorators to auth, upload, and mutation-heavy routes. |
| Medium | Align API contracts with actual mounted routes | [docs/api/product-surface.md](docs/api/product-surface.md#L1), [docs/api/admin-api-contract.md](docs/api/admin-api-contract.md#L1), [neumas-backend/app/main.py](neumas-backend/app/main.py#L530) | Regenerate contract docs from code/OpenAPI; add CI doc drift check. |
| Medium | Normalize frontend API handler resilience wrappers | [neumas-web/src/app/api](neumas-web/src/app/api) | Wrap all route handlers with shared logger/error wrapper or remove wrapper abstraction. |
| Medium | Remove tracked local env in deprecated app | [neumas-web-vite/.env.local](neumas-web-vite/.env.local#L1) | Untrack and add explicit ignore/cleanup. |
| Nice-to-have | Add frontend tests (unit + e2e smoke) | [neumas-web](neumas-web) | Introduce vitest/playwright and gate deploy on critical user journeys. |
| Nice-to-have | Optimize batch inventory endpoint concurrency/control | [neumas-web/src/app/api/inventory/batch/route.ts](neumas-web/src/app/api/inventory/batch/route.ts#L28) | Add controlled parallelism and partial-failure response schema. |

---

# Next Steps for Me

Run these exact commands from repo root to verify/deepen this audit:

~~~bash
# 1) Confirm route behavior and route-order issues
cd /Users/varunsrivastava/projects/neumas/neumas-backend
uv run pytest -q tests/test_inventory.py tests/test_auth.py tests/test_reliability.py

# 2) Generate live OpenAPI and compare against docs contracts
uv run python -c "from app.main import app; import json; print(json.dumps(app.openapi(), indent=2))" > /tmp/neumas-openapi.json

# 3) Validate web startup env mismatch quickly
cd /Users/varunsrivastava/projects/neumas/neumas-web
pnpm run build

# 4) Exercise security workflow logic locally (expected to expose npm/pnpm mismatch)
cd /Users/varunsrivastava/projects/neumas/neumas-web
npm ci --legacy-peer-deps
npm audit --audit-level=high

# 5) Check backend lint/type/test rigor beyond editor diagnostics
cd /Users/varunsrivastava/projects/neumas/neumas-backend
ruff check .
uv run pytest -v --tb=short --ignore=tests/manual

# 6) Enumerate mounted backend routes at runtime with methods
uv run python - <<'PY'
from app.main import app
for r in app.routes:
    methods = ",".join(sorted(getattr(r, "methods", []) or []))
    path = getattr(r, "path", "")
    if methods and path:
        print(f"{methods:20} {path}")
PY

# 7) Verify git hygiene for generated/local artifacts
cd /Users/varunsrivastava/projects/neumas
git ls-files | rg '(^neumas-web-vite/.env.local$|\.next/|node_modules/|__pycache__|\.pyc$)' || true
~~~
