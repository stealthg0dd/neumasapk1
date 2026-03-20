"""
Security utilities for authentication, authorization, and cryptography.

Production-ready with:
- CORS configuration
- Rate limiting (Redis-backed)
- Sensitive data masking
"""

import functools
import hashlib
import re
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from fastapi import HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from passlib.context import CryptContext

from app.core.config import settings

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class SecurityError(Exception):
    """Base exception for security-related errors."""

    pass


class TokenValidationError(SecurityError):
    """Raised when token validation fails."""

    pass


class RateLimitExceeded(HTTPException):
    """Raised when rate limit is exceeded."""

    def __init__(self, retry_after: int = 60):
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Retry after {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )


# =============================================================================
# CORS Configuration
# =============================================================================


def get_cors_config() -> dict[str, Any]:
    """
    Get CORS configuration from settings.

    Returns configuration dict for CORSMiddleware.
    """
    return {
        "allow_origins": settings.cors_origins_list,
        "allow_credentials": True,
        "allow_methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        "allow_headers": [
            "Authorization",
            "Content-Type",
            "X-Request-ID",
            "X-Tenant-ID",
            "X-API-Key",
        ],
        "expose_headers": [
            "X-Request-ID",
            "X-RateLimit-Limit",
            "X-RateLimit-Remaining",
            "X-RateLimit-Reset",
        ],
        "max_age": 600,  # Cache preflight for 10 minutes
    }


def configure_cors(app: Any) -> None:
    """
    Configure CORS middleware on the FastAPI app.

    Args:
        app: FastAPI application instance
    """
    cors_config = get_cors_config()
    app.add_middleware(CORSMiddleware, **cors_config)


# =============================================================================
# Rate Limiting (Redis-backed stub)
# =============================================================================


class RateLimiter:
    """
    Redis-backed rate limiter.

    Uses sliding window algorithm with Redis sorted sets.
    Falls back to in-memory storage if Redis unavailable.
    """

    def __init__(
        self,
        requests_per_minute: int = 60,
        requests_per_hour: int = 1000,
    ):
        self.requests_per_minute = requests_per_minute
        self.requests_per_hour = requests_per_hour
        self._redis_client = None
        self._local_cache: dict[str, list[float]] = {}

    @property
    def redis_client(self):
        """Lazy-load Redis client."""
        if self._redis_client is None and settings.REDIS_URL:
            try:
                import redis

                self._redis_client = redis.from_url(
                    settings.REDIS_URL,
                    decode_responses=True,
                )
            except Exception:
                self._redis_client = None
        return self._redis_client

    def _get_client_id(self, request: Request) -> str:
        """
        Get unique client identifier from request.

        Uses: IP address + user_id (if authenticated) + route
        """
        # Get client IP
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            ip = forwarded.split(",")[0].strip()
        else:
            ip = request.client.host if request.client else "unknown"

        # Get user_id from state if available
        user_id = getattr(request.state, "user_id", "anonymous")

        # Combine with route
        route = request.url.path
        identifier = f"{ip}:{user_id}:{route}"

        # Hash to create consistent key
        return hashlib.sha256(identifier.encode()).hexdigest()[:16]

    async def check_rate_limit(
        self,
        request: Request,
        limit: int | None = None,
        window_seconds: int = 60,
    ) -> tuple[bool, dict[str, int]]:
        """
        Check if request is within rate limit.

        Args:
            request: FastAPI Request object
            limit: Max requests per window (default: requests_per_minute)
            window_seconds: Time window in seconds

        Returns:
            Tuple of (is_allowed, rate_limit_info)
        """
        limit = limit or self.requests_per_minute
        client_id = self._get_client_id(request)
        key = f"ratelimit:{client_id}:{window_seconds}"
        now = time.time()
        window_start = now - window_seconds

        if self.redis_client:
            try:
                pipe = self.redis_client.pipeline()
                # Remove old entries
                pipe.zremrangebyscore(key, 0, window_start)
                # Add current request
                pipe.zadd(key, {str(now): now})
                # Count requests in window
                pipe.zcard(key)
                # Set expiry
                pipe.expire(key, window_seconds + 1)
                results = pipe.execute()
                count = results[2]
            except Exception:
                # Fallback to local cache
                count = self._check_local_cache(key, now, window_start)
        else:
            count = self._check_local_cache(key, now, window_start)

        remaining = max(0, limit - count)
        reset_time = int(now + window_seconds)

        rate_info = {
            "limit": limit,
            "remaining": remaining,
            "reset": reset_time,
        }

        return count <= limit, rate_info

    def _check_local_cache(
        self,
        key: str,
        now: float,
        window_start: float,
    ) -> int:
        """Fallback local cache for rate limiting."""
        if key not in self._local_cache:
            self._local_cache[key] = []

        # Filter to current window
        self._local_cache[key] = [
            ts for ts in self._local_cache[key] if ts > window_start
        ]
        self._local_cache[key].append(now)
        return len(self._local_cache[key])


