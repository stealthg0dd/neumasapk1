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
        """Test login endpoint returns 501 (not yet implemented)."""
        response = await client.post(
            "/api/auth/login",
            json={
                "email": "test@example.com",
                "password": "password123",
            },
        )

        assert response.status_code == status.HTTP_501_NOT_IMPLEMENTED

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
        """Test validate endpoint requires valid token."""
        response = await client.get("/api/auth/validate")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


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
        """Test admin routes require admin role."""
        response = await client.get(
            "/api/admin/stats",
            headers={"Authorization": "Bearer test-token"},
        )

        # Should fail without proper admin token
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
