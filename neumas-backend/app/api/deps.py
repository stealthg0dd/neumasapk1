"""
API dependencies for dependency injection.

Multi-tenant access helpers compatible with Row Level Security (RLS):
- TenantContext: Contains user_id, org_id, property_id, role for tenant isolation
- get_current_user(): Validates JWT and resolves user from database
- get_tenant_context(): Returns TenantContext for use in repositories
"""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from app.core.logging import get_logger
from app.core.security import TokenValidationError, decode_jwt
from app.db.supabase_client import (
    get_async_supabase_admin,
    get_async_supabase_for_user,
    get_auth_client,
)

logger = get_logger(__name__)

# Security scheme
security = HTTPBearer(auto_error=False)


# =============================================================================
# Tenant Context Model
# =============================================================================


class TenantContext(BaseModel):
    """
    Tenant context for multi-tenant access control.

    This object is passed to all repository methods to ensure proper
    data isolation aligned with Supabase Row Level Security (RLS) policies.

    All repository queries must filter by org_id and/or property_id
    to guarantee tenant isolation even without RLS (defense in depth).
    """

    user_id: UUID = Field(..., description="Current authenticated user's ID")
    org_id: UUID = Field(..., description="User's organization ID")
    property_id: UUID | None = Field(
        None,
        description="Current property context (if applicable)",
    )
    role: Literal["resident", "admin", "staff"] = Field(
        ...,
        description="User's role within the organization",
    )

    # JWT token for user-scoped Supabase client
    jwt: str = Field(..., description="User's JWT for RLS-enabled queries", exclude=True)

    model_config = {"arbitrary_types_allowed": True}

    def __repr__(self) -> str:
        return (
            f"TenantContext(user_id={self.user_id}, org_id={self.org_id}, "
            f"property_id={self.property_id}, role={self.role})"
        )

    @property
    def is_admin(self) -> bool:
        """Check if user has admin role."""
        return self.role == "admin"

    @property
    def is_staff(self) -> bool:
        """Check if user has staff or admin role."""
        return self.role in ("admin", "staff")

    async def get_supabase_client(self):
        """
        Get a Supabase client scoped to this user's JWT.

        The client respects RLS policies - queries will automatically
        filter based on user's org_id/property_id claims.
        """
        return await get_async_supabase_for_user(self.jwt)


# =============================================================================
# User Info Model
# =============================================================================


class UserInfo(BaseModel):
    """Current user info resolved from database."""

    id: UUID
    auth_id: UUID
    email: str
    full_name: str | None = None
    role: Literal["resident", "admin", "staff"]
    organization_id: UUID
    organization_name: str | None = None
    default_property_id: UUID | None = None
    permissions: dict[str, bool] = Field(default_factory=dict)
    is_active: bool = True


# =============================================================================
# Token Extraction
# =============================================================================


async def get_token(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(security),
    ],
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    """
    Extract JWT token from Authorization header.

    Supports both:
    - HTTPBearer: Authorization: Bearer <token>
    - Direct header: Authorization: <token>
    """
    if credentials:
        return credentials.credentials

    if authorization:
        if authorization.startswith("Bearer "):
            return authorization[7:]
        return authorization

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing authentication token",
        headers={"WWW-Authenticate": "Bearer"},
    )


# =============================================================================
# User Resolution
# =============================================================================


