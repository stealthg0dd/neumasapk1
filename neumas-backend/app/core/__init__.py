"""Core application modules."""

# Import only non-circular-import-prone modules at top level
from app.core.config import Settings, get_settings, settings
from app.core.logging import configure_logging, get_logger

# Celery app is imported lazily to avoid circular imports
# Use: from app.core.celery_app import celery_app

__all__ = [
    "Settings",
    "configure_logging",
    "get_logger",
    "get_settings",
    "settings",
]
