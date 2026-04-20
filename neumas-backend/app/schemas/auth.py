"""
Authentication schemas.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class TokenPayload(BaseModel):
    """JWT token payload."""

    sub: str = Field(..., description="Subject (user ID)")
    exp: datetime = Field(..., description="Expiration time")
    iat: datetime | None = Field(None, description="Issued at time")
    aud: str | None = Field(None, description="Audience")
    role: str | None = Field(None, description="User role from Supabase")


class TokenResponse(BaseModel):
    """Token response for authentication."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(..., description="Token expiry in seconds")
    refresh_token: str | None = None


class LoginRequest(BaseModel):
    """Login request body."""

    email: EmailStr
    password: str = Field(..., min_length=8)


class RefreshTokenRequest(BaseModel):
    """Refresh token request body."""

    refresh_token: str


class UserInfo(BaseModel):
    """Current user info from auth."""

    id: UUID
    auth_id: UUID
    email: EmailStr
    full_name: str | None = None
    role: str
    organization_id: UUID
    permissions: dict[str, bool] = Field(default_factory=dict)
    is_active: bool = True


class CurrentUserContext(BaseModel):
    """
    Full context for the current authenticated user.
    Used by dependency injection.
    """

    user: UserInfo
    organization_id: UUID
    property_id: UUID | None = None
    permissions: list[str] = Field(default_factory=list)

    @property
    def is_admin(self) -> bool:
        return self.user.role == "admin"

    @property
    def is_manager(self) -> bool:
        return self.user.role in ("admin", "manager")


class PasswordChangeRequest(BaseModel):
    """Password change request."""

    current_password: str = Field(..., min_length=8)
    new_password: str = Field(..., min_length=8)


class PasswordResetRequest(BaseModel):
    """Password reset request."""

    email: EmailStr


class PasswordResetConfirm(BaseModel):
    """Password reset confirmation."""

    token: str
    new_password: str = Field(..., min_length=8)


class SignupRequest(BaseModel):
    """User signup request (for new organizations)."""

    email: EmailStr
    password: str = Field(..., min_length=8)
    org_name: str = Field(..., min_length=2, max_length=255, description="Organization name")
    property_name: str = Field(..., min_length=2, max_length=255, description="Property name")
    role: str = Field(default="admin", description="Role (admin for creators)")


class SignupResponse(BaseModel):
    """Signup response with JWT and profile."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: str | None = None
    profile: "ProfileResponse"


class ProfileResponse(BaseModel):
    """User profile info."""

    user_id: UUID
    email: EmailStr
    full_name: str | None = None
    org_id: UUID
    org_name: str
    property_id: UUID
    property_name: str
    role: str


class LoginResponse(BaseModel):
    """Login response with JWT and profile."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: str | None = None
    profile: ProfileResponse


class GoogleCompleteRequest(BaseModel):
    """Complete profile for a Google OAuth user.

    org_name and property_name are optional so that the first probe call from
    /auth/callback (empty body) passes Pydantic validation.  The route handler
    raises HTTP 422 explicitly when they are absent and the user is new.
    """

    org_name: str | None = Field(None, min_length=2, max_length=255, description="Organization name")
    property_name: str | None = Field(None, min_length=2, max_length=255, description="Property name")
    role: str = Field(default="admin", description="Role for the new account owner")


class InviteUserRequest(BaseModel):
    """Invite user to organization."""

    email: EmailStr
    role: str = Field(default="member")
    full_name: str | None = None


class AcceptInviteRequest(BaseModel):
    """Accept organization invite."""

    token: str
    password: str = Field(..., min_length=8)
    full_name: str | None = None
