
"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { googleComplete } from "@/lib/api/endpoints";
import { saveSession } from "@/lib/auth-session";
import type { Session } from "@supabase/supabase-js";

export default function AuthCallbackPage() {
  const router = useRouter();
  // Prevent double-processing when both onAuthStateChange and getSession fire
  const handled = useRef(false);

  useEffect(() => {
    async function handleSession(session: Session) {
      if (handled.current) return;
      handled.current = true;

      try {
        const loginResp = await googleComplete(session.access_token);
        saveSession(loginResp);
        router.replace("/dashboard");
      } catch (err: any) {
        const status = err?.response?.status ?? err?.status;
        if (status === 422) {
          // New user — backend signalled onboarding_required
          router.replace(
            `/onboard?supabase_jwt=${encodeURIComponent(session.access_token)}`
          );
        } else {
          console.error("[auth/callback] googleComplete failed", err);
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) handleSession(session);
    });

    return () => {
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
