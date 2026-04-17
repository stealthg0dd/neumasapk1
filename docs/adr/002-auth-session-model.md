# ADR 002 — Auth and Session Model

**Date:** 2026-04-17
**Status:** Accepted
**Deciders:** Engineering

---

## Context

Neumas uses Supabase Auth for identity management. The backend issues its own JWTs with custom claims (`org_id`, `property_ids`, `role`). The frontend previously managed tokens inconsistently across multiple modules (`store/auth.ts`, `lib/supabase.ts`, `lib/api/client.ts`), creating risk of session drift.

The `/api/auth/refresh` endpoint was a 501 stub, meaning frontend sessions would expire without recovery.

## Decision

### Backend

1. **`POST /api/auth/refresh`** is fully implemented. It exchanges a Supabase refresh token for a new access token and returns `{ access_token, refresh_token, expires_in }`.

2. **JWT custom claims** (`org_id`, `property_ids`, `role`, `user_id`) are preserved through the refresh cycle. The backend sets these claims from the database row on each login and refresh, not solely from the incoming token.

3. **`app/services/auth_service.py`** owns the refresh lifecycle and all JWT claim hydration.

### Frontend

4. **`src/lib/auth-session.ts`** is the single auth orchestrator. It is the only module that reads/writes tokens, manages refresh lifecycle, and reconciles Supabase client session with backend JWT.

5. **Refresh-on-401:** On receiving a 401, the API client calls the orchestrator to attempt a refresh before redirecting to login. Only if the refresh itself fails does the client clear state and redirect.

6. **Logout:** Only triggered after refresh failure, or explicit user action. Not triggered on first 401.

7. **Rehydration:** On app load, the orchestrator checks token expiry, refreshes if needed, and reconciles Supabase Auth session.

## Consequences

- Sessions survive page refreshes and short inactivity periods.
- No parallel redirect loops from concurrent 401s.
- A single file owns token state — no drift.
- Supabase Auth and backend JWT stay in sync.

## Alternatives Considered

- **BFF refresh route (Next.js `app/api/auth/refresh/route.ts`):** Considered but rejected as unnecessary indirection. The backend already handles auth and the additional hop adds latency and complexity.
- **Rely solely on Supabase client SDK for session management:** Rejected because the backend uses its own JWT with custom claims; the two sessions must be reconciled.
