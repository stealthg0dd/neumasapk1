import { NextRequest, NextResponse } from "next/server";

import { BACKEND_URL } from "@/lib/backend-url";

/**
 * GET /api/scan/recent — recent scans (proxies GET /api/scan/ with sensible defaults).
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const src = new URL(req.url);
  const limit = src.searchParams.get("limit") ?? "5";
  const offset = src.searchParams.get("offset") ?? "0";
  const target = new URL(`${BACKEND_URL}/api/scan/`);
  target.searchParams.set("limit", limit);
  target.searchParams.set("offset", offset);
  const status = src.searchParams.get("status");
  if (status) target.searchParams.set("status", status);

  const res = await fetch(target.toString(), {
    headers: { Authorization: auth, Accept: "application/json" },
    cache: "no-store",
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/json",
    },
  });
}
