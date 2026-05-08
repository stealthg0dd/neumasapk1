"""Tests for admin dependency enforcement."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.admin.health import router as admin_health_router
from app.api.deps import UserInfo


def _make_user(role: str) -> UserInfo:
    return UserInfo(
        id=uuid4(),
        auth_id=uuid4(),
        email="user@example.com",
        full_name="Test User",
        role=role,  # type: ignore[arg-type]
        organization_id=uuid4(),
        is_active=True,
    )


def _mock_supabase_admin_client(is_admin: bool) -> MagicMock:
    client = MagicMock()
    response = MagicMock()
    response.data = [{"is_admin": is_admin}]

    query = client.table.return_value.select.return_value.eq.return_value
    query.limit.return_value.execute = AsyncMock(return_value=response)
    return client


@pytest.fixture
def admin_test_app() -> FastAPI:
    app = FastAPI()
    app.include_router(admin_health_router)
    return app


@pytest.mark.asyncio
async def test_non_admin_jwt_gets_403(admin_test_app: FastAPI):
    """Non-admin users must be rejected by admin dependency."""
    non_admin_user = _make_user("staff")

    with (
        patch("app.api.deps.get_current_user", new=AsyncMock(return_value=non_admin_user)),
        patch(
            "app.db.supabase_client.get_async_supabase_admin",
            new=AsyncMock(return_value=_mock_supabase_admin_client(is_admin=False)),
        ),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=admin_test_app),
            base_url="http://test",
        ) as client:
            response = await client.get(
                "/api/admin/health/",
                headers={"Authorization": "Bearer test-token"},
            )

    assert response.status_code == 403
    assert response.json()["detail"] == "Admin access required"


@pytest.mark.asyncio
async def test_admin_jwt_gets_200(admin_test_app: FastAPI):
    """Admin users should be allowed on admin endpoints."""
    admin_user = _make_user("admin")

    with patch("app.api.deps.get_current_user", new=AsyncMock(return_value=admin_user)):
        async with AsyncClient(
            transport=ASGITransport(app=admin_test_app),
            base_url="http://test",
        ) as client:
            response = await client.get(
                "/api/admin/health/",
                headers={"Authorization": "Bearer test-token"},
            )

    assert response.status_code == 200
