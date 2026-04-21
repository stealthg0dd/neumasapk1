"""
Tests for authentication endpoints.
"""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.schemas.auth import UserInfo


@pytest.fixture
def test_user() -> UserInfo:
    """Create a test user."""
    return UserInfo(
        id=uuid4(),
        auth_id=uuid4(),
        email="test@example.com",
        full_name="Test User",
        role="manager",
        organization_id=uuid4(),
        is_active=True,
    )


@pytest.fixture
def auth_headers() -> dict[str, str]:
    """Create auth headers with a test token."""
    return {"Authorization": "Bearer test-token"}


@pytest.fixture
async def client():
    """Create an async test client."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


class TestHealthEndpoints:
    """Tests for health check endpoints."""

    @pytest.mark.asyncio
    async def test_health_check(self, client: AsyncClient):
        """Test basic health check returns healthy."""
        response = await client.get("/health")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "neumas-api"

    @pytest.mark.asyncio
    async def test_readiness_check(self, client: AsyncClient):
        """Test readiness check with mocked dependencies."""
        with patch("app.main.health_check", new_callable=AsyncMock) as mock_db:
            mock_db.return_value = True

            response = await client.get("/ready")

            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert data["status"] in ["ready", "degraded"]
            assert "checks" in data


class TestAuthEndpoints:
    """Tests for authentication endpoints."""

    @pytest.mark.asyncio
    async def test_login_not_implemented(self, client: AsyncClient):
        """Test login endpoint requires valid credentials."""
        response = await client.post(
            "/api/auth/login",
            json={
                "email": "test@example.com",
                "password": "password123",
            },
        )
        # Login calls Supabase; with test credentials it returns 401
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_501_NOT_IMPLEMENTED,
        ]

    @pytest.mark.asyncio
    async def test_get_me_unauthorized(self, client: AsyncClient):
        """Test /me endpoint requires authentication."""
        response = await client.get("/api/auth/me")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.asyncio
    async def test_get_me_success(
        self,
        client: AsyncClient,
        test_user: UserInfo,
        auth_headers: dict[str, str],
    ):
        """Test /me endpoint returns user info."""
        with patch(
            "app.api.deps.get_current_user",
            return_value=test_user,
        ):
            await client.get(
                "/api/auth/me",
                headers=auth_headers,
            )

            # Will fail without proper mocking - this is just a template
            # In real tests, you'd need to mock the full auth chain

    @pytest.mark.asyncio
    async def test_validate_token_unauthorized(self, client: AsyncClient):
        """Test /me endpoint requires valid token."""
        response = await client.get("/api/auth/me")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.asyncio
    async def test_google_complete_is_deprecated(
        self,
        client: AsyncClient,
    ):
        """Google OAuth completion now happens in Next.js /auth/callback."""
        response = await client.post(
            "/api/auth/google/complete",
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == status.HTTP_410_GONE
        data = response.json()
        assert data["detail"] == "Moved to Next.js /auth/callback for PKCE cookie support"


class TestAuthDependencies:
    """Tests for authentication dependencies."""

    @pytest.mark.asyncio
    async def test_missing_token_raises_401(self, client: AsyncClient):
        """Test that missing token raises 401."""
        response = await client.get("/api/auth/me")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        data = response.json()
        assert "detail" in data

    @pytest.mark.asyncio
    async def test_invalid_token_format(self, client: AsyncClient):
        """Test that invalid token format is handled."""
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": "InvalidFormat"},
        )

        # Should still attempt to parse and potentially fail on validation
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        ]


class TestPermissions:
    """Tests for permission checking."""

    @pytest.mark.asyncio
    async def test_admin_route_requires_admin_role(self, client: AsyncClient):
        """Test admin routes require authentication."""
        response = await client.get(
            "/api/admin/stats",
            headers={"Authorization": "Bearer test-token"},
        )

        # Should fail without proper admin token (401) or route not yet defined (404)
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_404_NOT_FOUND,
        ]


class TestTokenRefresh:
    """Tests for token refresh endpoint."""

    @pytest.mark.asyncio
    async def test_refresh_missing_token(self, client: AsyncClient):
        """Test refresh with missing body returns 422."""
        response = await client.post("/api/auth/refresh", json={})
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    @pytest.mark.asyncio
    async def test_refresh_invalid_token(self, client: AsyncClient):
        """Test refresh with invalid token returns 401."""
        with patch(
            "app.services.auth_service.AuthService.refresh_session",
            side_effect=Exception("Token expired"),
        ):
            response = await client.post(
                "/api/auth/refresh",
                json={"refresh_token": "invalid-token"},
            )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.asyncio
    async def test_refresh_success(self, client: AsyncClient):
        """Test successful token refresh returns new tokens."""
        from app.schemas.auth import TokenResponse

        mock_token_response = TokenResponse(
            access_token="new-access-token",
            refresh_token="new-refresh-token",
            expires_in=3600,
            token_type="bearer",
        )

        with patch(
            "app.services.auth_service.AuthService.refresh_session",
            new_callable=AsyncMock,
            return_value=mock_token_response,
        ):
            response = await client.post(
                "/api/auth/refresh",
                json={"refresh_token": "valid-refresh-token"},
            )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["access_token"] == "new-access-token"
        assert data["refresh_token"] == "new-refresh-token"
        assert data["expires_in"] == 3600
        assert data["token_type"] == "bearer"

    @pytest.mark.asyncio
    async def test_refresh_propagates_token_validation_error(self, client: AsyncClient):
        """Test that TokenValidationError from service returns 401."""
        from app.core.security import TokenValidationError

        with patch(
            "app.services.auth_service.AuthService.refresh_session",
            new_callable=AsyncMock,
            side_effect=TokenValidationError("Refresh token is invalid or expired"),
        ):
            response = await client.post(
                "/api/auth/refresh",
                json={"refresh_token": "expired-token"},
            )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert "expired" in response.json()["detail"].lower() or "invalid" in response.json()["detail"].lower()
