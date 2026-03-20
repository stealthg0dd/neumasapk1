"""
Structured JSON logging configuration for production and development.

Production logs include:
- timestamp (ISO 8601)
- level
- logger
- message
- request_id
- user_id
- org_id
- path
- method

Uses structlog for structured logging with request context tracking.
"""

import logging
import sys
import time
import uuid
from contextvars import ContextVar
from typing import Any

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from structlog.types import Processor

from app.core.config import settings

# Context variables for request tracking
request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)
user_id_ctx: ContextVar[str | None] = ContextVar("user_id", default=None)
org_id_ctx: ContextVar[str | None] = ContextVar("org_id", default=None)


def add_request_context(
    logger: logging.Logger,
    method_name: str,
    event_dict: dict[str, Any],
) -> dict[str, Any]:
    """
    Structlog processor to add request context to all log entries.

    Adds: request_id, user_id, org_id from context variables.
    """
    request_id = request_id_ctx.get()
    user_id = user_id_ctx.get()
    org_id = org_id_ctx.get()

    if request_id:
        event_dict["request_id"] = request_id
    if user_id:
        event_dict["user_id"] = user_id
    if org_id:
        event_dict["org_id"] = org_id

    return event_dict


def configure_logging() -> None:
    """
    Configure structured logging for the application.

    In production: JSON formatted logs with full context for log aggregation
    In development: Colored, human-readable console output

    Log fields include:
    - timestamp: ISO 8601 format
    - level: DEBUG, INFO, WARNING, ERROR, CRITICAL
    - logger: Logger name (module path)
    - message: Log message
    - request_id: Unique request identifier
    - user_id: Authenticated user ID
    - org_id: Organization/tenant ID
    - path: Request path
    - method: HTTP method
    """
    # Shared processors for all environments
    shared_processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso", key="timestamp"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
        add_request_context,  # Add request context to all logs
    ]

    if settings.is_production:
        # Production: JSON logging for log aggregation (ELK, Datadog, etc.)
        processors: list[Processor] = [
            *shared_processors,
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(sort_keys=True),
        ]
    else:
        # Development: Colored console output
        processors = [
            *shared_processors,
            structlog.dev.ConsoleRenderer(colors=True),
        ]

    # Configure structlog
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Configure standard library logging
    log_level = logging.DEBUG if settings.DEBUG else logging.INFO

    # Root logger configuration
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=log_level,
        force=True,
    )

    # Set levels for noisy libraries
    logging.getLogger("uvicorn").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("gunicorn").setLevel(logging.INFO)

    if settings.is_production:
        # In prod, kill uvicorn's plain-text access log entirely.
        # RequestLoggingMiddleware already emits structured JSON access events.
        logging.getLogger("uvicorn.access").setLevel(logging.ERROR)
        logging.getLogger("gunicorn.access").setLevel(logging.ERROR)
    else:
        # Dev: suppress uvicorn access log too — middleware output is cleaner.
        logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """
    Get a structured logger instance.

    Args:
        name: Logger name (typically __name__)

    Returns:
        Configured structlog logger
    """
    return structlog.get_logger(name)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    ASGI middleware for logging HTTP requests with request_id tracking.

    Features:
    - Generates unique request_id for each request
    - Logs incoming request at INFO level
    - Logs outgoing response with status and latency
    - Binds request context (user_id, org_id) for all subsequent logs
    """

    def __init__(self, app: Any) -> None:
        super().__init__(app)
        self.logger = get_logger("http.request")

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        # Generate unique request ID
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())

        # Store in context var for logging
        request_id_ctx.set(request_id)

        # Store in request state for access in route handlers
        request.state.request_id = request_id

        # Extract request info
        method = request.method
        path = request.url.path
        query_string = str(request.url.query) if request.url.query else None
        client_ip = self._get_client_ip(request)

        # Clear and bind request context for structlog
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=method,
            path=path,
            client_ip=client_ip,
        )

        # Log incoming request
        self.logger.info(
            "Request started",
            query_string=query_string,
        )

        # Track timing
        start_time = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception as exc:
            # Log exception with full context
            latency_ms = (time.perf_counter() - start_time) * 1000
            self.logger.exception(
                "Request failed",
                status_code=500,
                latency_ms=round(latency_ms, 2),
                error=str(exc),
            )
            raise

        # Calculate latency
        latency_ms = (time.perf_counter() - start_time) * 1000

        # Add request_id to response headers
        response.headers["X-Request-ID"] = request_id

        # Log completed request
        log_method = self.logger.info if response.status_code < 400 else self.logger.warning
        log_method(
            "Request completed",
            status_code=response.status_code,
            latency_ms=round(latency_ms, 2),
        )

        return response

    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP from request, handling proxies."""
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"


def set_user_context(user_id: str | None, org_id: str | None = None) -> None:
    """
    Set user context for logging.

    Call this after authentication to bind user_id and org_id
    to all subsequent log entries in the request.

    Args:
        user_id: Authenticated user ID
        org_id: Organization/tenant ID
    """
    if user_id:
        user_id_ctx.set(user_id)
        structlog.contextvars.bind_contextvars(user_id=user_id)
    if org_id:
        org_id_ctx.set(org_id)
        structlog.contextvars.bind_contextvars(org_id=org_id)


def get_request_id() -> str | None:
    """Get the current request ID from context."""
    return request_id_ctx.get()


def log_startup_info() -> None:
    """Log application startup information."""
    logger = get_logger("startup")
    logger.info(
        "Application starting",
        app_name=settings.APP_NAME,
        version=settings.APP_VERSION,
        environment=settings.ENV,
        debug=settings.DEBUG,
        workers=settings.WORKERS,
    )


def log_shutdown_info() -> None:
    """Log application shutdown information."""
    logger = get_logger("shutdown")
    logger.info("Application shutting down")
