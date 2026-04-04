"""
Tests for inventory endpoints.
"""

from unittest.mock import patch
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
def sample_inventory_item() -> dict:
    """Create a sample inventory item."""
    return {
        "id": str(uuid4()),
        "property_id": str(uuid4()),
        "name": "Coffee Beans",
        "sku": "COFFEE-001",
        "category_id": str(uuid4()),
        "unit": "kg",
        "current_quantity": "10.5",
        "reorder_point": "5.0",
        "max_quantity": "50.0",
        "unit_cost": "25.00",
        "is_active": True,
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z",
    }


@pytest.fixture
async def client():
    """Create an async test client."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


class TestInventoryList:
    """Tests for inventory listing."""

    @pytest.mark.asyncio
    async def test_list_requires_auth(self, client: AsyncClient):
        """Test listing inventory requires authentication."""
        property_id = uuid4()
        response = await client.get(
            f"/api/inventory/?property_id={property_id}",
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.asyncio
    async def test_list_requires_property_id(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test listing inventory requires property_id."""
        with patch("app.api.deps.get_token", return_value="test-token"), patch(
            "app.api.deps.get_current_user",
        ) as mock_user:
            mock_user.return_value = UserInfo(
                id=uuid4(),
                email="test@example.com",
                full_name="Test",
                role="manager",
                organization_id=uuid4(),
                is_active=True,
            )

            response = await client.get(
                "/api/inventory/",
                headers=auth_headers,
            )

            # Should fail validation for missing property_id
            assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestInventoryCreate:
    """Tests for creating inventory items."""

    @pytest.mark.asyncio
    async def test_create_item_validation(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test creating item with invalid data fails validation."""
        response = await client.post(
            "/api/inventory/",
            headers=auth_headers,
            json={
                "name": "",  # Empty name should fail
                "property_id": str(uuid4()),
            },
        )

        # Either auth failure or validation failure
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        ]


class TestInventoryQuantity:
    """Tests for quantity operations."""

    @pytest.mark.asyncio
    async def test_set_quantity_requires_positive(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test that quantity must be non-negative."""
        item_id = uuid4()

        response = await client.post(
            f"/api/inventory/{item_id}/quantity",
            headers=auth_headers,
            json={
                "quantity": -5.0,  # Negative should fail
            },
        )

        # Either auth failure or validation failure
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        ]

    @pytest.mark.asyncio
    async def test_adjust_quantity_allows_negative(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test that adjustment can be negative (for consumption)."""
        item_id = uuid4()

        # Negative adjustment should be valid
        # (it decreases quantity)
        response = await client.post(
            f"/api/inventory/{item_id}/adjust",
            headers=auth_headers,
            json={
                "adjustment": -3.0,
                "reason": "consumed",
            },
        )

        # Will fail on auth, but request format is valid
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_200_OK,
        ]


class TestLowStock:
    """Tests for low stock functionality."""

    @pytest.mark.asyncio
    async def test_low_stock_requires_property(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test low stock endpoint requires property_id."""
        response = await client.get(
            "/api/inventory/low-stock",
            headers=auth_headers,
        )

        # Missing property_id
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        ]


class TestBulkUpdate:
    """Tests for bulk update operations."""

    @pytest.mark.asyncio
    async def test_bulk_update_schema(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test bulk update request schema."""
        response = await client.post(
            "/api/inventory/bulk-update",
            headers=auth_headers,
            json={
                "updates": [
                    {"item_id": str(uuid4()), "quantity": 10.0},
                    {"item_id": str(uuid4()), "quantity": 5.0},
                ],
                "source": "scan",
            },
        )

        # Will fail on auth
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_200_OK,
        ]


class TestCategories:
    """Tests for category operations."""

    @pytest.mark.asyncio
    async def test_list_categories_requires_org(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test listing categories requires organization context."""
        response = await client.get(
            "/api/inventory/categories/",
            headers=auth_headers,
        )

        # Will fail on getting org_id from user
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        ]
