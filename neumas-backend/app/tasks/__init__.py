"""
Celery tasks for background processing.

Task modules:
- scan_tasks: Receipt/barcode scan processing pipeline
- agent_tasks: Shopping list generation and agent orchestration

Tasks are imported lazily to avoid circular imports during app startup.
Import directly from the specific module:
    from app.tasks.scan_tasks import process_scan
    from app.tasks.agent_tasks import generate_shopping_list
"""

__all__ = [
    "process_scan",
    "generate_shopping_list",
]
