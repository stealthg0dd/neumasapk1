"""Database modules.

Models and clients are imported lazily to avoid circular imports.
Import directly from the specific module:
    from app.db.models import User, Organization
    from app.db.supabase_client import get_supabase_client
"""

__all__ = [
    "Base",
    "ConsumptionPattern",
    "InventoryCategory",
    "InventoryItem",
    "Organization",
    "Prediction",
    "Property",
    "Scan",
    "ShoppingList",
    "ShoppingListItem",
    "User",
    "check_supabase_health",
    "close_supabase_client",
    "get_async_supabase_client",
    "get_auth_client",
    "get_db_session",
    "get_supabase_client",
]
