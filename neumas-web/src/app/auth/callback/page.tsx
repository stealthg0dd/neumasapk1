'use client'

"use client";

/**
 * OAuth callback page — handles the redirect from Google via Supabase.
 *
 * Flow:
 *  1. Supabase redirects here with ?code=<pkce_code> after Google consent.
 *  2. We exchange the code for a Supabase session (PKCE verifier in localStorage).
 *  3. We call GET /api/auth/me to fetch the Neumas profile for this user.
 *     - 200: user already has a Neumas account → save auth → /dashboard
 *     - 403: first-time Google sign-in → user has no DB record yet → /onboard
 *  4. Any hard error → /login?error=<reason>
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store/auth";
import { me } from "@/lib/api/endpoints";

export default function AuthCallbackPage() {
  const router = useRouter();
  const { saveAuth } = useAuthStore();
  const ran = useRef(false); // prevent double-invoke in React StrictMode

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code = new URLSearchParams(window.location.search).get("code");

    if (!code) {
      router.replace("/login?error=no_code");
      return;
    }

    async function handleCallback() {
      try {
        // Exchange the PKCE code for a Supabase session.
        // The PKCE verifier was stored in localStorage by signInWithOAuth.
        const { data, error } = await supabase.auth.exchangeCodeForSession(code!);

        if (error || !data.session) {
          console.error("[OAuth callback] Session exchange failed:", error?.message);
          router.replace(`/login?error=${encodeURIComponent(error?.message ?? "oauth_failed")}`);
          return;
        }

        const { access_token, refresh_token, expires_in } = data.session;

        // Make the token available to the Axios interceptor immediately.
        localStorage.setItem("neumas_access_token", access_token);

        // Fetch Neumas profile from the backend using the Supabase token.
        try {
          const profile = await me();
          saveAuth({
            access_token,
            refresh_token: refresh_token ?? null,
            expires_in: expires_in ?? 3600,
            profile,
          });
          toast.success("Welcome back!");
          router.replace("/dashboard");
        } catch (profileErr: unknown) {
          const status =
            (profileErr as { response?: { status?: number } })?.response?.status;

          if (status === 403) {
            // New Google user — no Neumas DB record yet. Store the session
            // temporarily so the onboard page can use it without re-auth.
            sessionStorage.setItem(
              "oauth_pending_session",
              JSON.stringify({ access_token, refresh_token, expires_in })
            );
            router.replace("/onboard");
          } else {
            console.error("[OAuth callback] Profile fetch failed:", profileErr);
            localStorage.removeItem("neumas_access_token");
            router.replace("/login?error=profile_fetch_failed");
          }
        }
      } catch (err) {
        console.error("[OAuth callback] Unexpected error:", err);
        router.replace("/login?error=unexpected");
      }
    }

    handleCallback();
  }, [router, saveAuth]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold gradient-text">Neumas</span>
        </div>
        <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto" />
        <p className="text-muted-foreground text-sm">Completing sign-in…</p>
      </div>
    </div>
  );
}
