
"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { AxiosError } from "axios";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { googleComplete } from "@/lib/api/endpoints";
import { saveSession } from "@/lib/auth-session";
import type { Session } from "@supabase/supabase-js";

export default function AuthCallbackPage() {
  const router = useRouter();
  // Prevent double-processing when both onAuthStateChange and getSession fire
  const handled = useRef(false);

  useEffect(() => {
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    async function handleSession(session: Session) {
      if (handled.current) return;
      handled.current = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);

      try {
        console.info("[auth/callback] completing Google OAuth", {
          userId: session.user.id,
          email: session.user.email ?? null,
          hasAccessToken: Boolean(session.access_token),
          expiresAt: session.expires_at ?? null,
          requestBody: {},
        });
        const loginResp = await googleComplete(session.access_token);
        saveSession(loginResp);
        toast.success("Welcome to Neumas!");
        router.replace("/dashboard");
      } catch (err: unknown) {
        const error = err as AxiosError<{ detail?: unknown }>;
        const status = error.response?.status;
        const detail = error.response?.data?.detail;

        console.error("[auth/callback] googleComplete failed", {
          status,
          detail,
          message: error.message,
        });

        if (status === 422 && detail === "onboarding_required") {
          // New user — backend signalled onboarding_required
          router.replace(
            `/onboard?supabase_jwt=${encodeURIComponent(session.access_token)}`
          );
        } else {
          router.replace("/login?error=oauth_complete_failed");
        }
      }
    }

    // Listen for Supabase SIGNED_IN event (fires after PKCE code exchange)
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        handleSession(session);
      }
    });

    // Also check for an already-active session (page reload / tab switch)
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (session) {
        handleSession(session);
        return;
      }
      if (error) {
        console.error("[auth/callback] failed to read Supabase session", error);
      }
    });

    fallbackTimer = setTimeout(() => {
      if (!handled.current) {
        handled.current = true;
        router.replace("/login?error=oauth_failed");
      }
    }, 5000);

    return () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      sub.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[#2563eb] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[#64748b] text-sm">Signing you in…</p>
      </div>
    </div>
  );
}
