"""
Authentication service for user authentication and authorization.
"""

import re
import secrets
from typing import Any
from uuid import UUID

from postgrest.exceptions import APIError as PostgRESTAPIError

from app.core.config import settings
from app.core.logging import get_logger
from app.core.security import (
    TokenValidationError,
    decode_token,
)
from app.db.supabase_client import get_async_supabase_admin, get_auth_client
from app.schemas.auth import (
    CurrentUserContext,
    LoginResponse,
    ProfileResponse,
    SignupRequest,
    SignupResponse,
    UserInfo,
)
from supabase import create_async_client

logger = get_logger(__name__)


def generate_slug(name: str) -> str:
    """
    Generate a URL-safe slug from a name.

    Converts to lowercase, replaces spaces/special chars with hyphens,
    and appends a random suffix for uniqueness.

    Example: 'Test Lab' -> 'test-lab-a1b2'
    """
    # Convert to lowercase and replace spaces with hyphens
    slug = name.lower().strip()
    # Replace any non-alphanumeric characters (except hyphens) with hyphens
    slug = re.sub(r'[^a-z0-9-]', '-', slug)
    # Collapse multiple hyphens
    slug = re.sub(r'-+', '-', slug)
    # Strip leading/trailing hyphens
    slug = slug.strip('-')
    # Append random suffix for uniqueness (4 hex chars)
    suffix = secrets.token_hex(2)
    return f"{slug}-{suffix}"


def _handle_pgrst_error(err: Exception, context: str = "") -> None:
    """
    Inspect a PostgREST APIError and emit an actionable operator log when a
    schema-cache miss (PGRST204) is detected.

    If PGRST204 is found the caller should still re-raise the original error
    after calling this function.
    """
    code = getattr(err, "code", None)
    # postgrest-py attaches the JSON body as .json() on some versions;
    # fall back to string-scanning the message as a safety net.
    if code is None:
        code = "PGRST204" if "PGRST204" in str(err) else None

    if code == "PGRST204":
        logger.error(
            "PostgREST schema cache miss (PGRST204) -- column or relation not found. "
            "ACTION REQUIRED: open the Supabase SQL Editor and run: "
            "NOTIFY pgrst, 'reload schema';",
            context=context,
            error=str(err),
        )


