
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AxiosError } from "axios";
import { supabase } from "@/lib/supabase";
import { googleComplete } from "@/lib/api/endpoints";
import { saveSession } from "@/lib/auth-session";
import type { Session } from "@supabase/supabase-js";

function extractDetailMessage(detail: unknown): string | null {
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "error" in detail) {
    return String((detail as { error: unknown }).error);
  }
  if (Array.isArray(detail)) {
    const first = detail[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "msg" in first) {
      return String((first as { msg: unknown }).msg);
    }
  }
  return null;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let redirectTimer: ReturnType<typeof setTimeout> | null = null;
    let currentSession: Session | null = null;

    async function readSession(): Promise<Session | null> {
      const params = new URLSearchParams(window.location.search);
      const oauthError =
        params.get("error_description") ?? params.get("error") ?? null;
      if (oauthError) {
        throw new Error(oauthError);
      }

      const code = params.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          throw exchangeError;
        }
      }

      for (let attempt = 0; attempt < 12; attempt += 1) {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();
        if (sessionError) {
          throw sessionError;
        }
        if (session?.access_token) {
          return session;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      return null;
    }

    async function handleCallback() {
      try {
        const session = await readSession();
        if (!session) {
          console.error("[auth/callback] no Supabase session found after callback");
          router.replace("/login?error=no_session");
          return;
        }
        currentSession = session;

        console.info("[auth/callback] completing Google OAuth", {
          userId: session.user.id,
          email: session.user.email ?? null,
          hasAccessToken: Boolean(session.access_token),
          hasRefreshToken: Boolean(session.refresh_token),
          expiresAt: session.expires_at ?? null,
        });

        const loginResp = await googleComplete(session.access_token);
        saveSession({
          ...loginResp,
          refresh_token: loginResp.refresh_token ?? session.refresh_token ?? null,
          expires_in:
            loginResp.expires_in ??
            Math.max(
              60,
              (session.expires_at ?? Math.floor(Date.now() / 1000) + 3600) -
                Math.floor(Date.now() / 1000)
            ),
        });
        router.replace("/dashboard");
      } catch (err: unknown) {
        const error = err as AxiosError<{ detail?: unknown }>;
        const status = error.response?.status;
        const detail = error.response?.data?.detail;
        const detailMessage = extractDetailMessage(detail);
        const redirectMessage =
          detailMessage ??
          error.message ??
          "Authentication could not be completed.";

        console.error("[auth/callback] googleComplete failed", {
          status,
          detail,
          detailMessage,
          message: error.message,
        });

        if (
          status === 422 &&
          ["onboarding_required", "setup_incomplete"].includes(detailMessage ?? "") &&
          currentSession?.access_token
        ) {
          router.replace(
            `/onboard?supabase_jwt=${encodeURIComponent(currentSession.access_token)}`
          );
          return;
        }

        if (cancelled) return;
        setError(redirectMessage);
        redirectTimer = setTimeout(() => {
          router.replace("/login?error=oauth_complete_failed");
        }, 3000);
      }
    }

    handleCallback();

    return () => {
      cancelled = true;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-red-600 mb-2">Authentication Failed</h2>
          <p className="text-[#64748b] mb-4">{error}</p>
          <p className="text-sm text-[#94a3b8]">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[#2563eb] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[#64748b] text-sm">Completing sign in...</p>
      </div>
    </div>
  );
}
