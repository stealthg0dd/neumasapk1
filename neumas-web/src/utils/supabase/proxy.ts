import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getCanonicalAppUrl, isLegacyAppHost } from "@/lib/app-url";

import { getSupabaseCookieOptions, getSupabasePublishableKey, getSupabaseUrl } from "./shared";

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const host = request.headers.get("host");
  if (host && isLegacyAppHost(host)) {
    const canonical = new URL(getCanonicalAppUrl());
    const redirectUrl = new URL(request.url);
    redirectUrl.protocol = canonical.protocol;
    redirectUrl.host = canonical.host;
    return NextResponse.redirect(redirectUrl, 308);
  }

  const isProtectedPath =
    pathname.startsWith("/dashboard") || pathname.startsWith("/app") || pathname.startsWith("/admin");
  if (isProtectedPath) {
    const hasSupabaseSessionCookie = request.cookies
      .getAll()
      .some(({ name }) => name.startsWith("sb-") && name.endsWith("-auth-token"));
    if (!hasSupabaseSessionCookie) {
      const loginUrl = new URL("/auth", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl, 307);
    }
  }

  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const cookieOptions = getSupabaseCookieOptions();
  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll().map(({ name, value }) => ({ name, value }));
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, {
              ...cookieOptions,
              ...options,
            });
          });

          Object.entries(headers).forEach(([key, value]) => {
            response.headers.set(key, value);
          });
        },
      },
      cookieOptions,
    }
  );

  await supabase.auth.getClaims();

  return response;
}
