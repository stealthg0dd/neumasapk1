import type { NextRequest } from "next/server";

import { updateSession } from "@/utils/supabase/proxy";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|icon-192.png|icon-512.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
