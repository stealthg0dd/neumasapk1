import { NextRequest, NextResponse } from "next/server";

import { BACKEND_URL } from "@/lib/backend-url";
import type { InventoryUpdateRequest, InventoryUpdateResponse } from "@/lib/api/types";

/**
 * PATCH /api/inventory/batch — sequential upserts via POST /api/inventory/update.
 */
export async function PATCH(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  let body: { updates?: InventoryUpdateRequest[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON" }, { status: 400 });
  }

  const updates = body.updates ?? [];
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ detail: "updates[] required" }, { status: 400 });
  }

  const results: InventoryUpdateResponse[] = [];

  for (const u of updates) {
    const payload = {
      property_id: u.property_id,
      item_name: u.item_name,
      new_qty: u.new_qty,
      unit: u.unit ?? "unit",
      trigger_prediction: u.trigger_prediction ?? true,
    };

    const res = await fetch(`${BACKEND_URL}/api/inventory/update`, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    if (!res.ok) {
      return new NextResponse(text, {
        status: res.status,
        headers: {
          "Content-Type": res.headers.get("content-type") ?? "application/json",
        },
      });
    }

    try {
      results.push(JSON.parse(text) as InventoryUpdateResponse);
    } catch {
      return NextResponse.json(
        { detail: "Unexpected response from inventory update" },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ ok: true, results });
}
