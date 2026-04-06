import { NextRequest, NextResponse } from "next/server";

import { BACKEND_URL } from "@/lib/backend-url";

/**
 * GET /api/inventory/items — proxies to FastAPI GET /api/inventory/
 * (Next-specific path requested by the product shell.)
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const src = new URL(req.url);
  const target = new URL(`${BACKEND_URL}/api/inventory/`);
  src.searchParams.forEach((v, k) => target.searchParams.set(k, v));

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
