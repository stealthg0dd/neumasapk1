"""
Supabase client initialization and connection management.

Multi-tenant access helpers compatible with Row Level Security (RLS):
- get_supabase_admin(): Service role client for server-side operations 
  (pattern updates, background tasks) - NEVER exposed to users
- get_supabase_for_user(jwt): User-scoped client that respects RLS policies
"""

import time
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from supabase import create_async_client, create_client, AsyncClient, Client

from app.core.config import settings
from app.core.logging import get_logger

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


def get_supabase_for_user(jwt: str) -> Client | None:
    """
    Get a Supabase client scoped to a specific user's JWT.
    
    This client respects Row Level Security (RLS) policies.
    All queries will automatically filter based on the JWT claims
    (user_id, org_id) as defined in Supabase RLS policies.
    
    Args:
        jwt: The user's access token from Supabase Auth
        
    Returns:
        Supabase client configured with user's JWT for RLS
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
        logger.warning("Supabase not configured for user client")
        return None
    
    client = create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_ANON_KEY,
    )
    # Set the auth token for RLS
    client.postgrest.auth(jwt)
    return client


async def get_async_supabase_for_user(jwt: str) -> AsyncClient | None:
    """
    Get an async Supabase client scoped to a specific user's JWT.
    
    This client respects Row Level Security (RLS) policies.
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
        logger.warning("Supabase not configured for user client")
        return None
    
    client = await create_async_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_ANON_KEY,
    )
    # Set the auth token for RLS
    client.postgrest.auth(jwt)
    return client


# =============================================================================
# Legacy aliases for backward compatibility
# =============================================================================

def get_supabase_client() -> Client | None:
    """
    Alias for get_supabase_admin() for backward compatibility.
    
    DEPRECATED: Use get_supabase_admin() or get_supabase_for_user(jwt) instead.
    """
    return get_supabase_admin()


async def get_async_supabase_client() -> AsyncClient | None:
    """
    Alias for get_async_supabase_admin() for backward compatibility.
    
    DEPRECATED: Use get_async_supabase_admin() or get_async_supabase_for_user(jwt) instead.
    """
    return await get_async_supabase_admin()


# =============================================================================
# Connection Management
# =============================================================================


async def close_supabase_clients() -> None:
    """Close all Supabase client connections."""
    global _admin_client, _async_admin_client

    if _async_admin_client is not None:
        _async_admin_client = None
        logger.info("Closed async Supabase admin client")

    if _admin_client is not None:
        _admin_client = None
        logger.info("Closed sync Supabase admin client")


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
    if client is None:
        raise RuntimeError("Supabase client not available")
    try:
        yield client
    except Exception:
        logger.exception("Supabase operation failed")
        raise


# =============================================================================
# Health Check
# =============================================================================


async def check_supabase_health() -> dict[str, Any]:
    """
    Check Supabase connection health.

    Returns:
        Health status dict with connected status and latency
    """
    # Check if Supabase is configured
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        return {
            "connected": False,
            "latency_ms": None,
            "error": "Supabase not configured",
        }

    try:
        start = time.perf_counter()
        client = await get_async_supabase_admin()
        
        if client is None:
            return {
                "connected": False,
                "latency_ms": None,
                "error": "Failed to create client",
            }

        # Try to query organizations table first
        # If it doesn't exist, we'll still consider the connection healthy
        # but note that schema needs to be set up
        try:
            result = await client.table("organizations").select("id").limit(1).execute()
        except Exception as table_err:
            error_str = str(table_err)
            # Table not found is OK - connection works, just no schema yet
            if "PGRST205" in error_str or "not found" in error_str.lower():
                latency_ms = (time.perf_counter() - start) * 1000
                return {
                    "connected": True,
                    "latency_ms": round(latency_ms, 2),
                    "error": None,
                    "warning": "Schema not initialized - run setup_schema.sql",
                }
            raise

        latency_ms = (time.perf_counter() - start) * 1000

        return {
            "connected": True,
            "latency_ms": round(latency_ms, 2),
            "error": None,
        }
    except Exception as e:
        error_msg = str(e)
        logger.error("Supabase health check failed", error=error_msg)
        return {
            "connected": False,
            "latency_ms": None,
            "error": error_msg,
        }


async def health_check() -> bool:
    """
    Simple health check that returns True if Supabase is configured and reachable.
    
    Returns True if connected OR if Supabase not configured (degraded mode OK).
    """
    # If Supabase is not configured, return True (degraded mode)
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        logger.warning("Supabase not configured - running in degraded mode")
        return True
    
    try:
        result = await check_supabase_health()
        connected = result.get("connected", False)
        if connected:
            logger.info("Supabase health check passed", latency_ms=result.get("latency_ms"))
        else:
            logger.warning("Supabase health check failed", error=result.get("error"))
        return connected
    except Exception as e:
        logger.warning("Supabase health check exception", error=str(e))
        return False


