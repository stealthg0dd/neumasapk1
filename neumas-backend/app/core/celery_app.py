"""
Celery application configuration for background task processing.

Multi-agent orchestration with LLM failover support.

IMPORTANT: This module is designed to avoid circular imports.
- Celery instance and decorators are defined FIRST
- autodiscover_tasks is called lazily via worker signal
- Do NOT import this module from __init__.py files
"""

from celery import Celery
from celery.signals import worker_init
from kombu import Exchange, Queue

# Import config directly without going through __init__
from app.core.config import settings

# =============================================================================
# Sentry — initialised here so worker processes capture task exceptions.
# The FastAPI integration is not added (workers have no HTTP context).
# =============================================================================
try:
    import sentry_sdk
    from sentry_sdk.integrations.celery import CeleryIntegration

    if settings.SENTRY_DSN:
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.ENV,
            release=settings.APP_VERSION,
            traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
            integrations=[CeleryIntegration(monitor_beat_tasks=True)],
            send_default_pii=False,
        )
except ImportError:
    pass  # sentry-sdk not installed — safe to continue

# =============================================================================
# STEP 1: Create Celery app FIRST (before any task discovery)
# =============================================================================
celery_app = Celery(
    "neumas",
    broker=settings.celery_broker,
    backend=settings.celery_backend,
)

# Force synchronous execution (no Redis needed for MVP)
import os

ALWAYS_EAGER = os.getenv("CELERY_TASK_ALWAYS_EAGER", "false").lower() == "true"
if ALWAYS_EAGER:
    print("⚠️  CELERY RUNNING IN EAGER MODE (NO REDIS NEEDED)")
    celery_app.conf.task_always_eager = True
    celery_app.conf.task_eager_propagates = True

# Define exchanges
neumas_exchange = Exchange("neumas", type="direct")

# Celery configuration
celery_app.conf.update(
    # Task settings
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,

    # Default queue
    task_default_queue="neumas_default",
    task_default_exchange="neumas",
    task_default_routing_key="neumas_default",

    # Queue definitions
    task_queues=(
        Queue("neumas_default", neumas_exchange, routing_key="neumas_default"),
        Queue("scans", neumas_exchange, routing_key="scans"),
        Queue("agents", neumas_exchange, routing_key="agents"),
        Queue("neumas.predictions", neumas_exchange, routing_key="neumas.predictions"),
        Queue("neumas.shopping", neumas_exchange, routing_key="neumas.shopping"),
    ),

    # Task routing - route by task name prefix
    task_routes={
        "scans.*": {"queue": "scans", "routing_key": "scans"},
        "agents.*": {"queue": "neumas.predictions", "routing_key": "neumas.predictions"},
        "agents.recompute_patterns_for_property": {"queue": "neumas.predictions", "routing_key": "neumas.predictions"},
        "agents.recompute_predictions_for_property": {"queue": "neumas.predictions", "routing_key": "neumas.predictions"},
        "agents.generate_shopping_list": {"queue": "agents", "routing_key": "agents"},
        "agents.optimize_budget": {"queue": "agents", "routing_key": "agents"},
        "agents.run_predictions": {"queue": "agents", "routing_key": "agents"},
        "agents.analyze_spending": {"queue": "agents", "routing_key": "agents"},
        "app.tasks.scan_tasks.*": {"queue": "scans"},
        "app.tasks.agent_tasks.*": {"queue": "neumas.predictions"},
    },

    # Broker connection retry (important for Railway cold-start)
    broker_connection_retry_on_startup=True,
    broker_connection_retry=True,
    broker_connection_max_retries=10,

    # Redis socket timeouts — fail fast when Redis is unavailable
    # Without these, the result backend retries 20× blocking for ~20s per request
    redis_socket_connect_timeout=3,
    redis_socket_timeout=3,

    # Result backend settings
    result_expires=3600,  # Results expire after 1 hour
    result_extended=True,
    # Reduce Redis result backend retries: 2 retries × ~0.5s ≈ 1s fail time
    result_backend_transport_options={
        "max_retries": 2,
        "interval_start": 0,
        "interval_step": 0.3,
        "interval_max": 0.5,
    },

    # Worker settings
    worker_prefetch_multiplier=1,
    worker_concurrency=4,

    # Task execution settings
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_time_limit=600,  # 10 minutes hard limit (LLM calls can be slow)
    task_soft_time_limit=540,  # 9 minutes soft limit

    # Retry settings for transient errors (LLM rate limits, HTTP errors)
    task_annotations={
        "*": {
            "rate_limit": "10/m",  # Global rate limit
        },
        "scans.*": {
            "rate_limit": "5/m",  # Scan processing rate limit
            "max_retries": 3,
            "default_retry_delay": 60,
        },
        "agents.*": {
            "rate_limit": "20/m",  # Agent calls rate limit
            "max_retries": 5,
            "default_retry_delay": 30,
        },
    },

    # Beat scheduler (for periodic tasks)
    beat_schedule={
        # Periodic prediction refresh
        "refresh-predictions-daily": {
            "task": "agents.refresh_all_predictions",
            "schedule": 86400,  # Once per day
            "options": {"queue": "agents"},
        },
    },
)


