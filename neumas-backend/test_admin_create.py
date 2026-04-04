#!/usr/bin/env python3
"""Test admin user creation API."""
import asyncio


async def test():
    import uuid

    from app.db.supabase_client import get_async_supabase_admin

    client = await get_async_supabase_admin()
    unique = uuid.uuid4().hex[:8]
    email = f"admin-{unique}@demo.com"

    print(f"Testing admin.create_user for: {email}")
    try:
        result = await client.auth.admin.create_user({
            "email": email,
            "password": "Admin123456",
            "email_confirm": True,
        })
        if result.user:
            print(f"SUCCESS: User created with ID: {result.user.id}")
        else:
            print("ERROR: No user returned")
    except Exception as e:
        print(f"ERROR: {e}")

asyncio.run(test())
