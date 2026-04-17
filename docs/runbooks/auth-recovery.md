# Runbook: Auth Recovery

**Applies to:** All environments
**Last updated:** 2026-04-17

---

## Symptom: Users Cannot Log In

### Check 1 — Supabase Auth is healthy
1. Go to Supabase dashboard → Auth tab
2. Check recent error logs for failed sign-in attempts
3. Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set correctly in Railway

### Check 2 — JWT secret is consistent
The backend validates JWTs using `SUPABASE_JWT_SECRET`. If this value was rotated in Supabase but not updated in Railway, all tokens will be rejected.
1. Compare the JWT secret in Railway env vars with the one in Supabase Auth settings
2. Update Railway env var if different; restart the API service

### Check 3 — User record exists
A user can sign in via Supabase Auth but have no matching row in the `users` table. This causes a `User not found` error.
```sql
SELECT * FROM users WHERE auth_id = '<auth_id_from_supabase>';
```
If missing, the signup flow did not complete. Check backend logs for the signup error.

---

## Symptom: Token Refresh Fails

### Check 1 — Refresh token is not expired
Supabase refresh tokens expire after the configured session duration (default: 7 days). If expired, the user must log in again.

### Check 2 — Refresh endpoint returning 5xx
Check Railway backend logs:
```
railway logs --service neumas-backend
```
Look for `refresh_token` errors.

---

## Symptom: Users Appear Logged Out Unexpectedly

### Check 1 — Token expiry
Access tokens expire (default: 1 hour). If the frontend is not refreshing tokens, the session will appear expired.
1. Check browser console for `401 Session expired` errors
2. Verify `src/lib/auth-session.ts` is refreshing on 401

### Check 2 — Multiple browser tabs
Zustand auth store is not shared across server-side renders. If `localStorage` was cleared in one tab, other tabs will still appear logged in until they attempt a request.

---

## Symptom: Google OAuth Users Missing Org/Property

Google OAuth creates a Supabase Auth user but does NOT automatically create the `users`/`organizations`/`properties` rows. The frontend must call `POST /api/auth/google/complete` after the OAuth callback.

1. Check if the user has a Supabase Auth record but no `users` row
2. Have the user complete the onboarding flow again
3. `google/complete` is idempotent — safe to call multiple times

---

## Emergency: Revoke All Sessions for a Compromised Account

```sql
-- In Supabase SQL editor (admin access required)
-- 1. Deactivate user account
UPDATE users SET is_active = false WHERE auth_id = '<auth_id>';

-- 2. Force logout via Supabase Auth admin API
-- Use: POST /auth/v1/admin/users/{user_id}/logout  (Supabase Admin API)
```
