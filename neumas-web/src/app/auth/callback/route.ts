import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { createRouteHandlerClient } from '@/utils/supabase/route-handler'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/dashboard'

  // Supabase Dashboard reminder:
  // Add redirect URLs for http://localhost:3000/auth/callback,
  // https://neumas-web.vercel.app/auth/callback, and all Vercel preview domains.
  if (code) {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocal = process.env.NODE_ENV === 'development'
      const redirectUrl = isLocal
        ? `${requestUrl.origin}${next}`
        : forwardedHost
          ? `https://${forwardedHost}${next}`
          : `${requestUrl.origin}${next}`

      return NextResponse.redirect(redirectUrl)
    }
  }

  // Error fallback
  return NextResponse.redirect(`${requestUrl.origin}/login?error=oauth_complete_failed`)
}
