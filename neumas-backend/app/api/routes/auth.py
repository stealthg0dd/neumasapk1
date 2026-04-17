"""
Authentication routes.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import UserInfo, get_current_user, get_token
from app.core.logging import get_logger
from app.core.security import TokenValidationError, decode_jwt
from app.db.supabase_client import get_auth_client
from app.schemas.auth import (
    GoogleCompleteRequest,
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


@router.post(
    "/google/complete",
    response_model=LoginResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Complete Google OAuth profile",
    description=(
        "Called after a first-time Google sign-in to create the Neumas "
        "org/property/user records.  The caller must supply a valid Supabase "
        "Bearer token (obtained from supabase.auth.exchangeCodeForSession). "
        "Idempotent — safe to call if the user already has a DB record."
    ),
)
async def complete_google_signup(
    request: GoogleCompleteRequest,
    token: Annotated[str, Depends(get_token)],
) -> LoginResponse:
    """
    Provision Neumas DB records for a Google OAuth user.

    The token is validated against Supabase Auth (local decode first,
    then Supabase API fallback) without requiring the user to be in the
    local `users` table — which is the whole point of this endpoint.
    """
    # -- Validate token and extract auth_id without requiring a DB user -------
    auth_id: str | None = None
    email: str = ""
    try:
        payload = decode_jwt(token)
        auth_id = payload.get("sub")
        email = payload.get("email", "")
    except TokenValidationError:
        logger.debug("Local JWT decode failed for google/complete — trying Supabase API")

    if not auth_id:
        auth_client = await get_auth_client()
        if not auth_client:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Auth service unavailable",
            )
        user_data = await auth_client.get_user(token)
        if not user_data:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        auth_id = str(user_data.get("id", ""))
        email = str(user_data.get("email", ""))

    if not auth_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not extract identity from token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        profile = await auth_service.complete_google_signup(
            auth_id=auth_id,
            email=email,
            org_name=request.org_name,
            property_name=request.property_name,
            role=request.role,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error("Google complete-signup failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to complete account setup. Please try again.",
        )

    # The frontend already holds the Supabase session — return a LoginResponse
    # with a placeholder token so the shape matches what saveAuth() expects.
    # The frontend uses the token it already has, not the one returned here.
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
