"use client";
/**
 * Zustand auth store — persists to localStorage.
 *
 * Hydration note: because this uses localStorage, it can only be read
 * in client components. Use the `useAuthStore` hook inside `"use client"` files.
 *
 * The `_hasHydrated` flag lets layout components show a loading skeleton
 * until the store rehydrates from localStorage on mount.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { jwtDecode } from "jwt-decode";
import { consumePendingAuthSessionCookie } from "@/lib/auth-bootstrap";
import type { ProfileResponse } from "@/lib/api/types";
import type { Session } from "@supabase/supabase-js";

// ── JWT claim shape (Neumas custom claims embedded by the backend) ─────────────

interface JWTPayload {
  sub: string;
  email?: string;
  user_id?: string;
  org_id?: string;
  property_id?: string;
  role?: string;
  exp?: number;
  iat?: number;
}

function toNullableString(value: string | null | undefined): string | null {
  return value ? String(value) : null;
}

/** Safely decode a JWT and return the payload, or null on any error. */
function decodeToken(token: string): JWTPayload | null {
  try {
    return jwtDecode<JWTPayload>(token);
  } catch {
    return null;
  }
}

function getSessionExpirySeconds(session: Session): number {
  if (typeof session.expires_in === "number" && session.expires_in > 0) {
    return session.expires_in;
  }

  if (typeof session.expires_at === "number" && session.expires_at > 0) {
    return Math.max(1, session.expires_at - Math.floor(Date.now() / 1000));
  }

  return 3600;
}

async function fetchProfileFromSupabaseSession(
  accessToken: string
): Promise<ProfileResponse | null> {
  const response = await fetch("/api/auth/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as ProfileResponse;
}

async function bootstrapFromSupabaseSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const { createClient } = await import("@/utils/supabase/client");
  const supabase = createClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    return null;
  }

  const profile = await fetchProfileFromSupabaseSession(session.access_token);
  if (!profile) {
    return null;
  }

  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token ?? null,
    expires_in: getSessionExpirySeconds(session),
    profile,
  };
}

// ── State shape ───────────────────────────────────────────────────────────────

interface AuthState {
  /** JWT access token */
  token: string | null;
  /** Supabase/Neumas refresh token (for future refresh endpoint) */
  refreshToken: string | null;
  /** Token expiry Unix timestamp (seconds) */
  expiresAt: number | null;
  /** Full user profile returned by login/signup/me */
  profile: ProfileResponse | null;
  /** Convenience derived values */
  orgId: string | null;
  propertyId: string | null;
  /** True once the persisted state has been rehydrated from localStorage */
  _hasHydrated: boolean;
}

interface AuthActions {
  /** Called after a successful login or signup */
  saveAuth: (data: {
    access_token: string;
    refresh_token?: string | null;
    expires_in: number;
    profile: ProfileResponse;
  }) => void;
  /** Clear auth state and localStorage token */
  clearAuth: () => void;
  /** Update profile in place (e.g. after /me refresh) */
  setProfile: (profile: ProfileResponse) => void;
  setHasHydrated: (v: boolean) => void;
}

type AuthStore = AuthState & AuthActions;

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      // ── initial state ────────────────────────────────────────────────────
      token: null,
      refreshToken: null,
      expiresAt: null,
      profile: null,
      orgId: null,
      propertyId: null,
      _hasHydrated: false,

      // ── actions ──────────────────────────────────────────────────────────
      saveAuth({ access_token, refresh_token, expires_in, profile }) {
        const expiresAt = Math.floor(Date.now() / 1000) + expires_in;

        // Decode JWT to get authoritative claims — the token is the source of
        // truth for property_id / org_id. Profile fields are used as fallback
        // in case the backend omits custom claims from the token.
        const claims = decodeToken(access_token);
        const propertyId = toNullableString(claims?.property_id ?? profile.property_id);
        const orgId = toNullableString(claims?.org_id ?? profile.org_id);

        // Keep localStorage in sync so the Axios interceptor can read it
        if (typeof window !== "undefined") {
          localStorage.setItem("neumas_access_token", access_token);
        }

        set({
          token: access_token,
          refreshToken: refresh_token ?? null,
          expiresAt,
          profile,
          orgId,
          propertyId,
        });
      },

      clearAuth() {
        if (typeof window !== "undefined") {
          localStorage.removeItem("neumas_access_token");
        }
        set({
          token: null,
          refreshToken: null,
          expiresAt: null,
          profile: null,
          orgId: null,
          propertyId: null,
        });
      },

      setProfile(profile) {
        set({
          profile,
          orgId: toNullableString(profile.org_id),
          propertyId: toNullableString(profile.property_id),
        });
      },

      setHasHydrated(v) {
        set({ _hasHydrated: v });
      },
    }),
    {
      name: "neumas-auth",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? localStorage : (undefined as never)
      ),
      // Exclude hydration flag from persistence
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        expiresAt: state.expiresAt,
        profile: state.profile,
        orgId: state.orgId,
        propertyId: state.propertyId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        void (async () => {
          if (!state.token) {
            const pendingSession = consumePendingAuthSessionCookie();
            if (pendingSession) {
              state.saveAuth(pendingSession);
              state.setHasHydrated(true);
              return;
            }

            const supabaseSession = await bootstrapFromSupabaseSession();
            if (supabaseSession) {
              state.saveAuth(supabaseSession);
            }

            state.setHasHydrated(true);
            return;
          }

          // Clear everything if the token is already expired — prevents
          // stale tokens from reaching the API and causing 401 cascades.
          if (state.expiresAt != null && state.expiresAt <= Math.floor(Date.now() / 1000)) {
            state.clearAuth();
            state.setHasHydrated(true);
            return;
          }

          // Sync token to localStorage for the Axios interceptor
          if (typeof window !== "undefined") {
            localStorage.setItem("neumas_access_token", state.token);
          }

          // If propertyId/orgId are missing from the persisted snapshot (e.g.
          // user logged in before this fix was deployed), decode the JWT to
          // recover them without forcing a re-login.
          if (!state.propertyId || !state.orgId) {
            const claims = decodeToken(state.token);
            if (claims && state.profile) {
              state.setProfile({
                ...state.profile,
                property_id: state.profile.property_id || claims.property_id || "",
                org_id: state.profile.org_id || claims.org_id || "",
              });
            }
          }

          state.setHasHydrated(true);
        })();
      },
    }
  )
);

// ── Derived selectors (stable refs) ───────────────────────────────────────────

// NOTE: intentionally does NOT call Date.now() — doing so would cause this
// selector to return a new value on every millisecond, triggering infinite
// re-renders in every component that uses useAuthStore(selectIsAuthenticated).
// Token expiry is enforced at the Axios layer (401 response clears the token),
// not here in the hot render path.
export const selectIsAuthenticated = (s: AuthStore): boolean => !!s.token;
export const selectHasSession = (s: AuthStore): boolean => !!s.token && !!s.profile;

export const selectIsAdmin = (s: AuthStore): boolean =>
  s.profile?.role === "admin";

/** One-off expiry check — call this on app mount or before a sensitive action,
 *  NOT inside a selector or render function. */
export function isTokenExpired(s: Pick<AuthStore, "expiresAt">): boolean {
  return s.expiresAt != null && s.expiresAt <= Math.floor(Date.now() / 1000);
}
