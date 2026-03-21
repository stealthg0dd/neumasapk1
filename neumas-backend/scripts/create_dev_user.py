"""
Create a development/test user directly via the Supabase Admin API.
Run from the backend root:

    python scripts/create_dev_user.py

Requires environment variables:
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
    DATABASE_URL  (or SUPABASE_DB_URL)
"""

import asyncio
import os
import sys
import httpx

# ---------------------------------------------------------------------------
# Credentials for the dummy user
# ---------------------------------------------------------------------------
DUMMY_EMAIL    = "admin@neumas.dev"
DUMMY_PASSWORD = "Neumas2024!"
DUMMY_ORG      = "Neumas Demo Org"
DUMMY_PROPERTY = "Main Kitchen"

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")


async def create_user():
    payload = {
        "email":         DUMMY_EMAIL,
        "password":      DUMMY_PASSWORD,
        "org_name":      DUMMY_ORG,
        "property_name": DUMMY_PROPERTY,
    }

    print(f"Creating user: {DUMMY_EMAIL}")
    print(f"  Target backend: {BACKEND_URL}")

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.post(f"{BACKEND_URL}/api/auth/signup", json=payload)
            if resp.status_code in (200, 201):
                data = resp.json()
                print("\nUser created successfully!")
                print(f"  Email:    {DUMMY_EMAIL}")
                print(f"  Password: {DUMMY_PASSWORD}")
                print(f"  Org:      {DUMMY_ORG}")
                print(f"  Property: {DUMMY_PROPERTY}")
                if data.get("profile"):
                    p = data["profile"]
                    print(f"  user_id:  {p.get('user_id')}")
                    print(f"  org_id:   {p.get('org_id')}")
            elif resp.status_code == 400:
                detail = resp.json().get("detail", resp.text)
                print(f"\nUser may already exist (400): {detail}")
                print("Try logging in with the credentials above.")
            else:
                print(f"\nError {resp.status_code}: {resp.text}")
                sys.exit(1)
        except httpx.ConnectError:
            print(f"\nCould not connect to {BACKEND_URL}")
            print("Make sure the backend is running or set BACKEND_URL env var.")
            sys.exit(1)


if __name__ == "__main__":
    asyncio.run(create_user())
