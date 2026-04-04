#!/usr/bin/env python3
"""Test inserting into users with admin client."""
import asyncio
import uuid


async def test():
    from app.db.supabase_client import get_async_supabase_admin

    client = await get_async_supabase_admin()

    # First, create a test org
    test_id = uuid.uuid4().hex[:6]
    print(f"Test ID: {test_id}")

    print("\n1. Creating org...")
    try:
        org = await client.table("organizations").insert({
            "name": f"Test Org {test_id}",
            "slug": f"test-{test_id}",
        }).execute()
        org_id = org.data[0]["id"]
        print(f"Org created: {org_id}")
    except Exception as e:
        print(f"Org error: {e}")
        return

    print("\n2. Creating property...")
    try:
        prop = await client.table("properties").insert({
            "org_id": org_id,
            "name": "Test Prop",
            "type": "hotel",
        }).execute()
        prop_id = prop.data[0]["id"]
        print(f"Property created: {prop_id}")
    except Exception as e:
        print(f"Property error: {e}")
        # Clean up
        await client.table("organizations").delete().eq("id", org_id).execute()
        return

    print("\n3. Creating user record with org_id...")
    # Fake auth_id for test
    fake_auth_id = str(uuid.uuid4())
    try:
        user = await client.table("users").insert({
            "auth_id": fake_auth_id,
            "email": f"test-{test_id}@test.com",
            "org_id": org_id,
            "role": "admin",
            "is_active": True,
        }).execute()
        user_id = user.data[0]["id"]
        print(f"User record created: {user_id}")
        print("\n=== ALL STEPS SUCCESSFUL ===")
    except Exception as e:
        print(f"User insert error: {e}")

    # Clean up
    await client.table("organizations").delete().eq("id", org_id).execute()
    print("Cleaned up test data")

asyncio.run(test())
