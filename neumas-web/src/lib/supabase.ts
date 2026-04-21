import { createClient } from "@/utils/supabase/client";

export { createClient as createBrowserClient } from "@/utils/supabase/client";

export const supabase = createClient();

/** Initiate Google OAuth sign-in via Supabase. */
export async function signInWithGoogle(): Promise<void> {
  const supabase = createClient();

  // Supabase dashboard reminder:
  // In Supabase Dashboard -> Auth -> URL Configuration, set Site URL to
  // https://neumas-web.vercel.app and add redirect URLs:
  // https://neumas-web.vercel.app/auth/callback and all Vercel preview domains.
  // Also add http://localhost:3000/** (use ** wildcard), and mirror the same
  // callback URL list in Google Cloud Console OAuth redirect URIs.
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });

  if (error) {
    console.error("[Supabase] OAuth initiation error:", error.message);
    throw error;
  }
}
