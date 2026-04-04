#!/usr/bin/env python3
"""Test signup flow using admin.create_user API."""
import asyncio
import uuid


async def test():
    from app.db.supabase_client import get_async_supabase_admin
    from app.services.auth_service import generate_slug

    admin_client = await get_async_supabase_admin()
    unique = uuid.uuid4().hex[:8]
    email = f"test-signup-{unique}@demo.com"
    password = "TestPassword123"
    org_name = f"Test Org {unique}"

    print(f"Testing signup for: {email}")

    # Step 1: Use admin.create_user (no email rate limits)
    print("\n1. Creating auth user (admin API)...")
    try:
        auth_result = await admin_client.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
        })
        if auth_result.user:
            auth_id = auth_result.user.id
            print(f"Auth user created: {auth_id}")
        else:
            print("ERROR: No user returned")
            return
    except Exception as e:
        print(f"Auth error: {e}")
        return

    # Step 2: Sign in to get session
    print("\n2. Signing in to get session...")
    try:
        login = await admin_client.auth.sign_in_with_password({
            "email": email,
            "password": password,
        })
        access_token = login.session.access_token if login.session else ""
        print(f"Session obtained: {bool(access_token)}")
    except Exception as e:
        print(f"Sign in error: {e}")
        access_token = ""

    # Step 3: Create organization
    print("\n3. Creating organization...")
    org_slug = generate_slug(org_name)
    print(f"Slug: {org_slug}")
    try:
        org_resp = await admin_client.table("organizations").insert({
            "name": org_name,
            "slug": org_slug,
        }).execute()
        org_id = org_resp.data[0]["id"]
        print(f"Org created: {org_id}")
    except Exception as e:
        print(f"Org error: {e}")
        return

    # Step 4: Create property
    print("\n4. Creating property...")
    try:
        prop_resp = await admin_client.table("properties").insert({
            "org_id": str(org_id),
            "name": "Test Property",
            "type": "hotel",
        }).execute()
        property_id = prop_resp.data[0]["id"]
        print(f"Property created: {property_id}")
    except Exception as e:
        print(f"Property error: {e}")
        return

    # Step 5: Create user record
    print("\n5. Creating user record...")
    try:
        user_resp = await admin_client.table("users").insert({
            "auth_id": str(auth_id),
            "email": email.lower(),
            "org_id": str(org_id),
            "role": "admin",
            "is_active": True,
        }).execute()
        user_id = user_resp.data[0]["id"]
        print(f"User record created: {user_id}")
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
    print(f"Access Token: {access_token[:20]}..." if access_token else "Access Token: (none)")

asyncio.run(test())
