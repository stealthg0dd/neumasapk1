"""
Authentication routes.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response, status

from app.api.deps import UserInfo, get_current_user, get_token
from app.core.logging import get_logger
from app.core.security import (  # noqa: F401 - decode_jwt kept for test compatibility
    decode_jwt,
    rate_limit,
)
from app.db.supabase_client import get_async_supabase_admin
from app.schemas.auth import (
    DigestPreferencesResponse,
    DigestPreferencesUpdate,
    LoginRequest,
    LoginResponse,
    ProfileResponse,
    RefreshTokenRequest,
    SignupRequest,
    SignupResponse,
    TokenResponse,
)
from app.services.auth_service import AuthService

logger = get_logger(__name__)
router = APIRouter()

# Service instance
auth_service = AuthService()


@router.post(
    "/signup",
    response_model=SignupResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register new user",
    description="Create a new user account with organization and property.",
)
@rate_limit(limit=5, window_seconds=60 * 60)
async def signup(request: SignupRequest, raw_request: Request) -> SignupResponse:
    """
    Register a new user with organization and property.

    Creates:
    - Supabase Auth user
    - Organization record
    - Property record
    - User profile linked to all above
    """
    try:
        return await auth_service.signup(request)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error("Signup failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create account. Please try again.",
        )


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="User login",
    description="Authenticate user and return JWT tokens.",
)
@rate_limit(limit=10, window_seconds=15 * 60)
async def login(request: LoginRequest, raw_request: Request) -> LoginResponse:
    """
    Authenticate user with email and password.

    Returns JWT access token and user profile.
    """
    try:
        return await auth_service.login(request.email, request.password)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
        )
    except Exception as e:
        logger.error("Login failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh token",
    description="Exchange refresh token for new access token.",
)
async def refresh_token(request: RefreshTokenRequest) -> TokenResponse:
    """Refresh JWT access token using a Supabase refresh token.

    Returns a new access_token and rotated refresh_token. The old
    refresh token is invalidated by Supabase after this call.
    """
    try:
        return await auth_service.refresh_session(request.refresh_token)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
        )
    except Exception as e:
        logger.warning("Token refresh failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please log in again.",
        )


@router.get(
    "/me",
    response_model=ProfileResponse,
    summary="Get current user",
    description="Get profile of currently authenticated user.",
)
async def get_me(
    user: Annotated[UserInfo, Depends(get_current_user)],
) -> ProfileResponse:
    """Get current authenticated user's profile."""
    if not user.default_property_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No property configured for this account. Contact your administrator.",
        )

    return ProfileResponse(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        org_id=user.organization_id,
        org_name=user.organization_name or "",
        property_id=user.default_property_id,
        property_name="",
        role=user.role,
    )


@router.get(
    "/preferences/digest",
    response_model=DigestPreferencesResponse,
    summary="Get weekly digest preferences",
)
async def get_digest_preferences(
    user: Annotated[UserInfo, Depends(get_current_user)],
) -> DigestPreferencesResponse:
    client = await get_async_supabase_admin()
    user_row = await (
        client.table("users")
        .select("*")
        .eq("id", str(user.id))
        .single()
        .execute()
    )
    preferences = (user_row.data or {}).get("preferences") or {}
    raw_property_id = (
        (user_row.data or {}).get("default_property_id")
        or (user_row.data or {}).get("default_property")
    )

    property_timezone = "UTC"
    if raw_property_id:
        property_row = await (
            client.table("properties")
            .select("timezone")
            .eq("id", str(raw_property_id))
            .single()
            .execute()
        )
        property_timezone = (property_row.data or {}).get("timezone") or "UTC"

    return DigestPreferencesResponse(
        email_digest_enabled=bool(preferences.get("email_digest_enabled", True)),
        timezone=preferences.get("timezone") or property_timezone,
        property_timezone=property_timezone,
        safety_buffer_days=int(preferences.get("safety_buffer_days", 3) or 3),
        preferred_currency=str(preferences.get("preferred_currency", "USD") or "USD").upper(),
    )


