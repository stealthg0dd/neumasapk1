"""
Pytest configuration and shared fixtures.
"""

import os
from typing import AsyncIterator
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

# Set test environment before importing app
os.environ["ENV"] = "test"
os.environ["DEBUG"] = "true"
os.environ["SUPABASE_URL"] = "https://test.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "test-key"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-testing-only"

from app.main import app
from app.schemas.auth import UserInfo


@pytest.fixture(scope="session")
def anyio_backend():
    """Use asyncio for async tests."""
    return "asyncio"


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    """Create an async test client."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


@pytest.fixture
def mock_user() -> UserInfo:
    """Create a mock authenticated user."""
    return UserInfo(
        id=uuid4(),
        email="test@example.com",
        full_name="Test User",
        role="manager",
        organization_id=uuid4(),
        is_active=True,
    )


@pytest.fixture
def mock_admin_user() -> UserInfo:
    """Create a mock admin user."""
    return UserInfo(
        id=uuid4(),
        email="admin@example.com",
        full_name="Admin User",
        role="admin",
        organization_id=uuid4(),
        is_active=True,
    )


@pytest.fixture
def auth_headers() -> dict[str, str]:
    """Create authorization headers with a test token."""
    return {"Authorization": "Bearer test-jwt-token"}


@pytest.fixture
def mock_supabase():
    """Mock Supabase client."""
    with patch("app.db.supabase_client.get_supabase_client") as mock:
        client = MagicMock()
        mock.return_value = client
        yield client


@pytest.fixture
def mock_auth_service():
    """Mock authentication service."""
    with patch("app.services.auth_service.get_auth_service") as mock:
        service = AsyncMock()
        mock.return_value = service
        yield service


@pytest.fixture
def mock_inventory_repo():
    """Mock inventory repository."""
    with patch(
        "app.db.repositories.inventory.get_inventory_repository"
    ) as mock:
        repo = AsyncMock()
        mock.return_value = repo
        yield repo


@pytest.fixture
def mock_scans_repo():
    """Mock scans repository."""
    with patch("app.db.repositories.scans.get_scans_repository") as mock:
        repo = AsyncMock()
        mock.return_value = repo
        yield repo


@pytest.fixture
def mock_predictions_repo():
    """Mock predictions repository."""
    with patch(
        "app.db.repositories.predictions.get_predictions_repository"
    ) as mock:
        repo = AsyncMock()
        mock.return_value = repo
        yield repo


@pytest.fixture
def mock_shopping_repo():
    """Mock shopping lists repository."""
    with patch(
        "app.db.repositories.shopping_lists.get_shopping_lists_repository"
    ) as mock:
        repo = AsyncMock()
        mock.return_value = repo
        yield repo


@pytest.fixture(autouse=True)
def reset_settings():
    """Reset settings between tests."""
    from app.core.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


# Helper functions for tests


def create_test_inventory_item(
    property_id: str | None = None,
    **overrides,
) -> dict:
    """Create a test inventory item dict."""
    return {
        "id": str(uuid4()),
        "property_id": property_id or str(uuid4()),
        "name": "Test Item",
        "sku": "TEST-001",
        "category_id": str(uuid4()),
        "unit": "each",
        "current_quantity": "10.0",
        "reorder_point": "5.0",
        "max_quantity": "100.0",
        "unit_cost": "9.99",
        "is_active": True,
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z",
        **overrides,
    }


def create_test_scan(
    property_id: str | None = None,
    user_id: str | None = None,
    **overrides,
) -> dict:
    """Create a test scan dict."""
    return {
        "id": str(uuid4()),
        "property_id": property_id or str(uuid4()),
        "user_id": user_id or str(uuid4()),
        "status": "pending",
        "scan_type": "shelf",
        "image_urls": ["https://example.com/image.jpg"],
        "items_detected": 0,
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z",
        **overrides,
    }


def create_test_shopping_list(
    property_id: str | None = None,
    **overrides,
) -> dict:
    """Create a test shopping list dict."""
    return {
        "id": str(uuid4()),
        "property_id": property_id or str(uuid4()),
        "created_by_id": str(uuid4()),
        "name": "Weekly Shopping",
        "status": "draft",
        "total_items": 0,
        "total_estimated_cost": "0.00",
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z",
        **overrides,
    }
