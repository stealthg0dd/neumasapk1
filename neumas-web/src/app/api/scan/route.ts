import { NextRequest, NextResponse } from "next/server";

import { BACKEND_URL } from "@/lib/backend-url";

/**
 * POST /api/scan — multipart scan (proxies to POST /api/scan/upload).
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();

  const res = await fetch(`${BACKEND_URL}/api/scan/upload`, {
    method: "POST",
    headers: { Authorization: auth },
    body: form,
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/json",
    },
  });
}
