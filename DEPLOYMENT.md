# Neumas — Deployment Reference

> Last updated: 2026-04-03

---

## 1. Deployment Topology

```
┌────────────────────────────────────────────────┐
│  Vercel (recommended for neumas-web)            │
│  • Global CDN + edge network                    │
│  • Zero-config Next.js 16 support               │
│  • Automatic preview deploys on PR              │
│  • neumas-web/vercel.json                        │
└────────────────────┬───────────────────────────┘
                     │ /api/* proxy → Railway API
┌────────────────────▼───────────────────────────┐
│  Railway — neumas-backend  (API service)        │
│  Dockerfile (production stage)                  │
│  neumas-backend/railway.toml                    │
│  Health: GET /health                            │
└────────────────────┬───────────────────────────┘
                     │ Celery tasks via Redis
┌────────────────────▼───────────────────────────┐
│  Railway — neumas-backend  (Worker service)     │
│  Same Dockerfile (worker build target)          │
│  neumas-backend/railway-worker.toml             │
└────────────────────┬───────────────────────────┘
                     │
┌────────────────────▼───────────────────────────┐
│  Railway — Redis 7                              │
│  Shared broker + result backend for Celery      │
└────────────────────────────────────────────────┘
```

**Alternative**: neumas-web can also be deployed to Railway using its
Dockerfile (`neumas-web/railway.toml` already configured). Use Railway when
you need a single-provider setup or when Vercel is not suitable.

---

## 2. Service Configuration Files

| Service | Platform | Config File |
|---------|----------|-------------|
| neumas-web | Vercel | [neumas-web/vercel.json](neumas-web/vercel.json) |
| neumas-web | Railway (alt) | [neumas-web/railway.toml](neumas-web/railway.toml) |
| neumas-backend API | Railway | [neumas-backend/railway.toml](neumas-backend/railway.toml) |
| neumas-backend Worker | Railway | [neumas-backend/railway-worker.toml](neumas-backend/railway-worker.toml) |

---

## 3. Environment Variables

Set these in the Vercel / Railway dashboard for each service.
All variable names are documented in [.env.example](.env.example).

### neumas-web (Vercel / Railway)

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service-role key (server-only) |
| `NEXT_PUBLIC_SENTRY_DSN` | Prod | Client-side error tracking |
| `SENTRY_DSN` | Prod | Server-side error tracking |
| `AGENT_OS_URL` | Yes | Agent OS base URL for registration |
| `AGENT_OS_API_KEY` | Yes | Auth key for agent OS |
| `ENVIRONMENT` | Yes | `development` / `staging` / `production` |
| `NEXT_PUBLIC_API_URL` | Optional | Override backend URL (empty = use proxy) |

### neumas-backend API + Worker (Railway)

See [neumas-backend/.env.example](neumas-backend/.env.example) for the full list.
Key vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`,
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `JWT_SECRET_KEY`.

---

## 4. Dockerfiles

### neumas-web — Multi-stage (Node 20 Alpine)

```
Stage 1: deps     — npm ci --omit=dev  (prod deps only)
Stage 2: builder  — npm ci + next build  (standalone output)
Stage 3: runner   — copy .next/standalone, non-root user, EXPOSE 3000
                    CMD: node server.js
                    HEALTHCHECK: wget /api/health every 30s
```

[View Dockerfile](neumas-web/Dockerfile)

### neumas-backend — Multi-stage (Python 3.12 slim)

```
Stage: base        — system deps, pip config
Stage: development — editable install, hot reload with uvicorn --reload
Stage: builder     — venv install for prod
Stage: production  — slim runtime, gunicorn
Stage: worker      — celery worker entrypoint
```

[View Dockerfile](neumas-backend/Dockerfile)

---

## 5. Local Development (docker-compose)

The root [docker-compose.yml](docker-compose.yml) starts the entire stack.

```bash
# 1. Copy env templates
cp neumas-web/.env.example     neumas-web/.env.local
cp neumas-backend/.env.example neumas-backend/.env

# 2. Fill in real values in each .env file

# 3. Start all services
docker compose up --build

# Services:
#   http://localhost:3000  — Next.js web (hot reload)
#   http://localhost:8000  — FastAPI backend
#   localhost:6379         — Redis
```

Hot reload is enabled for the web app (source files are bind-mounted).
The Next.js dev server runs inside the `builder` stage so all source is
present; only `src/`, `public/`, and config files are bind-mounted.

---

## 6. Deploying to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# From neumas-web/
cd neumas-web
vercel --prod

# Set env vars via Vercel dashboard or:
vercel env add SUPABASE_SERVICE_KEY production
```

The `vercel.json` sets the build and install commands and targets the `iad1`
(US East) region. Next.js 16 is auto-detected.

---

## 7. Deploying to Railway

```bash
# Install Railway CLI
npm i -g @railway/cli

# Deploy API service from neumas-backend/
cd neumas-backend
railway up

# Deploy worker (separate Railway service pointing to same repo)
# In Railway dashboard: set Start Command to the celery command
# and set build target to "worker" in railway-worker.toml
```

Railway reads the `railway.toml` or `railway-worker.toml` in the service
root. The backend Dockerfile `production` target is used for the API service;
the `worker` target is used for the Celery worker.

---

## 8. Health Checks

| Service | Endpoint | Tool |
|---------|----------|------|
| neumas-web | `GET /api/health` | `wget` (Dockerfile HEALTHCHECK) |
| neumas-backend API | `GET /health` | `curl` (railway.toml) |
| Redis | — | `redis-cli ping` (docker-compose) |

The `/api/health` response:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "environment": "production",
  "supabase_connected": true
}
```

---

## 9. Database Schema and Migrations

### Canonical Schema

The canonical schema is `neumas-backend/supabase/schema.sql`.

**Never use `setup_schema.sql` for new deployments** — it is legacy and non-authoritative.

### Applying the Schema (first-time setup)

1. Go to Supabase dashboard → SQL Editor
2. Copy the contents of `neumas-backend/supabase/schema.sql`
3. Paste and run

### Migration Procedure

All schema changes after the baseline use forward-only migration files in `neumas-backend/supabase/migrations/`.

**To apply a migration:**

1. Open Supabase SQL Editor
2. Open the migration file from `neumas-backend/supabase/migrations/` (e.g. `20260417_operational_model.sql`)
3. Paste and run
4. Record the migration as applied (manual tracking for now)

**To add a new migration:**

1. Create `neumas-backend/supabase/migrations/YYYYMMDD_description.sql` (date-prefixed filename)
2. Write forward-only DDL (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`)
3. Update `neumas-backend/supabase/schema.sql` to include the new DDL
4. Document the migration in this file (section 10 below)

**Rules:**
- Never edit a migration that has been applied to any environment
- Always use `IF NOT EXISTS` / `IF NOT EXISTS` to make migrations idempotent
- Never use `DROP` in a migration unless there is a separate cleanup sprint
- Add the migration to `supabase/schema.sql` so it is part of the canonical schema

### Migration History

| Migration | Description | Date Applied |
|-----------|-------------|--------------|
| `schema.sql` (baseline) | Full canonical schema — all 23 tables, RLS, indexes, triggers, storage | Apply fresh DBs with schema.sql directly |
| `supabase/migrations/20260409_research_posts.sql` | Add research_posts table (agent-generated insights) | 2026-04-09 |
| `supabase/migrations/20260417_operational_model.sql` | Add 13 new operational tables; fix org_id on scans/inventory_items; add actual_value to predictions | 2026-04-17 |