# Global rate limiter instance
rate_limiter = RateLimiter()


def rate_limit(
    requests_per_minute: int = 60,
    requests_per_hour: int | None = None,
):
    """
    Rate limiting decorator for route handlers.

    Usage:
        @router.get("/resource")
        @rate_limit(requests_per_minute=30)
        async def get_resource(request: Request):
            ...

    Args:
        requests_per_minute: Max requests per minute
        requests_per_hour: Max requests per hour (optional)
    """

    def decorator(func: Callable):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract request from args/kwargs
            request = kwargs.get("request")
            if request is None:
                for arg in args:
                    if isinstance(arg, Request):
                        request = arg
                        break

            if request is None:
                # Can't rate limit without request
                return await func(*args, **kwargs)

            # Check rate limit
            is_allowed, rate_info = await rate_limiter.check_rate_limit(
                request,
                limit=requests_per_minute,
                window_seconds=60,
            )

            if not is_allowed:
                raise RateLimitExceeded(retry_after=rate_info["reset"] - int(time.time()))

            # Add rate limit headers to response
            # This requires the route to return a Response object
            result = await func(*args, **kwargs)
            return result

        return wrapper

    return decorator


# =============================================================================
# Sensitive Data Masking
# =============================================================================

# Patterns for sensitive fields
SENSITIVE_PATTERNS = [
    re.compile(r"password", re.IGNORECASE),
    re.compile(r"secret", re.IGNORECASE),
    re.compile(r"token", re.IGNORECASE),
    re.compile(r"api[_-]?key", re.IGNORECASE),
    re.compile(r"auth", re.IGNORECASE),
    re.compile(r"credential", re.IGNORECASE),
    re.compile(r"private[_-]?key", re.IGNORECASE),
    re.compile(r"access[_-]?key", re.IGNORECASE),
    re.compile(r"jwt", re.IGNORECASE),
    re.compile(r"bearer", re.IGNORECASE),
    re.compile(r"authorization", re.IGNORECASE),
    re.compile(r"credit[_-]?card", re.IGNORECASE),
    re.compile(r"ssn", re.IGNORECASE),
    re.compile(r"social[_-]?security", re.IGNORECASE),
]


def mask_sensitive(
    data: dict[str, Any],
    mask_char: str = "*",
    visible_chars: int = 4,
) -> dict[str, Any]:
    """
    Mask sensitive fields in a dictionary to avoid logging secrets.

    Recursively processes nested dictionaries and lists.

    Args:
        data: Dictionary potentially containing sensitive data
        mask_char: Character to use for masking (default: *)
        visible_chars: Number of characters to leave visible at end

    Returns:
        New dictionary with sensitive values masked

    Example:
        >>> mask_sensitive({"password": "secret123", "name": "John"})
        {"password": "*****t123", "name": "John"}
    """
    if not isinstance(data, dict):
        return data

    result = {}
    for key, value in data.items():
        if _is_sensitive_key(key):
            result[key] = _mask_value(value, mask_char, visible_chars)
        elif isinstance(value, dict):
            result[key] = mask_sensitive(value, mask_char, visible_chars)
        elif isinstance(value, list):
            result[key] = [
                mask_sensitive(item, mask_char, visible_chars)
                if isinstance(item, dict)
                else item
                for item in value
            ]
        else:
            result[key] = value

    return result


def _is_sensitive_key(key: str) -> bool:
    """Check if a key name matches sensitive patterns."""
    return any(pattern.search(key) for pattern in SENSITIVE_PATTERNS)


