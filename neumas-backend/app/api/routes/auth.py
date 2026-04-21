"""
Authentication routes.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException, Response, status
from fastapi.responses import JSONResponse

from app.api.deps import UserInfo, get_current_user, get_token
from app.core.logging import get_logger
from app.core.security import decode_jwt  # noqa: F401 - kept for test compatibility
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
async def signup(request: SignupRequest) -> SignupResponse:
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
async def login(request: LoginRequest) -> LoginResponse:
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
    )


@router.post(
    "/google/complete",
    deprecated=True,
    summary="Complete Google OAuth profile",
    description=(
        "Deprecated route. Moved to Next.js /auth/callback for PKCE cookie support."
    ),
)
async def complete_google_signup(
    response: Response,
    token: Annotated[str, Depends(get_token)],
    raw_payload: Annotated[dict[str, Any] | None, Body()] = None,
) -> JSONResponse:
    """
    Deprecated route.

    Moved to Next.js /auth/callback for PKCE cookie support.
    """
    logger.warning(
        "Deprecated Google OAuth completion endpoint called",
        payload_keys=sorted((raw_payload or {}).keys()),
        token_length=len(token),
    )
    return JSONResponse(
        status_code=status.HTTP_410_GONE,
        content={
            "detail": "Moved to Next.js /auth/callback for PKCE cookie support"
        },
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
