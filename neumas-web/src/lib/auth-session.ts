/**
 * Neumas Auth Session Orchestrator
 *
 * This is the SINGLE module responsible for:
 * - Storing and reading access/refresh tokens
 * - Token refresh lifecycle (retry on 401 before logout)
 * - Reconciling Supabase client session with backend JWT
 * - Logout (only after refresh failure or explicit user action)
 *
 * No other module should directly read/write tokens from localStorage.
 * Use the exported helpers below instead.
 */

import type { ProfileResponse } from "@/lib/api/types";
import { useAuthStore } from "@/lib/store/auth";

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCESS_TOKEN_KEY = "neumas_access_token";
// Number of seconds before expiry to proactively refresh
const REFRESH_BUFFER_SECONDS = 60;

// ── Token storage ─────────────────────────────────────────────────────────────

/** Read the current access token from localStorage. Null if not logged in or SSR. */
export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

/** Persist access token. Called by saveAuth — do not call directly. */
export function setAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

/** Remove all tokens and clear Zustand store. */
export function clearTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  useAuthStore.getState().clearAuth();
}

// ── Save after login/signup ────────────────────────────────────────────────────

/** Called after a successful login or signup response. */
export function saveSession(data: {
  access_token: string;
  refresh_token?: string | null;
  expires_in: number;
  profile: ProfileResponse;
}): void {
  setAccessToken(data.access_token);
  useAuthStore.getState().saveAuth(data);
}

// ── Token expiry check ────────────────────────────────────────────────────────

/** Returns true if the stored access token is expired (or about to expire). */
export function isTokenExpired(): boolean {
  const expiresAt = useAuthStore.getState().expiresAt;
  if (expiresAt == null) return true;
  return Date.now() / 1000 >= expiresAt - REFRESH_BUFFER_SECONDS;
}

// ── Refresh lifecycle ─────────────────────────────────────────────────────────

let _refreshPromise: Promise<boolean> | null = null;

/**
 * Attempt to refresh the session using the stored refresh token.
 * Returns true if successful, false if the refresh failed (requires logout).
 *
 * Concurrent callers during an in-flight refresh share the same promise
 * to avoid duplicate refresh requests.
 */
export async function attemptRefresh(): Promise<boolean> {
  // Deduplicate concurrent refresh attempts
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = _doRefresh().finally(() => {
    _refreshPromise = null;
  });

  return _refreshPromise;
}

async function _doRefresh(): Promise<boolean> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) return false;

  try {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) return false;

    const data = await response.json() as {
      access_token: string;
      refresh_token?: string | null;
      expires_in: number;
    };

    // Update token in localStorage and store
    setAccessToken(data.access_token);
    const profile = useAuthStore.getState().profile;
    if (profile) {
      useAuthStore.getState().saveAuth({
        access_token: data.access_token,
        refresh_token: data.refresh_token ?? refreshToken,
        expires_in: data.expires_in,
        profile,
      });
    }

    return true;
  } catch {
    return false;
  }
}

// ── Rehydration reconciliation ────────────────────────────────────────────────

/**
 * Called on app startup (client side) to reconcile stored auth state.
 * - If token is expired and refresh token exists, attempt silent refresh.
 * - If refresh fails, clear state (user will see login screen).
 * - If no token at all, clear state cleanly.
 */
export async function rehydrateSession(): Promise<void> {
  const store = useAuthStore.getState();

  // Not logged in — nothing to reconcile
  if (!store.token) return;

  if (isTokenExpired()) {
    const refreshed = await attemptRefresh();
    if (!refreshed) {
      clearTokens();
    }
  }
}

// ── Explicit logout ────────────────────────────────────────────────────────────

/**
 * Log the user out. Calls the backend logout endpoint (best effort),
 * then clears all local state.
 */
export async function logout(): Promise<void> {
  const token = getAccessToken();
  if (token) {
    // Best-effort backend logout (don't block on failure)
    fetch("/api/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  clearTokens();
}
