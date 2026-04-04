#!/usr/bin/env python3
"""Test what role the admin client uses and if RLS bypass works."""
import asyncio


async def test():
    from app.db.supabase_client import get_async_supabase_admin

    client = await get_async_supabase_admin()
    print("Testing direct org insert with admin client...")

    # Test if we can query organizations (bypassing RLS)
    try:
        result = await client.table("organizations").select("id, name, slug").limit(3).execute()
        print(f"Org query OK: {len(result.data)} rows")
    except Exception as e:
        print(f"Org query Error: {e}")

    # Test insert into organizations
    import uuid
    slug = f"test-rls-{uuid.uuid4().hex[:4]}"
    print(f"\nTesting org insert with slug: {slug}")
    try:
        result = await client.table("organizations").insert({
            "name": "RLS Test Org",
            "slug": slug,
        }).execute()
        print(f"Org insert OK: {result.data}")
        # Clean up
        org_id = result.data[0]["id"]
        await client.table("organizations").delete().eq("id", org_id).execute()
        print("Cleaned up test org")
    except Exception as e:
        print(f"Org insert Error: {e}")

asyncio.run(test())