@router.patch(
    "/preferences/digest",
    response_model=DigestPreferencesResponse,
    summary="Update weekly digest preferences",
)
async def update_digest_preferences(
    body: DigestPreferencesUpdate,
    user: Annotated[UserInfo, Depends(get_current_user)],
) -> DigestPreferencesResponse:
    client = await get_async_supabase_admin()
    user_response = await (
        client.table("users")
        .select("*")
        .eq("id", str(user.id))
        .single()
        .execute()
    )
    if not user_response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    current_preferences = user_response.data.get("preferences") or {}
    updated_preferences = {**current_preferences}
    if body.email_digest_enabled is not None:
        updated_preferences["email_digest_enabled"] = body.email_digest_enabled
    if body.timezone is not None:
        updated_preferences["timezone"] = body.timezone
    if body.safety_buffer_days is not None:
        updated_preferences["safety_buffer_days"] = body.safety_buffer_days
    if body.preferred_currency is not None:
        updated_preferences["preferred_currency"] = body.preferred_currency.upper()

    await (
        client.table("users")
        .update({"preferences": updated_preferences})
        .eq("id", str(user.id))
        .execute()
    )

    raw_property_id = (
        user_response.data.get("default_property_id")
        or user_response.data.get("default_property")
    )
    property_timezone = "UTC"
    if raw_property_id:
        property_row = await (
            client.table("properties")
            .select("timezone")
            .eq("id", str(raw_property_id))
            .single()
            .execute()
        )
        property_timezone = (property_row.data or {}).get("timezone") or "UTC"

    return DigestPreferencesResponse(
        email_digest_enabled=bool(updated_preferences.get("email_digest_enabled", True)),
        timezone=updated_preferences.get("timezone") or property_timezone,
        property_timezone=property_timezone,
        safety_buffer_days=int(updated_preferences.get("safety_buffer_days", 3) or 3),
        preferred_currency=str(updated_preferences.get("preferred_currency", "USD") or "USD").upper(),
    )


@router.post(
    "/google/complete",
    response_model=LoginResponse,
    summary="Complete Google OAuth onboarding",
    description="Provision Neumas DB records for a Google OAuth user and return a session.",
)
async def complete_google_oauth(
    response: Response,
    token: Annotated[str, Depends(get_token)],
    raw_payload: Annotated[dict[str, Any] | None, Body()] = None,
) -> LoginResponse:
    """
    Called by the onboarding page after a Google OAuth user provides their
    org and property name.  Verifies the Supabase JWT, provisions backend
    records if they don't exist, and returns a LoginResponse so the frontend
    can immediately save the session and navigate to the dashboard.
    """
    # -- Verify Supabase JWT and extract identity -------------------------------
    auth_id: str | None = None
    email: str = ""
    try:
        auth_client = await get_async_supabase_admin()
        if auth_client:
            auth_response = await auth_client.auth.get_user(token)
            if auth_response.user:
                auth_id = str(auth_response.user.id)
                email = auth_response.user.email or ""
    except Exception:
        pass

    # Fallback: decode JWT locally (works when SUPABASE_JWT_SECRET is set)
    if not auth_id:
        try:
            from app.core.security import decode_jwt
            payload = decode_jwt(token)
            auth_id = payload.get("sub", "")
            email = payload.get("email", "")
        except Exception as exc:
            logger.warning("google/complete: token validation failed", error=str(exc))

    if not auth_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    # -- Provision backend records if needed -----------------------------------
    body = raw_payload or {}
    default_org = email.split("@")[0].replace(".", " ").title() + " Organization" if email else "My Organization"
    org_name = (body.get("org_name") or "").strip() or default_org
    property_name = (body.get("property_name") or "").strip() or "Main Property"
    role: str = body.get("role") or "admin"

    try:
        profile = await auth_service.complete_google_signup(
            auth_id=auth_id,
            email=email,
            org_name=org_name,
            property_name=property_name,
            role=role,
        )
    except Exception as exc:
        logger.error("google/complete: provisioning failed", auth_id=auth_id, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to complete sign-up. Please try again.",
        )

    logger.info("google/complete: user provisioned", auth_id=auth_id, email=email)
    return LoginResponse(
        access_token=token,
        expires_in=3600,
        refresh_token=None,
        profile=profile,
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Logout",
    description="Invalidate current session (client-side token removal).",
)
async def logout(
    user: Annotated[UserInfo, Depends(get_current_user)],
) -> None:
    """
    Logout current user.

    Note: JWT tokens are stateless. This endpoint is for audit logging.
    Client should discard the token.
    """
    logger.info("User logged out", user_id=str(user.id))
    return None
