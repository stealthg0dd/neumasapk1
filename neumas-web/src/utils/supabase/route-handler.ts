import { createServerClient } from "@supabase/ssr";
import type { cookies } from "next/headers";

import {
  getSupabaseCookieOptions,
  getSupabasePublishableKey,
  getSupabaseUrl,
} from "./shared";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

export function createRouteHandlerClient({
  cookies,
}: {
  cookies: () => CookieStore;
}) {
  const cookieStore = cookies();
  const cookieOptions = getSupabaseCookieOptions();

  return createServerClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll().map(({ name, value }) => ({ name, value }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              ...cookieOptions,
              ...options,
            });
          });
        },
      },
      cookieOptions,
    }
  );
}
