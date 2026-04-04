#!/usr/bin/env python3
"""Test signup flow step by step."""
import asyncio
import uuid


async def test_signup():
    from app.db.supabase_client import get_async_supabase_admin
    from app.services.auth_service import generate_slug

    admin_client = await get_async_supabase_admin()
    if not admin_client:
        print("ERROR: Admin client not available")
        return

    # Use a unique email
    unique_id = uuid.uuid4().hex[:8]
    email = f"test-{unique_id}@neumastest.com"
    password = "TestPassword123"
    org_name = f"Test Org {unique_id}"

    print(f"Testing signup for: {email}")

    # Step 1: Create auth user
    print("\n1. Creating auth user...")
    try:
        auth_response = await admin_client.auth.sign_up({
            "email": email,
            "password": password,
        })
        print(f"Auth response: user={auth_response.user is not None}, session={auth_response.session is not None}")
        if auth_response.user:
            auth_id = auth_response.user.id
            print(f"Auth ID: {auth_id}")
        else:
            print("ERROR: No user returned")
            return
    except Exception as e:
        print(f"Auth error: {e}")
        return

    # Step 2: Create organization
    print("\n2. Creating organization...")
    org_slug = generate_slug(org_name)
    print(f"Generated slug: {org_slug}")
    try:
        org_response = await admin_client.table("organizations").insert({
            "name": org_name,
            "slug": org_slug,
        }).execute()
        print(f"Org created: {org_response.data[0]['id']}")
        org_id = org_response.data[0]["id"]
    except Exception as e:
        print(f"Org error: {e}")
        return

    # Step 3: Create property
    print("\n3. Creating property...")
    try:
        prop_response = await admin_client.table("properties").insert({
            "org_id": str(org_id),
            "name": "Test Property",
            "type": "hotel",
        }).execute()
        print(f"Property created: {prop_response.data[0]['id']}")
        property_id = prop_response.data[0]["id"]
    except Exception as e:
        print(f"Property error: {e}")
        return

    # Step 4: Create user record
    print("\n4. Creating user record...")
    try:
        user_response = await admin_client.table("users").insert({
            "auth_id": str(auth_id),
            "email": email.lower(),
            "org_id": str(org_id),
            "role": "admin",
            "is_active": True,
        }).execute()
        print(f"User created: {user_response.data[0]['id']}")
        user_id = user_response.data[0]["id"]
    except Exception as e:
        print(f"User error: {e}")
        return

    print("\n" + "="*50)
    print("SIGNUP FLOW SUCCESSFUL!")
    print("="*50)
    print(f"Email: {email}")
    print(f"Password: {password}")
    print(f"Auth ID: {auth_id}")
    print(f"Org ID: {org_id}")
    print(f"Property ID: {property_id}")
    print(f"User ID: {user_id}")

if __name__ == "__main__":
    asyncio.run(test_signup())
