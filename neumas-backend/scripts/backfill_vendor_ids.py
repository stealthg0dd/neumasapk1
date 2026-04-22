"""
Backfill inventory_items.vendor_id from supplier_name / supplier_info.

Safe to run multiple times (only updates rows where vendor_id IS NULL).
Matches in this priority order:
  1. supplier_name  → vendors.name            (exact, case-insensitive)
  2. supplier_name  → vendor_aliases.alias_name
  3. supplier_info->>'name' → vendors.name
  4. supplier_info->>'name' → vendor_aliases.alias_name

Usage:
    uv run python scripts/backfill_vendor_ids.py [--dry-run] [--org-id UUID]
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


async def main(dry_run: bool, org_id_filter: str | None) -> None:
    from app.db.supabase_client import get_async_supabase_admin

    supabase = await get_async_supabase_admin()
    if supabase is None:
        print("ERROR: Supabase admin client unavailable — check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)

    # Fetch all items with no vendor_id
    query = (
        supabase.table("inventory_items")
        .select("id, organization_id, supplier_name, supplier_info")
        .is_("vendor_id", "null")
        .eq("is_active", True)
    )
    if org_id_filter:
        query = query.eq("organization_id", org_id_filter)

    resp = await query.limit(10_000).execute()
    items = resp.data or []
    print(f"Found {len(items)} items with vendor_id IS NULL")

    if not items:
        print("Nothing to do.")
        return

    # Cache vendor lookups per org to avoid N+1
    vendor_cache: dict[str, list[dict]] = {}      # org_id → [vendor rows]
    alias_cache:  dict[str, list[dict]] = {}      # org_id → [alias rows]

    async def get_vendors(org: str) -> list[dict]:
        if org not in vendor_cache:
            r = await (
                supabase.table("vendors")
                .select("id, name")
                .eq("organization_id", org)
                .eq("is_active", True)
                .execute()
            )
            vendor_cache[org] = r.data or []
        return vendor_cache[org]

    async def get_aliases(org: str) -> list[dict]:
        if org not in alias_cache:
            r = await (
                supabase.table("vendor_aliases")
                .select("vendor_id, alias_name")
                .eq("organization_id", org)
                .execute()
            )
            alias_cache[org] = r.data or []
        return alias_cache[org]

    def match(raw: str | None, vendors: list[dict], aliases: list[dict]) -> str | None:
        if not raw:
            return None
        key = raw.strip().lower()
        for v in vendors:
            if (v.get("name") or "").strip().lower() == key:
                return str(v["id"])
        for a in aliases:
            if (a.get("alias_name") or "").strip().lower() == key:
                return str(a["vendor_id"])
        return None

    updated = 0
    skipped = 0
    for item in items:
        org = item.get("organization_id")
        if not org:
            skipped += 1
            continue

        vendors = await get_vendors(org)
        aliases = await get_aliases(org)

        supplier_name: str | None = item.get("supplier_name")
        supplier_info: dict       = item.get("supplier_info") or {}
        supplier_info_name: str | None = supplier_info.get("name")

        vendor_id = (
            match(supplier_name, vendors, aliases)
            or match(supplier_info_name, vendors, aliases)
        )

        if vendor_id is None:
            skipped += 1
            continue

        print(
            f"  {'[DRY RUN] ' if dry_run else ''}item {item['id'][:8]}… "
            f"supplier={supplier_name or supplier_info_name!r} → vendor {vendor_id[:8]}…"
        )

        if not dry_run:
            await (
                supabase.table("inventory_items")
                .update({"vendor_id": vendor_id})
                .eq("id", item["id"])
                .execute()
            )
        updated += 1

    print(f"\nDone. Updated: {updated}  Skipped (no match): {skipped}")
    if dry_run:
        print("(dry run — no rows written)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill inventory_items.vendor_id")
    parser.add_argument("--dry-run", action="store_true", help="Print matches without writing")
    parser.add_argument("--org-id", default=None, help="Restrict to a single org UUID")
    args = parser.parse_args()

    asyncio.run(main(dry_run=args.dry_run, org_id_filter=args.org_id))
