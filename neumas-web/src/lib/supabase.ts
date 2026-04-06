/**
 * Supabase browser client — singleton.
 *
 * Used exclusively for auth operations (signInWithOAuth, exchangeCodeForSession,
 * getSession). All data queries go through the backend API, not directly to
 * Supabase from the browser.
 *
 * The anon key is safe to expose to the browser — it only grants access
 * that is further restricted by Supabase RLS policies.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  // Non-fatal warning — avoids crashing SSR where these may not be resolved yet.
  console.warn(
    "[Supabase] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. " +
      "Google OAuth will not work until these are configured."
  );
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key-for-build"
);

/** Initiate Google OAuth sign-in via Supabase. */
export async function signInWithGoogle(): Promise<void> {
  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : "/auth/callback";

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });

  if (error) {
    console.error("[Supabase] OAuth initiation error:", error.message);
    throw error;
  }
}