def _mask_value(value: Any, mask_char: str, visible_chars: int) -> str:
    """Mask a sensitive value, keeping some characters visible."""
    if value is None:
        return "[REDACTED]"

    str_value = str(value)
    if len(str_value) <= visible_chars:
        return mask_char * len(str_value)

    masked_len = len(str_value) - visible_chars
    return mask_char * masked_len + str_value[-visible_chars:]


# =============================================================================
# Password & Token Utilities
# =============================================================================


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hashed password."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def create_access_token(
    data: dict[str, Any],
    expires_delta: timedelta | None = None,
) -> str:
    """
    Create a JWT access token.

    Args:
        data: Payload data to encode in the token
        expires_delta: Optional custom expiration time

    Returns:
        Encoded JWT token string
    """
    to_encode = data.copy()
    expire = datetime.now(UTC) + (
        expires_delta
        or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "iat": datetime.now(UTC)})
    return jwt.encode(
        to_encode,
        settings.SUPABASE_JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_token(token: str) -> dict[str, Any]:
    """
    Decode and validate a JWT token.

    Args:
        token: JWT token string

    Returns:
        Decoded token payload

    Raises:
        TokenValidationError: If token is invalid or expired
    """
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_aud": False},  # Supabase tokens may not have aud
        )
        return payload
    except jwt.ExpiredSignatureError as e:
        raise TokenValidationError("Token has expired") from e
    except jwt.InvalidTokenError as e:
        raise TokenValidationError(f"Invalid token: {e}") from e


# Alias for backward compatibility
decode_jwt = decode_token


def extract_user_id_from_token(token: str) -> str:
    """
    Extract user ID from a Supabase JWT token.

    Args:
        token: JWT token string

    Returns:
        User ID (sub claim)

    Raises:
        TokenValidationError: If token is invalid or missing sub claim
    """
    payload = decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise TokenValidationError("Token missing 'sub' claim")
    return user_id


def validate_supabase_token(token: str) -> dict[str, Any]:
    """
    Validate a Supabase JWT token and extract claims.

    This function validates tokens issued by Supabase Auth.
    For production, consider using Supabase's auth.getUser() API
    to verify the token is not revoked.

    Args:
        token: JWT token from Supabase Auth

    Returns:
        Token payload with user claims

    Raises:
        TokenValidationError: If validation fails
    """
    payload = decode_token(token)

    # Validate required Supabase claims
    required_claims = ["sub", "aud", "exp"]
    for claim in required_claims:
        if claim not in payload:
            raise TokenValidationError(f"Missing required claim: {claim}")

    return payload


# =============================================================================
# API Key Validation (for service-to-service auth)
# =============================================================================


def validate_api_key(api_key: str) -> bool:
    """
    Validate an API key for service-to-service authentication.

    Args:
        api_key: The API key to validate

    Returns:
        True if valid, False otherwise
    """
    # TODO: Implement proper API key validation against database
    # For now, check against configured service keys
    valid_keys = getattr(settings, "SERVICE_API_KEYS", [])
    if isinstance(valid_keys, str):
        valid_keys = [k.strip() for k in valid_keys.split(",")]
    return api_key in valid_keys


# =============================================================================
# Role-Based Access Control Helpers
# =============================================================================


def check_role(user_role: str, required_roles: list[str]) -> bool:
    """
    Check if user has one of the required roles.

    Args:
        user_role: User's current role
        required_roles: List of roles that grant access

    Returns:
        True if user has access, False otherwise
    """
    return user_role in required_roles


def is_admin(user: dict[str, Any]) -> bool:
    """Check if user has admin role."""
    role = user.get("role", user.get("app_metadata", {}).get("role", "user"))
    return role in ("admin", "super_admin")


def is_org_admin(user: dict[str, Any], org_id: str) -> bool:
    """Check if user is admin of specific organization."""
    if is_admin(user):
        return True

    user_org_id = user.get("org_id", user.get("app_metadata", {}).get("org_id"))
    user_role = user.get("role", user.get("app_metadata", {}).get("role", "user"))

    return user_org_id == org_id and user_role in ("admin", "org_admin")
