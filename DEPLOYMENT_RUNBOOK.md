# Neumas Production Deployment Runbook

## 1. Vercel (Frontend)
- **Root Directory:** Set to `neumas-web` in Vercel project settings UI (not in vercel.json)
- **Build Command:** `npm run build`
- **Install Command:** `npm ci --legacy-peer-deps`
- **Framework Preset:** Next.js
- **Regions:** iad1 (default)
- **Environment Variables:**
  - `NEXT_PUBLIC_API_URL` — Backend API base URL (should point to Railway backend)
  - `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
  - `SENTRY_DSN` — Sentry DSN (optional, for error reporting)
  - `SENTRY_AUTH_TOKEN` — Sentry auth token (for source maps, optional)
  - Any other public envs required by frontend
- **Backend URL Wiring:**
  - All `/api/*` requests are proxied to backend via Next.js rewrites (see next.config.ts)
- **Supabase Callback URLs:**
  - Add all deployed frontend URLs to Supabase Auth redirect/callback settings
- **Google OAuth Redirect URLs:**
  - Add all deployed frontend URLs to Google OAuth credentials
- **Stripe Webhook URLs:**
  - Add backend `/api/stripe/webhook` endpoint to Stripe dashboard
- **Resend Sender Domain:**
  - Ensure sender domain is verified in Resend dashboard
- **Twilio Webhook Notes:**
  - If using Twilio, add backend webhook endpoints to Twilio console

## 2. Railway (Backend)
- **Deployment:**
  - Deploys via GitHub Actions on push to `main`
  - Environment variables set in Railway dashboard
- **Required Environment Variables:**
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
  - `DATABASE_URL` (Postgres)
  - `REDIS_URL` (if using Celery/Redis)
  - `SENTRY_DSN` (optional)
  - `AGENT_OS_URL`, `AGENT_OS_API_KEY` (optional, for agent registration)
  - Any other backend secrets
- **Health Route:** `/health` (returns JSON status)
- **Startup Registration:** Backend attempts to register with agent OS if configured

## 3. Production Boot Sequence
1. Railway backend deploys and starts up
2. Backend registers with agent OS (if configured)
3. Vercel frontend deploys and builds from `neumas-web`
4. Frontend `/api/*` proxies to backend
5. Health checks: `/api/health` (frontend), `/health` (backend)

## 4. Release Validation Checklist
- [ ] Vercel root directory set to `neumas-web` in UI
- [ ] All required env vars set in Vercel and Railway
- [ ] Supabase, Google, Stripe, Resend, Twilio URLs updated
- [ ] No references to deprecated `neumas-web-vite` in build or config
- [ ] Both health routes return 200 OK
- [ ] Backend deploys successfully via GitHub Actions
- [ ] Frontend deploys successfully on Vercel

## 5. Common Pitfalls
- Setting `rootDirectory` in vercel.json (must be set in UI)
- Missing or misconfigured env vars
- Backend URL not matching deployed Railway instance
- Callback URLs not updated in Supabase/Google/Stripe
- Server-only envs leaking to browser (use only NEXT_PUBLIC_ for browser)
- Outdated references to `neumas-web-vite`
