# Neumas — Architecture Reference

> Last updated: 2026-04-03  
> Scope: full monorepo at `github.com/stealthg0dd/neumasapk1`

---

## 1. System Overview

Neumas is a **multi-tenant SaaS platform** for hospitality inventory management. It combines receipt scanning (vision AI), historical consumption analysis, demand forecasting, and LLM-driven shopping-list generation into a single integrated workflow.

```
┌───────────────────────────────────────────────────────────┐
│  CLIENTS                                                  │
│  neumas-web  (Next.js 16 / React 19 — primary)            │
│  neumas-web-vite  (Vite / React 18 — legacy fallback)     │
└───────────────────┬───────────────────────────────────────┘
                    │  HTTPS / REST
┌───────────────────▼───────────────────────────────────────┐
│  API GATEWAY: neumas-backend  (FastAPI, Python 3.12+)     │
│  CORS · JWT auth · Request logging (structlog)            │
│  Railway deployment — railway.toml                        │
└───┬──────────────────────────┬────────────────────────────┘
    │ Celery tasks             │ Direct DB calls
┌───▼──────────────┐  ┌───────▼───────────────────────────┐
│  Redis (broker)  │  │  Supabase  (PostgreSQL + RLS)      │
│  redis://...     │  │  SupaStorage (receipt images)      │
└───┬──────────────┘  └───────────────────────────────────┘
    │
┌───▼──────────────────────────────────────────────────────┐
│  CELERY WORKERS                                          │
│  Queue: scans · agents · neumas.predictions              │
│  Tasks: scan_tasks · agent_tasks · shopping_tasks        │
│  Railway deployment — railway-worker.toml                │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Repository Structure

```
neumasapk1/
├── ARCHITECTURE.md          ← this file
├── .env.example             ← repo-root env template (all services)
├── .gitignore               ← root ignore rules
│
├── neumas-backend/          ← FastAPI Python backend + Celery worker
│   ├── app/
│   │   ├── main.py          ← FastAPI app factory + lifespan
│   │   ├── api/
│   │   │   ├── deps.py      ← JWT validation, TenantContext injection
│   │   │   └── routes/      ← auth, inventory, scans, shopping, etc.
│   │   ├── core/
│   │   │   ├── config.py    ← Pydantic settings (env vars)
│   │   │   ├── celery_app.py← Celery instance + queue/route config
│   │   │   ├── security.py  ← JWT encode/decode
│   │   │   └── logging.py   ← structlog JSON request logging
│   │   ├── db/
│   │   │   ├── models.py    ← SQLAlchemy ORM models
│   │   │   ├── supabase_client.py ← admin + user-scoped Supabase clients
│   │   │   └── repositories/← per-entity data access (multi-tenant)
│   │   ├── services/        ← business logic + AI agents
│   │   ├── tasks/           ← Celery tasks (scan, agent, shopping)
│   │   └── schemas/         ← Pydantic request/response schemas
│   ├── supabase/schema.sql  ← canonical PostgreSQL schema + RLS policies
│   ├── pyproject.toml       ← deps, pytest, ruff config
│   ├── Dockerfile           ← multi-stage (development / production / worker)
│   ├── docker-compose.yml   ← local dev: app + redis + worker + beat
│   ├── railway.toml         ← Railway API service config
│   └── railway-worker.toml  ← Railway Celery worker config
│
├── neumas-web/              ← Next.js 16 frontend (primary)
│   ├── src/
│   │   ├── app/             ← App Router pages + API route handlers
│   │   │   ├── api/health/  ← GET /api/health
│   │   │   ├── api/internal/startup/ ← POST /api/internal/startup
│   │   │   ├── (auth)/      ← login, signup pages
│   │   │   └── dashboard/   ← protected dashboard pages
│   │   ├── components/      ← UI, layout, dashboard, 3D, animations
│   │   └── lib/
│   │       ├── config.ts    ← env var validation (server + client)
│   │       ├── logger.ts    ← pino JSON logger (server-only)
│   │       ├── api-handler.ts ← withLogger HOF for API routes
│   │       └── api/         ← Axios client + typed endpoint functions
│   ├── instrumentation.ts   ← Next.js startup hook: env check + registration
│   ├── next.config.ts       ← proxy rewrites /api/* → Railway backend
│   └── railway.toml         ← Railway web service config
│
└── neumas-web-vite/         ← Vite React 18 (legacy / alternative)
    ├── src/
    │   ├── App.tsx          ← React Router setup
    │   ├── context/AuthContext.tsx ← token + org_id + property_id state
    │   ├── api/             ← Axios client + per-entity endpoint functions
    │   └── pages/           ← Dashboard, Login, ScanUpload
    └── vite.config.ts
```

---

## 3. Service Inventory

| Service | Runtime | Entry Point | Deployment |
|---------|---------|-------------|------------|
| **neumas-backend** (API) | Python 3.12 / Uvicorn | `app/main.py` | Railway (Dockerfile) |
| **neumas-backend** (Worker) | Python 3.12 / Celery | `celery -A app.core.celery_app worker` | Railway (railway-worker.toml) |
| **neumas-web** | Node.js / Next.js 16 | `next start` / `next dev` | Railway / Vercel |
| **neumas-web-vite** | Node.js / Vite | `vite` / `vite build` | Static hosting |
| **Redis** | Redis 7+ | — | Railway / local docker-compose |
| **Supabase** | Managed PostgreSQL | — | Supabase cloud |

---

## 4. API Routes

### 4.1 FastAPI Backend (`/api/*`)

| Method | Path | Handler | Auth |
|--------|------|---------|------|
| POST | `/api/auth/signup` | `routes/auth.py` | None |
| POST | `/api/auth/login` | `routes/auth.py` | None |
| GET | `/api/auth/me` | `routes/auth.py` | JWT |
| POST | `/api/auth/logout` | `routes/auth.py` | JWT |
| POST | `/api/auth/refresh` | `routes/auth.py` | ⚠️ 501 NOT IMPLEMENTED |
| GET | `/api/inventory/` | `routes/inventory.py` | JWT + tenant |
| GET | `/api/inventory/{id}` | `routes/inventory.py` | JWT + tenant |
| POST | `/api/inventory/` | `routes/inventory.py` | JWT + tenant |
| PATCH | `/api/inventory/{id}` | `routes/inventory.py` | JWT + tenant |
| DELETE | `/api/inventory/{id}` | `routes/inventory.py` | JWT + tenant |
| POST | `/api/inventory/{id}/adjust-quantity` | `routes/inventory.py` | JWT + tenant |
| POST | `/api/inventory/bulk` | `routes/inventory.py` | JWT + tenant |
| POST | `/api/scan/upload` | `routes/scans.py` | JWT + tenant |
| GET | `/api/scan/{id}/status` | `routes/scans.py` | JWT + tenant |
| GET | `/api/scan/{id}` | `routes/scans.py` | JWT + tenant |
| GET | `/api/scan/` | `routes/scans.py` | JWT + tenant |
| POST | `/api/predictions/forecast` | `routes/predictions.py` | JWT + tenant |
| GET | `/api/predictions/` | `routes/predictions.py` | JWT + tenant |
| GET | `/api/shopping/` | `routes/shopping.py` | JWT + tenant |
| POST | `/api/shopping/generate` | `routes/shopping.py` | JWT + tenant |
| GET | `/api/shopping/{id}` | `routes/shopping.py` | JWT + tenant |
| GET | `/api/analytics/summary` | `routes/analytics.py` | JWT + tenant |
| GET | `/health` | `main.py` | None |

### 4.2 Next.js Internal API Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Service health + Supabase ping |
| POST | `/api/internal/startup` | Register with agent OS router-system |

> **Routing note**: `next.config.ts` rewrites `/api/:path*` to the Railway backend using
> `afterFiles` semantics. Next.js API route handlers (filesystem) take precedence, so
> `/api/health` and `/api/internal/startup` are served by Next.js directly.

---

## 5. Data Flow

### 5.1 Receipt Scan Pipeline

```
Browser → POST /api/scan/upload
  → ScanService.upload_scan()
    → upload image to Supabase Storage (receipts bucket)
    → create scan record (status=pending)
    → enqueue scans.process_scan task (Celery)
  ← return scan_id

Celery Worker (queue: scans):
  → scans.process_scan(scan_id, property_id, user_id, image_url, scan_type)
    1. mark scan status=processing
    2. VisionAgent (Claude 3.5 Sonnet) → extract items from receipt image
    3. save raw_results + processed_results to scans table
    4. upsert extracted items → inventory_items (merge by name/barcode)
    5. PatternAgent → recompute consumption_patterns for affected items
    6. PredictAgent → recompute stockout predictions for property
    7. mark scan status=completed (or failed)

Browser → GET /api/scan/{scan_id}/status  (polling)
  ← { status, items_detected, confidence_score }
```

### 5.2 Shopping List Generation

```
Browser → POST /api/shopping/generate
  → ShoppingService.generate()
    → enqueue agents.generate_shopping_list task
  ← 202 Accepted { task_id }

Celery Worker (queue: agents):
  → agents.generate_shopping_list(property_id, user_id, ...)
    1. PredictAgent → refresh predictions
    2. ShoppingAgent (Claude) → group items by urgency + store
    3. BudgetAgent (OpenAI GPT-4) → suggest cost alternatives
    4. upsert shopping_lists + shopping_list_items
```

### 5.3 Authentication Flow

```
Browser → POST /api/auth/signup
  → Supabase Auth creates auth.users record
  → Backend creates: users + organizations + properties rows
  → JWT returned with custom claims: org_id, property_ids, role

Subsequent requests:
  → Bearer token in Authorization header
  → deps.py validates JWT signature (SUPABASE_JWT_SECRET)
  → TenantContext(user_id, org_id, property_id, role) injected
  → Supabase RLS enforces tenant isolation at DB level
```

---

## 6. Database Schema Summary

All tables live in Supabase (PostgreSQL). RLS is enabled on all tables.
JWT custom claims (`org_id`, `property_ids`, `role`) power the RLS policies.

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `organizations` | id, name, slug, subscription_tier | Tenant root |
| `properties` | id, organization_id, name, timezone | Location within org |
| `users` | id, auth_id, organization_id, role | Mirrors auth.users |
| `inventory_items` | id, property_id, category_id, name, quantity, min/max/reorder_point | Core stock tracking |
| `inventory_categories` | id, organization_id, parent_id, name | Nested categories |
| `scans` | id, property_id, status, image_urls, processed_results | Receipt upload records |
| `consumption_patterns` | id, item_id, pattern_type, pattern_data, confidence | AI-computed usage patterns |
| `predictions` | id, property_id, item_id, prediction_type, predicted_value, urgency | Stockout forecasts |
| `shopping_lists` | id, property_id, status, budget_limit, total_estimated_cost | Generated lists |
| `shopping_list_items` | id, shopping_list_id, name, quantity, priority, is_purchased | Individual list items |

RLS helper functions: `auth.is_org_admin()`, `auth.org_id()`, `auth.can_access_property(p_id)`

---

## 7. AI / ML Agents

| Agent | Model | Type | Purpose |
|-------|-------|------|---------|
| **VisionAgent** | Claude 3.5 Sonnet (Anthropic) | LLM | Receipt image → structured item list |
| **PatternAgent** | Deterministic | Rule-based | Scan history → consumption rate & frequency |
| **PredictAgent** | Deterministic | Rule-based | Patterns + current qty → stockout dates |
| **ShoppingAgent** | Claude 3.5 Sonnet (Anthropic) | LLM | Predictions → prioritised, store-grouped list |
| **BudgetAgent** | GPT-4 Turbo (OpenAI) | LLM | Shopping list → cost optimisation, alternatives |
| **OrchestrationService** | — | Fallback logic | Primary LLM → secondary LLM → DEV_MODE stub |

`DEV_MODE=true` replaces all LLM calls with deterministic stubs (`services/dev_stubs.py`).

---

## 8. Celery Task Queues

| Queue | Tasks | Notes |
|-------|-------|-------|
| `scans` | `scans.process_scan` | Receipt processing pipeline |
| `agents` | `agents.generate_shopping_list`, `agents.optimize_budget` | LLM tasks |
| `neumas.predictions` | `agents.recompute_patterns_for_property`, `agents.recompute_predictions_for_property` | Analytics recompute |
| `neumas_default` | General tasks | Fallback queue |

Broker + result backend: Redis.  
Concurrency: 4 workers, prefetch multiplier 1.

---

## 9. External Dependencies

| Service | Used By | Purpose | Required in |
|---------|---------|---------|-------------|
| **Supabase** | backend + web | PostgreSQL DB, Auth, Storage | All envs |
| **Redis** | backend | Celery broker + result backend | All envs |
| **Anthropic (Claude)** | backend | VisionAgent, ShoppingAgent | Prod (stub in DEV_MODE) |
| **OpenAI (GPT-4)** | backend | BudgetAgent | Prod (stub in DEV_MODE) |
| **Sentry** | web (planned) | Error tracking | Prod |
| **Agent OS** | web | Router-system registration | Prod |
| **Railway** | — | Hosting (API + worker + web) | CI/prod |

---

## 10. Environment Variables

See `.env.example` at the repository root for the full list.

Key groupings:
- **`NEXT_PUBLIC_*`** — client-safe Next.js vars (bundled into browser)
- **`SUPABASE_*`** — database connection
- **`AGENT_OS_*`** — router-system registration
- **`SENTRY_*`** — error tracking
- **`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`** — LLM access (backend only)
- **`REDIS_URL`** — Celery broker
- **`JWT_SECRET_KEY`** — token signing

---

## 11. Startup Sequence (neumas-web)

```
next start
  → instrumentation.ts / register()
      1. validateServerConfig() — exits(1) if required vars missing
      2. POST AGENT_OS_URL/api/register { repo_id: "neumas-web" }
  → Next.js App Router ready
      GET /api/health — returns { status, version, environment, supabase_connected }
      POST /api/internal/startup — re-triggers agent OS registration on demand
```

---

## 12. Known Issues & TODOs

| Area | Issue | File |
|------|-------|------|
| Auth | `POST /api/auth/refresh` returns 501 | `routes/auth.py` |
| Auth | No session management or refresh token rotation | `services/auth_service.py` |
| Auth | No MFA support | `services/auth_service.py` |
| Security | API key validation not implemented (`TODO` in code) | `core/security.py` |
| Vite frontend | Legacy alternative; production readiness unclear | `neumas-web-vite/` |
| Admin routes | Endpoint stubs — no implementations | `routes/admin.py` |
| Predictions | Actual value backfill (`actual_value` column) never written | `db/repositories/predictions.py` |
