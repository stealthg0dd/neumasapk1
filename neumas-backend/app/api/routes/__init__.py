"""API route modules."""

from app.api.routes import admin, auth, inventory, predictions, scans, shopping

__all__ = [
    "admin",
    "auth",
    "inventory",
    "predictions",
    "scans",
    "shopping",
]