# =============================================================================
# Storage Bucket Management
# =============================================================================


async def ensure_storage_bucket(bucket_name: str = "receipts") -> bool:
    """
    Ensure a storage bucket exists, creating it if necessary.
    
    Args:
        bucket_name: Name of the bucket (default: "receipts")
        
    Returns:
        True if bucket exists or was created, False on error
    """
    client = await get_async_supabase_admin()
    if client is None:
        logger.error("Cannot manage storage - Supabase client unavailable")
        return False
    
    try:
        # List existing buckets
        buckets = await client.storage.list_buckets()
        bucket_names = [b.name for b in buckets]
        
        if bucket_name in bucket_names:
            logger.info("Storage bucket already exists", bucket=bucket_name)
            return True

        # Create the bucket
        await client.storage.create_bucket(
            bucket_name,
            options={
                "public": False,  # Private bucket - requires auth
                "file_size_limit": 10 * 1024 * 1024,  # 10MB limit
                "allowed_mime_types": [
                    "image/jpeg",
                    "image/png",
                    "image/webp",
                    "image/heic",
                ],
            }
        )
        logger.info("Created storage bucket", bucket=bucket_name)
        return True

    except Exception as e:
        logger.error("Failed to ensure storage bucket", bucket=bucket_name, error=str(e))
        return False


async def upload_receipt_image(
    file_data: bytes,
    file_name: str,
    content_type: str = "image/jpeg",
    bucket_name: str = "receipts",
) -> str | None:
    """
    Upload a receipt image to Supabase Storage.
    
    Args:
        file_data: Raw file bytes
        file_name: Name/path for the file in storage
        content_type: MIME type of the file
        bucket_name: Storage bucket name
        
    Returns:
        Public URL of the uploaded file, or None on error
    """
    client = await get_async_supabase_admin()
    if client is None:
        logger.error("Cannot upload - Supabase client unavailable")
        return None
    
    try:
        # Ensure bucket exists
        await ensure_storage_bucket(bucket_name)
        
        # Upload file
        result = await client.storage.from_(bucket_name).upload(
            file_name,
            file_data,
            {"content-type": content_type},
        )
        
        # Get signed URL (valid for 1 hour)
        signed_url = await client.storage.from_(bucket_name).create_signed_url(
            file_name,
            3600,  # 1 hour expiry
        )
        
        logger.info("Uploaded receipt image", file_name=file_name)
        return signed_url.get("signedURL") or signed_url.get("signed_url")

    except Exception as e:
        logger.error("Failed to upload receipt image", error=str(e))
        return None


async def get_receipt_signed_url(
    file_name: str,
    bucket_name: str = "receipts",
    expiry_seconds: int = 3600,
) -> str | None:
    """
    Get a signed URL for a receipt image.
    
    Args:
        file_name: Name/path of the file in storage
        bucket_name: Storage bucket name
        expiry_seconds: URL expiry time in seconds
        
    Returns:
        Signed URL or None on error
    """
    client = await get_async_supabase_admin()
    if client is None:
        return None
    
    try:
        result = await client.storage.from_(bucket_name).create_signed_url(
            file_name,
            expiry_seconds,
        )
        return result.get("signedURL") or result.get("signed_url")
    except Exception as e:
        logger.error("Failed to get signed URL", file_name=file_name, error=str(e))
        return None


# =============================================================================
# Auth Client Wrapper
# =============================================================================


class SupabaseAuthClient:
    """Wrapper for Supabase Auth operations."""

    def __init__(self, client: AsyncClient) -> None:
        self.client = client

    async def get_user(self, access_token: str) -> dict[str, Any] | None:
        """
        Get user from Supabase Auth using access token.
        """
        try:
            response = await self.client.auth.get_user(access_token)
            if response.user:
                return {
                    "id": response.user.id,
                    "email": response.user.email,
                    "phone": response.user.phone,
                    "role": response.user.role,
                    "app_metadata": response.user.app_metadata,
                    "user_metadata": response.user.user_metadata,
                    "created_at": str(response.user.created_at) if response.user.created_at else None,
                }
            return None
        except Exception as e:
            logger.warning("Failed to get user from Supabase Auth", error=str(e))
            return None

    async def verify_token(self, access_token: str) -> bool:
        """Verify if access token is valid."""
        user = await self.get_user(access_token)
        return user is not None


async def get_auth_client() -> SupabaseAuthClient | None:
    """Get Supabase Auth client wrapper."""
    client = await get_async_supabase_admin()
    if client is None:
        return None
    return SupabaseAuthClient(client)