class AuthService:
    """Service for authentication and authorization."""

    async def validate_token(self, token: str) -> dict[str, Any]:
        """
        Validate JWT token and return payload.

        Args:
            token: JWT access token

        Returns:
            Token payload

        Raises:
            TokenValidationError: If token is invalid
        """
        # First try local JWT validation
        try:
            payload = decode_token(token)
            return payload
        except TokenValidationError:
            # Fall back to Supabase auth verification
            auth_client = await get_auth_client()
            user_data = await auth_client.get_user(token)
            if not user_data:
                raise TokenValidationError("Token validation failed")
            return {"sub": user_data["id"], **user_data}

    async def get_user_from_token(self, token: str) -> UserInfo:
        """
        Get user info from JWT token.

        Args:
            token: JWT access token

        Returns:
            UserInfo with user details

        Raises:
            TokenValidationError: If token invalid or user not found
        """
        # Extract auth_id from token
        payload = await self.validate_token(token)
        auth_id_str = payload.get("sub")
        if not auth_id_str:
            raise TokenValidationError("Token missing subject claim")

        auth_id = UUID(auth_id_str)

        # Get user from database (direct admin query, no TenantContext needed)
        admin_client = await get_async_supabase_admin()
        user_response = await (
            admin_client.table("users")
            .select("*")
            .eq("auth_id", str(auth_id))
            .single()
            .execute()
        )

        user = user_response.data
        if not user:
            logger.warning("User not found for auth_id", auth_id=str(auth_id))
            raise TokenValidationError("User not found")

        if not user.get("is_active"):
            raise TokenValidationError("User is deactivated")

        return UserInfo(
            id=UUID(user["id"]),
            auth_id=auth_id,
            email=user["email"],
            full_name=user.get("full_name"),
            role=user["role"],
            organization_id=UUID(user["org_id"]),
            permissions=user.get("permissions", {}) or {},
            is_active=user["is_active"],
        )

    async def get_current_user_context(
        self,
        token: str,
        property_id: UUID | None = None,
    ) -> CurrentUserContext:
        """
        Get full user context for request.

        Args:
            token: JWT access token
            property_id: Optional property ID from request

        Returns:
            CurrentUserContext with user, org, and property
        """
        user = await self.get_user_from_token(token)

        # Build permissions list
        permissions = []
        if user.role == "admin":
            permissions = ["*"]  # Admin has all permissions
        else:
            permissions = [k for k, v in user.permissions.items() if v]

        return CurrentUserContext(
            user=user,
            organization_id=user.organization_id,
            property_id=property_id,
            permissions=permissions,
        )

    async def verify_organization_access(
        self,
        user: UserInfo,
        org_id: UUID,
    ) -> bool:
        """
        Verify user has access to an organization.

        Args:
            user: Current user
            org_id: Organization ID to check

        Returns:
            True if user has access
        """
        # Users can only access their own organization
        # unless they're a system admin (future feature)
        return user.organization_id == org_id

    async def verify_property_access(
        self,
        user: UserInfo,
        property_id: UUID,
    ) -> bool:
        """
        Verify user has access to a property.

        Args:
            user: Current user
            property_id: Property ID to check

        Returns:
            True if user has access
        """
        # Direct admin query to check property belongs to user's org
        admin_client = await get_async_supabase_admin()
        response = await (
            admin_client.table("properties")
            .select("id")
            .eq("id", str(property_id))
            .eq("org_id", str(user.organization_id))
            .eq("is_active", True)
            .execute()
        )
        return len(response.data) > 0

    async def check_permission(
        self,
        user: UserInfo,
        permission: str,
    ) -> bool:
        """
        Check if user has a specific permission.

        Args:
            user: Current user
            permission: Permission to check

        Returns:
            True if user has permission
        """
        # Admin role has all permissions
        if user.role == "admin":
            return True

        # Manager role has most permissions
        if user.role == "manager":
            manager_permissions = [
                "inventory:read",
                "inventory:write",
                "scans:read",
                "scans:write",
                "predictions:read",
                "shopping:read",
                "shopping:write",
                "users:read",
            ]
            if permission in manager_permissions:
                return True

        # Check explicit permissions
        return user.permissions.get(permission, False)

    async def signup(self, request: SignupRequest) -> SignupResponse:
        """
        Register new user with org and property creation.

        Flow:
        1. Create user in Supabase Auth
        2. Generate unique organization slug
        3. Create organization record
        4. Create property record
        5. Create user record linking everything

        Args:
            request: Signup request with email, password, org_name, property_name, role

        Returns:
            SignupResponse with access_token and profile

        Raises:
            Exception: If signup fails at any step
        """
        # -- Isolated Auth Client Pattern -------------------------------------
        # The _async_admin_client is a singleton initialised once at startup
        # with the service_role key.  Calling sign_in_with_password() on it
        # attaches a user-scoped JWT to the client's internal session, which
        # then gets used for every subsequent .table() call -- bypassing the
        # service-role bypass and triggering recursive RLS policies.
        #
        # Rule: only the singleton admin_client (service_role) touches the DB.
        #       A transient sign_in_client (also service_role key, freshly
        #       constructed and immediately discarded) is used solely to obtain
        #       the session tokens.  It is never reused.
        # ---------------------------------------------------------------------
        admin_client = await get_async_supabase_admin()
        auth_id: UUID | None = None  # tracked for rollback

        try:
            # -- Step 1: Create Auth user --------------------------------------
            # admin.create_user + email_confirm:True bypasses SMTP rate limits
            # and immediately activates the account -- no verification email sent.
            logger.info("Step 1: Creating auth user", email=request.email)
            auth_user_response = await admin_client.auth.admin.create_user({
                "email": request.email,
                "password": request.password,
                "email_confirm": True,
            })
            if not auth_user_response.user:
                raise ValueError("Failed to create auth user -- no user returned")

            auth_id = auth_user_response.user.id
            logger.info("Auth user created", auth_id=str(auth_id), email=request.email)

            # -- Step 2: Obtain session via transient client -------------------
            # Create a throw-away AsyncClient with the service_role key.
            # sign_in_with_password mutates the client's internal session, so
            # we MUST NOT reuse it for any table() operations afterwards.
            sign_in_client = await create_async_client(
                settings.SUPABASE_URL,
                settings.SUPABASE_SERVICE_ROLE_KEY,
            )
            login_response = await sign_in_client.auth.sign_in_with_password({
                "email": request.email,
                "password": request.password,
            })
            # sign_in_client is intentionally not stored -- it is discarded here.
            del sign_in_client

            session = login_response.session
            access_token: str = session.access_token if session else ""
            expires_in: int = session.expires_in if session else 3600
            refresh_token: str | None = session.refresh_token if session else None
            logger.info("Session obtained", has_token=bool(access_token))

            # -- Step 3: Generate unique org slug -----------------------------
            org_slug = generate_slug(request.org_name)
            logger.info("Generated slug", slug=org_slug, org_name=request.org_name)

            # -- Step 4: Insert organization (service_role, bypasses RLS) -----
            logger.info("Step 4: Creating organization", name=request.org_name, slug=org_slug)
            try:
                org_response = await admin_client.table("organizations").insert({
                    "name": request.org_name,
                    "slug": org_slug,
                }).execute()
            except PostgRESTAPIError as exc:
                _handle_pgrst_error(exc, context="organizations.insert")
                raise

            if not org_response.data:
                raise ValueError(f"Failed to create organization: {org_response}")

            org_id = UUID(org_response.data[0]["id"])
            logger.info("Organization created", org_id=str(org_id), slug=org_slug)

            # -- Step 5: Insert property (service_role, bypasses RLS) ---------
            logger.info("Step 5: Creating property", name=request.property_name, org_id=str(org_id))
            try:
                prop_response = await admin_client.table("properties").insert({
                    "org_id": str(org_id),
                    "name": request.property_name,
                    "type": "hotel",
                }).execute()
            except PostgRESTAPIError as exc:
                _handle_pgrst_error(exc, context="properties.insert")
                raise

            if not prop_response.data:
                raise ValueError(f"Failed to create property: {prop_response}")

            property_id = UUID(prop_response.data[0]["id"])
            logger.info("Property created", property_id=str(property_id))

            # -- Step 6: Insert user record (service_role, bypasses RLS) ------
            # auth_id links this profile to the Supabase Auth identity.
            # org_id links to the organisation created above.
            logger.info("Step 6: Creating user record", auth_id=str(auth_id), org_id=str(org_id))
            try:
                user_response = await admin_client.table("users").insert({
                    "auth_id": str(auth_id),
                    "email": request.email.lower(),
                    "org_id": str(org_id),
                    "role": request.role,
                    "is_active": True,
                }).execute()
            except PostgRESTAPIError as exc:
                _handle_pgrst_error(exc, context="users.insert")
                raise

            if not user_response.data:
                raise ValueError(f"Failed to create user record: {user_response}")

            user_id = UUID(user_response.data[0]["id"])
            logger.info("User record created", user_id=str(user_id), email=request.email)

        except Exception:
            # -- Rollback: remove the Supabase Auth user if it was created -----
            # This keeps auth state consistent with the DB on partial failures.
            if auth_id is not None:
                try:
                    await admin_client.auth.admin.delete_user(str(auth_id))
                    logger.warning(
                        "Signup rolled back -- auth user deleted",
                        auth_id=str(auth_id),
                        email=request.email,
                    )
                except Exception as rollback_err:
                    logger.error(
                        "Rollback failed -- auth user may be orphaned",
                        auth_id=str(auth_id),
                        rollback_error=str(rollback_err),
                    )
            raise

        # -- Build and return response -----------------------------------------
        profile = ProfileResponse(
            user_id=user_id,
            email=request.email,
            org_id=org_id,
            org_name=request.org_name,
            property_id=property_id,
            property_name=request.property_name,
            role=request.role,
        )

        logger.info("Signup completed successfully", user_id=str(user_id), org_id=str(org_id))

        # Explicitly map all three session fields so the frontend always
        # receives a fully-populated token response.
        return SignupResponse(
            access_token=access_token,
            expires_in=expires_in,
            refresh_token=refresh_token,
            profile=profile,
        )

    async def login(self, email: str, password: str) -> LoginResponse:
        """
        Authenticate user via Supabase Auth.

        Args:
            email: User email
            password: User password

        Returns:
            LoginResponse with JWT and profile

        Raises:
            TokenValidationError: If authentication fails
        """
        admin_client = await get_async_supabase_admin()

        # Authenticate with a fresh isolated client to avoid contaminating the
        # singleton admin client's session (sign_in mutates internal JWT state).
        sign_in_client = await create_async_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
        auth_response = await sign_in_client.auth.sign_in_with_password({
            "email": email,
            "password": password,
        })

        if not auth_response.user or not auth_response.session:
            raise TokenValidationError("Invalid credentials")

        auth_id = str(auth_response.user.id)
        access_token = auth_response.session.access_token

        logger.info("User logged in", auth_id=auth_id, email=email)

        # Get user record from DB (direct query with admin client)
        user_response = await (
            admin_client.table("users")
            .select("*")
            .eq("auth_id", auth_id)
            .single()
            .execute()
        )

        user = user_response.data
        if not user:
            logger.error("User record not found after login", auth_id=auth_id)
            raise TokenValidationError("User account not properly configured")

        # Get organization
        org_response = await (
            admin_client.table("organizations")
            .select("*")
            .eq("id", user["org_id"])
            .single()
            .execute()
        )
        org = org_response.data
        org_name = org.get("name", "") if org else ""

        # Get primary property (first active one)
        props_response = await (
            admin_client.table("properties")
            .select("*")
            .eq("org_id", user["org_id"])
            .eq("is_active", True)
            .order("created_at")
            .limit(1)
            .execute()
        )
        primary_prop = props_response.data[0] if props_response.data else None

        profile = ProfileResponse(
            user_id=UUID(user["id"]),
            email=user["email"],
            org_id=UUID(user["org_id"]),
            org_name=org_name,
            property_id=UUID(primary_prop["id"]) if primary_prop else None,
            property_name=primary_prop.get("name", "") if primary_prop else None,
            role=user["role"],
        )

        return LoginResponse(
            access_token=access_token,
            expires_in=auth_response.session.expires_in if auth_response.session else 3600,
            refresh_token=auth_response.session.refresh_token if auth_response.session else None,
            profile=profile,
        )


# Service instance factory
async def get_auth_service() -> AuthService:
    """Get auth service instance."""
    return AuthService()


# TODO: Add session management
# TODO: Add refresh token rotation
# TODO: Add multi-factor authentication support
# TODO: Add API key authentication for service accounts
