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
import type { ProfileResponse } from "@/lib/api/types";

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
    (set, get) => ({
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
        state?.setHasHydrated(true);

        if (!state?.token) return;

        // Clear everything if the token is already expired — prevents
        // stale tokens from reaching the API and causing 401 cascades.
        if (
          state.expiresAt != null &&
          state.expiresAt <= Math.floor(Date.now() / 1000)
        ) {
          state.clearAuth();
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
          if (claims) {
            // setProfile re-derives orgId + propertyId from the profile object;
            // if profile is present we use it. Otherwise fall back to JWT claims
            // by calling setProfile with a patched profile.
            if (state.profile) {
              state.setProfile({
                ...state.profile,
                property_id: state.profile.property_id || claims.property_id || "",
                org_id:      state.profile.org_id      || claims.org_id      || "",
              });
            }
          }
        }
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