async def get_current_user(
    token: Annotated[str, Depends(get_token)],
) -> UserInfo:
    """
    Get current authenticated user from token.

    Process:
    1. Decode JWT locally (fast path).
       If that fails (wrong secret, alg mismatch), fall back to
       Supabase auth.get_user() -- handles real Supabase-issued tokens
       even when SUPABASE_JWT_SECRET is not configured locally.
    2. Query users table joined with organizations.
    3. Return UserInfo with org context.

    Raises:
        HTTPException 401: If token is invalid
        HTTPException 403: If user is inactive or not found
    """
    try:
        # -- Fast path: local JWT decode ---------------------------------------
        auth_id: str | None = None
        try:
            payload = decode_jwt(token)
            auth_id = payload.get("sub")
        except Exception:
            # -- Fallback: verify via Supabase API -----------------------------
            # Catches TokenValidationError (wrong secret, expired) and any
            # other PyJWT / unexpected exception so misconfig never silently
            # blocks auth. Covers: missing SUPABASE_JWT_SECRET, InvalidKeyError
            # (null/wrong-type secret), alg mismatch, RS256 tokens.
            logger.debug("Local JWT decode failed -- falling back to Supabase API")
            auth_client = await get_auth_client()
            if auth_client:
                user_data_from_auth = await auth_client.get_user(token)
                if user_data_from_auth:
                    auth_id = str(user_data_from_auth["id"])
                else:
                    logger.warning("Supabase Auth rejected token")

        if not auth_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing subject claim",
                headers={"WWW-Authenticate": "Bearer"},
            )

        logger.debug("JWT resolved", auth_id=auth_id)

        # Use admin client for the user-lookup step.
        # The JWT has already been verified above; using the user-scoped client
        # here can silently fail when RLS SELECT policies are not yet configured
        # for the users table, causing every authenticated request to 401.
        client = await get_async_supabase_admin()
        if not client:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database unavailable",
            )

        # Flat select("*") -- avoids PostgREST FK join syntax and unknown columns.
        # auth_service.login uses the same pattern successfully.
        response = await (
            client.table("users")
            .select("*")
            .eq("auth_id", auth_id)
            .limit(1)
            .execute()
        )

        rows = response.data or []
        if not rows:
            logger.warning("User not found for auth_id", auth_id=auth_id)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User not found or access denied",
            )

        user_data = rows[0]

        if not user_data.get("is_active", False):
            logger.warning("Inactive user attempted access", user_id=user_data.get("id"))
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is deactivated",
            )

        db_role = user_data.get("role", "resident")
        role = _normalize_role(db_role)

        # Column may be org_id or organization_id depending on schema version
        raw_org_id = user_data.get("org_id") or user_data.get("organization_id")
        if not raw_org_id:
            logger.error("User record missing org_id", auth_id=auth_id)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account not properly configured",
            )

        raw_default_prop = (
            user_data.get("default_property_id")
            or user_data.get("default_property")
        )
        return UserInfo(
            id=UUID(user_data["id"]),
            auth_id=UUID(user_data["auth_id"]),
            email=user_data["email"],
            full_name=user_data.get("full_name"),
            role=role,
            organization_id=UUID(raw_org_id),
            organization_name=None,
            default_property_id=UUID(raw_default_prop) if raw_default_prop else None,
            permissions=user_data.get("permissions") or {},
            is_active=user_data.get("is_active", True),
        )

    except HTTPException:
        raise
    except TokenValidationError as e:
        logger.warning("Token validation failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        logger.error("Failed to get current user", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _normalize_role(db_role: str) -> Literal["resident", "admin", "staff"]:
    """Normalize database role to expected values."""
    role_mapping = {
        "admin": "admin",
        "administrator": "admin",
        "owner": "admin",
        "manager": "staff",
        "staff": "staff",
        "employee": "staff",
        "resident": "resident",
        "user": "resident",
        "member": "resident",
    }
    return role_mapping.get(db_role.lower(), "resident")


# =============================================================================
# Tenant Context Resolution
# =============================================================================


async def get_tenant_context(
    token: Annotated[str, Depends(get_token)],
    user: Annotated[UserInfo, Depends(get_current_user)],
) -> TenantContext:
    """
    Get tenant context for the current request.

    The property_id is automatically resolved from the database:
    1. users.default_property_id column
    2. tenants.property_id table (fallback, resolved in get_current_user)

    No ?property_id= query parameter is accepted — the backend resolves
    it entirely from the authenticated user's database record.
    """
    try:
        admin_client = await get_async_supabase_admin()
    except Exception as e:
        logger.error("Failed to get admin Supabase client", error=str(e))
        admin_client = None

    # Use property_id from user's database record (resolved in get_current_user)
    effective_property_id = user.default_property_id

    if effective_property_id:
        # Validate the stored property still belongs to the user's org and is
        # active. Security is maintained by filtering on organization_id so a
        # user can only reach their own org's properties regardless of RLS state.
        if admin_client:
            try:
                response = await (
                    admin_client.table("properties")
                    .select("id, organization_id")
                    .eq("id", str(effective_property_id))
                    .eq("organization_id", str(user.organization_id))
                    .eq("is_active", True)
                    .execute()
                )

                if not response.data:
                    logger.warning(
                        "Stored property not found or inactive — attempting self-heal",
                        user_id=str(user.id),
                        property_id=str(effective_property_id),
                    )
                    effective_property_id = None  # fall through to self-heal below
            except Exception as e:
                logger.warning(
                    "Property validation query failed — proceeding without validation",
                    user_id=str(user.id),
                    error=str(e),
                )
                # Keep effective_property_id as-is; don't block login on DB error

    # Self-heal: user exists and has an org but no valid default_property_id.
    # Caused by: (a) email/password signup before the default_property_id fix,
    # (b) property deactivated after account creation. Query the org's first
    # active property and backfill the users table so subsequent requests work.
    if not effective_property_id and admin_client:
        try:
            prop_response = await (
                admin_client.table("properties")
                .select("id")
                .eq("organization_id", str(user.organization_id))
                .eq("is_active", True)
                .order("created_at")
                .limit(1)
                .execute()
            )
            if prop_response.data:
                healed_id = prop_response.data[0]["id"]
                effective_property_id = UUID(healed_id)
                # Persist so next request skips this lookup
                try:
                    await (
                        admin_client.table("users")
                        .update({"default_property_id": healed_id})
                        .eq("id", str(user.id))
                        .execute()
                    )
                except Exception as upd_err:
                    logger.warning("Self-heal DB backfill failed (non-fatal)", error=str(upd_err))
                logger.info(
                    "Self-healed default_property_id",
                    user_id=str(user.id),
                    property_id=healed_id,
                )
        except Exception as e:
            logger.warning(
                "Self-heal property lookup failed — proceeding without property",
                user_id=str(user.id),
                error=str(e),
            )

    return TenantContext(
        user_id=user.id,
        org_id=user.organization_id,
        property_id=effective_property_id,
        role=user.role,
        jwt=token,
    )


# =============================================================================
# Specialized Dependencies
# =============================================================================


def require_property():
    """
    Dependency that requires a property context.

    Use for endpoints that require a property_id to be set.
    """
    async def _require_property(
        tenant: Annotated[TenantContext, Depends(get_tenant_context)],
    ) -> TenantContext:
        if not tenant.property_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="property_id is required for this operation",
            )
        return tenant

    return Depends(_require_property)


