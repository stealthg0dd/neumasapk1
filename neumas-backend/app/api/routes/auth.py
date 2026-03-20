"""
Authentication routes.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import TenantContext, UserInfo, get_current_user, get_tenant_context
from app.core.logging import get_logger
from app.schemas.auth import (
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
    """Refresh JWT access token using refresh token."""
    # Note: Refresh token handling depends on Supabase Auth
    # For now, return a placeholder error
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Refresh token endpoint not yet implemented. Use /login for new tokens.",
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
    return ProfileResponse(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        org_id=user.organization_id,
        org_name=user.organization_name or "",
        property_id=user.default_property_id or user.organization_id,  # Fallback
        property_name="",  # Would need property lookup
        role=user.role,
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