# =============================================================================
# STEP 2: Define custom exceptions and task base class BEFORE autodiscover
# =============================================================================


# Custom exceptions for LLM errors
class LLMRateLimitError(Exception):
    """Raised when LLM API returns rate limit error."""
    pass


class LLMExhaustedError(Exception):
    """Raised when all LLM fallbacks have been exhausted."""
    pass


class LLMParseError(Exception):
    """Raised when LLM response cannot be parsed as JSON."""
    pass


# Task base class with LLM-specific retry handling
class NeumasTask(celery_app.Task):  # type: ignore[name-defined]
    """Base task class with error handling and LLM retry logic."""

    # Retry for rate limits and transient HTTP errors
    autoretry_for = (
        LLMRateLimitError,
        ConnectionError,
        TimeoutError,
    )
    retry_backoff = True
    retry_backoff_max = 300  # Max 5 min backoff
    retry_jitter = True
    max_retries = 5

    def on_failure(
        self,
        exc: Exception,
        task_id: str,
        args: tuple,
        kwargs: dict,
        einfo: object,
    ) -> None:
        """Handle task failure."""
        from app.core.logging import get_logger
        logger = get_logger(__name__)
        logger.error(
            "Task failed",
            task_id=task_id,
            task_name=self.name,
            error=str(exc),
            error_type=type(exc).__name__,
        )
        super().on_failure(exc, task_id, args, kwargs, einfo)

    def on_retry(
        self,
        exc: Exception,
        task_id: str,
        args: tuple,
        kwargs: dict,
        einfo: object,
    ) -> None:
        """Handle task retry."""
        from app.core.logging import get_logger
        logger = get_logger(__name__)
        logger.warning(
            "Task retrying",
            task_id=task_id,
            task_name=self.name,
            retry_count=self.request.retries,
            error=str(exc),
        )
        super().on_retry(exc, task_id, args, kwargs, einfo)


# =============================================================================
# STEP 3: Define task decorator BEFORE autodiscover
# =============================================================================


def neumas_task(*args, **kwargs):
    """Decorator for creating Neumas tasks with proper base class."""
    kwargs.setdefault("base", NeumasTask)
    return celery_app.task(*args, **kwargs)


# =============================================================================
# STEP 4: Autodiscover tasks LAZILY via worker signal (NOT at import time)
# =============================================================================

_tasks_discovered = False


def discover_tasks() -> None:
    """Manually trigger task discovery. Safe to call multiple times."""
    global _tasks_discovered
    if _tasks_discovered:
        return

    celery_app.autodiscover_tasks(
        [
            "app.tasks.scan_tasks",
            "app.tasks.prediction_tasks",
            "app.tasks.agent_tasks",
            "app.tasks.shopping_tasks",
            "app.tasks.maintenance",
        ],
        force=True,
    )
    _tasks_discovered = True


@worker_init.connect
def on_worker_init(**kwargs) -> None:
    """Called when Celery worker starts. Discovers all tasks."""
    discover_tasks()


def get_celery_app() -> Celery:
    """Get the configured Celery application instance."""
    return celery_app


# =============================================================================
# Health Check Task
# =============================================================================


@celery_app.task(name="health.ping", bind=True)
def ping(self) -> dict:
    """
    Simple ping task for health checks.

    Returns:
        Dict with pong message and task info
    """
    return {
        "status": "pong",
        "task_id": self.request.id,
        "worker": self.request.hostname,
    }


def check_celery_health(timeout: float = 5.0) -> bool:
    """
    Check if Celery workers are healthy by sending a ping task.

    Args:
        timeout: Max seconds to wait for response

    Returns:
        True if workers are healthy, False otherwise
    """
    try:
        result = ping.apply_async()
        response = result.get(timeout=timeout)
        return response.get("status") == "pong"
    except Exception:
        return False