def require_role(*roles: str):
    """
    Dependency factory for role-based access.

    Usage:
        @router.get("/admin", dependencies=[Depends(require_role("admin"))])
    """
    async def role_checker(
        tenant: Annotated[TenantContext, Depends(get_tenant_context)],
    ) -> TenantContext:
        if tenant.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required role: {', '.join(roles)}",
            )
        return tenant

    return role_checker


def require_staff():
    """Require staff or admin role."""
    return require_role("admin", "staff")


def require_admin():
    """Require admin role."""
    return require_role("admin")


# =============================================================================
# Common Dependency Types
# =============================================================================


# Current user (just user info, no tenant context)
CurrentUser = Annotated[UserInfo, Depends(get_current_user)]

# Full tenant context (for repository operations)
Tenant = Annotated[TenantContext, Depends(get_tenant_context)]

# Tenant with required property
TenantWithProperty = Annotated[TenantContext, require_property()]

# Admin-only tenant context
AdminTenant = Annotated[TenantContext, Depends(require_role("admin"))]

# Staff-only tenant context
StaffTenant = Annotated[TenantContext, Depends(require_role("admin", "staff"))]


# =============================================================================
# Pagination Helper
# =============================================================================


class Pagination(BaseModel):
    """Pagination parameters."""
    page: int = Field(1, ge=1, description="Page number")
    page_size: int = Field(20, ge=1, le=100, description="Items per page")

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


async def get_pagination(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
) -> Pagination:
    """Get pagination parameters from query."""
    return Pagination(page=page, page_size=page_size)


PaginationDep = Annotated[Pagination, Depends(get_pagination)]
