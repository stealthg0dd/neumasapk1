"""
Supabase client initialization and connection management.

Multi-tenant access helpers compatible with Row Level Security (RLS):
- get_supabase_admin(): Service role client for server-side operations
  (pattern updates, background tasks) - NEVER exposed to users
- get_supabase_for_user(jwt): User-scoped client that respects RLS policies
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger
from supabase import Client, create_client
from supabase._async.client import AsyncClient, create_async_client

logger = get_logger(__name__)

# =============================================================================
# Admin Clients (Service Role Key)
# These bypass RLS - use only for server-side operations
# =============================================================================

# Sync admin client (for simple operations)
_admin_client: Client | None = None

# Async admin client (preferred for FastAPI)
_async_admin_client: AsyncClient | None = None


def get_supabase_admin() -> Client | None:
    """
    Get synchronous Supabase admin client using SERVICE_ROLE_KEY.

    WARNING: This client bypasses Row Level Security.
    Use ONLY for server-side operations like:
    - Background tasks (Celery workers)
    - Pattern/prediction updates
    - Admin operations

    NEVER expose this client to user-facing endpoints directly.

    Returns None if Supabase is not configured.
    """
    global _admin_client

    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        logger.warning("Supabase not configured - admin client unavailable")
        return None

    if _admin_client is None:
        _admin_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
        )
        logger.info("Initialized sync Supabase admin client (service role)")
    return _admin_client


async def get_async_supabase_admin() -> AsyncClient | None:
    """
    Get asynchronous Supabase admin client using SERVICE_ROLE_KEY.

    WARNING: This client bypasses Row Level Security.
    Use ONLY for server-side operations like:
    - Background tasks (Celery workers)
    - Pattern/prediction updates
    - Admin operations

    NEVER expose this client to user-facing endpoints directly.

    Returns None if Supabase is not configured.
    """
    global _async_admin_client

    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        logger.warning("Supabase not configured - async admin client unavailable")
        return None

    if _async_admin_client is None:
        _async_admin_client = await create_async_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
        )
        logger.info("Initialized async Supabase admin client (service role)")
    return _async_admin_client


# =============================================================================
# User-Scoped Clients (JWT-based, RLS-enabled)
# These clients respect Row Level Security policies
# =============================================================================


def get_supabase_for_user(jwt: str) -> Client:
    """
    Get a Supabase client scoped to a specific user's JWT.

    This client respects Row Level Security (RLS) policies.
    All queries will automatically filter based on the JWT claims
    (user_id, org_id) as defined in Supabase RLS policies.

    Args:
        jwt: The user's access token from Supabase Auth

    Returns:
        Supabase client configured with user's JWT for RLS

    Example:
        # In an endpoint with authenticated user
        client = get_supabase_for_user(user_jwt)
        # This query will only return rows the user can access
        result = client.table("inventory_items").select("*").execute()
    """
    # Create client with user's JWT in the Authorization header
    # The official supabase-py client supports passing custom headers
    client = create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_ANON_KEY,  # Use anon key with user JWT
        options={
            "headers": {
                "Authorization": f"Bearer {jwt}",
            }
        }
    )
    return client


async def get_async_supabase_for_user(jwt: str) -> AsyncClient:
    """
    Get an async Supabase client scoped to a specific user's JWT.

    This client respects Row Level Security (RLS) policies.
    All queries will automatically filter based on the JWT claims
    (user_id, org_id) as defined in Supabase RLS policies.

    Args:
        jwt: The user's access token from Supabase Auth

    Returns:
        Async Supabase client configured with user's JWT for RLS

    Example:
        # In an async endpoint with authenticated user
        client = await get_async_supabase_for_user(user_jwt)
        result = await client.table("scans").select("*").execute()
    """
    client = await create_async_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_ANON_KEY,  # Use anon key with user JWT
        options={
            "headers": {
                "Authorization": f"Bearer {jwt}",
            }
        }
    )
    return client


# =============================================================================
# Legacy aliases for backward compatibility
# =============================================================================

def get_supabase_client() -> Client | None:
    """
    Alias for get_supabase_admin() for backward compatibility.

    DEPRECATED: Use get_supabase_admin() or get_supabase_for_user(jwt) instead.

    Returns None if Supabase is not configured.
    """
    return get_supabase_admin()


async def get_async_supabase_client() -> AsyncClient | None:
    """
    Alias for get_async_supabase_admin() for backward compatibility.

    DEPRECATED: Use get_async_supabase_admin() or get_async_supabase_for_user(jwt) instead.

    Returns None if Supabase is not configured.
    """
    return await get_async_supabase_admin()


# =============================================================================
# Connection Management
# =============================================================================


async def close_supabase_clients() -> None:
    """Close all Supabase client connections."""
    global _admin_client, _async_admin_client

    if _async_admin_client is not None:
        # Note: supabase-py async client may not have explicit close
        # but we reset the reference
        _async_admin_client = None
        logger.info("Closed async Supabase admin client")

    if _admin_client is not None:
        _admin_client = None
        logger.info("Closed sync Supabase admin client")


# Legacy alias
async def close_supabase_client() -> None:
    """Alias for close_supabase_clients() for backward compatibility."""
    await close_supabase_clients()


@asynccontextmanager
async def supabase_transaction() -> AsyncGenerator[AsyncClient, None]:
    """
    Context manager for Supabase operations.
    Note: Supabase client doesn't support true transactions via REST API,
    but this provides a consistent interface.
    """
    client = await get_async_supabase_client()
    try:
        yield client
    except Exception:
        logger.exception("Supabase operation failed")
        raise


async def check_supabase_health() -> dict[str, Any]:
    """
    Check Supabase connection health.

    Returns:
        Health status dict with connected status and latency
    """
    import time

    # Check if Supabase is configured
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        return {
            "connected": False,
            "latency_ms": None,
            "error": "Supabase not configured",
        }

    try:
        start = time.perf_counter()
        client = await get_async_supabase_client()

        # Simple query to verify connection
        # Using a system table or simple select
        await client.table("organizations").select("id").limit(1).execute()

        latency_ms = (time.perf_counter() - start) * 1000

        return {
            "connected": True,
            "latency_ms": round(latency_ms, 2),
            "error": None,
        }
    except Exception as e:
        logger.error("Supabase health check failed", error=str(e))
        return {
            "connected": False,
            "latency_ms": None,
            "error": str(e),
        }


async def health_check() -> bool:
    """
    Simple health check that returns True if Supabase is configured and reachable.

    Returns True even if Supabase is not configured (degraded mode).
    This allows the app's /ready endpoint to start.
    """
    # If Supabase is not configured, return True (degraded mode)
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        logger.warning("Supabase not configured - running in degraded mode")
        return True

    try:
        result = await check_supabase_health()
        return result.get("connected", False)
    except Exception as e:
        logger.warning("Supabase health check failed", error=str(e))
        return True  # Return True to not block startup


class SupabaseAuthClient:
    """
    Wrapper for Supabase Auth operations.
    """

    def __init__(self, client: AsyncClient) -> None:
        self.client = client

    async def get_user(self, access_token: str) -> dict[str, Any] | None:
        """
        Get user from Supabase Auth using access token.

        Args:
            access_token: JWT access token

        Returns:
            User data dict or None if invalid
        """
        try:
            # Use Supabase auth to validate and get user
            response = await self.client.auth.get_user(access_token)
            if response.user:
                return {
                    "id": response.user.id,
                    "email": response.user.email,
                    "phone": response.user.phone,
                    "role": response.user.role,
                    "app_metadata": response.user.app_metadata,
                    "user_metadata": response.user.user_metadata,
                    "created_at": response.user.created_at,
                }
            return None
        except Exception as e:
            logger.warning("Failed to get user from Supabase Auth", error=str(e))
            return None

    async def verify_token(self, access_token: str) -> bool:
        """
        Verify if access token is valid.

        Args:
            access_token: JWT access token

        Returns:
            True if valid, False otherwise
        """
        user = await self.get_user(access_token)
        return user is not None


async def get_auth_client() -> SupabaseAuthClient:
    """Get Supabase Auth client wrapper."""
    client = await get_async_supabase_client()
    return SupabaseAuthClient(client)


# TODO: Add connection pooling for high-traffic scenarios
# TODO: Add retry logic for transient failures
# TODO: Add metrics collection for monitoring
