"""
Neumas FastAPI application entry point.

Production-hardened with:
- Request ID tracking and structured logging
- CORS configuration from settings
- Docs disabled in production (/docs, /redoc)
- /openapi.json protected behind admin auth in production
- Global exception handling
"""

import sys
import os

# Force UTF-8 for all I/O before any other imports.
# Railway (and many Docker environments) default to ASCII, which causes
# UnicodeEncodeError when Supabase API responses contain curly quotes etc.
os.environ.setdefault("PYTHONUTF8", "1")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.responses import JSONResponse

from app.core.config import settings

# Import routers explicitly at the top - errors will be visible in logs
from app.api.routes import admin, auth, inventory, predictions, scans, shopping

# Safe import for logging module
try:
    from app.core.logging import (
        RequestLoggingMiddleware,
        configure_logging,
        get_logger,
        set_user_context,
    )
    configure_logging()
    logger = get_logger(__name__)
except ImportError as e:
    # Fallback to standard logging if custom logging fails
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
    logger.warning(f"Failed to import custom logging: {e}")
    RequestLoggingMiddleware = None
    set_user_context = None

# Safe import for security module
try:
    from app.core.security import configure_cors, is_admin
except ImportError as e:
    logger.warning(f"Failed to import security module: {e}")
    configure_cors = None
    is_admin = lambda x: False


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """
    Application lifespan context manager.

    Handles startup and shutdown events for:
    - Database connections
    - Cache connections
    - Background worker initialization
    
    Handles missing dependencies gracefully for degraded mode.
    """
    # Startup
    logger.info(
        "Starting Neumas backend",
        extra={"environment": settings.ENV, "debug": settings.DEBUG}
        if isinstance(logger, logging.Logger) else None,
    )
    if hasattr(logger, 'info') and not isinstance(logger, logging.Logger):
        logger.info(
            "Starting Neumas backend",
            environment=settings.ENV,
            debug=settings.DEBUG,
        )

    # Initialize Supabase client (if configured)
    if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
        try:
            from app.db.supabase_client import get_supabase_client, health_check

            client = get_supabase_client()
            is_healthy = await health_check()
            logger.info("Supabase client initialized", healthy=is_healthy)
        except Exception as e:
            logger.error("Failed to initialize Supabase client", error=str(e))
    else:
        logger.warning("Supabase not configured - running in degraded mode")

    # Initialize Celery app (verify connection) - only if Redis is configured
    if settings.REDIS_URL:
        try:
            from app.core.celery_app import celery_app

            # Verify Redis connection
            celery_app.control.ping(timeout=1)
            logger.info("Celery/Redis connection verified")
        except Exception as e:
            logger.warning("Celery connection check failed", error=str(e))
    else:
        logger.warning("Redis not configured - Celery tasks disabled")

    yield

    # Shutdown
    logger.info("Shutting down Neumas backend")


# Create FastAPI application
# In production: disable /docs and /redoc, protect /openapi.json
app = FastAPI(
    title="Neumas API",
    description="Intelligent inventory management for hospitality",
    version="1.0.0",
    docs_url=None,  # We'll add custom docs route
    redoc_url=None,  # We'll add custom redoc route
    openapi_url=None if settings.is_production else "/openapi.json",
    lifespan=lifespan,
)

# Configure CORS from settings (if security module is available)
if configure_cors:
    configure_cors(app)
else:
    # Fallback: add basic CORS middleware
    from fastapi.middleware.cors import CORSMiddleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Add request logging middleware (generates request_id, logs req/res)
if RequestLoggingMiddleware:
    app.add_middleware(RequestLoggingMiddleware)


# ============================================================================
# OpenAPI/Docs - Protected in Production
# ============================================================================


async def verify_admin_for_docs(request: Request) -> None:
    """
    Verify admin access for OpenAPI docs in production.

    In development, docs are publicly accessible.
    In production, requires admin authentication.
    """
    if not settings.is_production:
        return

    # Get token from Authorization header
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required for API docs in production",
        )

    token = auth_header.split(" ")[1]

    try:
        from app.core.security import decode_token

        payload = decode_token(token)
        if not is_admin(payload):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required for API docs",
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
        )


@app.get("/openapi.json", include_in_schema=False)
async def get_openapi_schema(request: Request):
    """
    OpenAPI schema endpoint.

    In production, requires admin authentication.
    """
    await verify_admin_for_docs(request)
    return app.openapi()


@app.get("/docs", include_in_schema=False)
async def get_docs(request: Request):
    """Swagger UI — disabled in production."""
    if settings.is_production:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    await verify_admin_for_docs(request)
    return get_swagger_ui_html(
        openapi_url="/openapi.json",
        title=f"{app.title} - Swagger UI",
    )


@app.get("/redoc", include_in_schema=False)
async def get_redoc(request: Request):
    """ReDoc — disabled in production."""
    if settings.is_production:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    await verify_admin_for_docs(request)
    return get_redoc_html(
        openapi_url="/openapi.json",
        title=f"{app.title} - ReDoc",
    )


# ============================================================================
# Health Check Endpoints (no auth required)
# ============================================================================


@app.get(
    "/health",
    tags=["Health"],
    summary="Health check",
    response_model=dict,
)
async def health_check() -> dict:
    """
    Basic health check endpoint.

    Returns OK if the service is running.
    Used by load balancers and orchestrators for basic liveness probes.
    """
    return {"status": "healthy", "service": "neumas-api"}


@app.get(
    "/ready",
    tags=["Health"],
    summary="Readiness check",
    response_model=dict,
)
async def readiness_check() -> dict:
    """
    Readiness check endpoint.

    Verifies all dependencies are available:
    - Database connectivity
    - Redis connectivity
    - External API availability

    Used by orchestrators to determine if the service can accept traffic.
    """
    checks = {
        "database": False,
        "redis": False,
    }
    all_healthy = True

    # Check database
    try:
        from app.db.supabase_client import health_check as db_health

        checks["database"] = await db_health()
    except Exception as e:
        logger.warning("Database health check failed", error=str(e))
        all_healthy = False

    # Check Redis
    if settings.REDIS_URL:
        try:
            import redis

            r = redis.from_url(settings.REDIS_URL)
            r.ping()
            checks["redis"] = True
        except Exception as e:
            logger.warning("Redis health check failed", error=str(e))
            all_healthy = False
    else:
        checks["redis"] = True  # Redis not required

    status = "ready" if all_healthy else "degraded"

    return {
        "status": status,
        "checks": checks,
    }


# ============================================================================
# API Routers - Explicitly registered
# ============================================================================

# Authentication routes
app.include_router(
    auth.router,
    prefix="/api/auth",
    tags=["Authentication"],
)

# Scan routes
app.include_router(
    scans.router,
    prefix="/api/scan",
    tags=["Scans"],
)

# Inventory routes
app.include_router(
    inventory.router,
    prefix="/api/inventory",
    tags=["Inventory"],
)

# Prediction routes
app.include_router(
    predictions.router,
    prefix="/api/predictions",
    tags=["Predictions"],
)

# Shopping routes
app.include_router(
    shopping.router,
    prefix="/api/shopping-list",
    tags=["Shopping"],
)

# Admin routes
app.include_router(
    admin.router,
    prefix="/api/admin",
    tags=["Admin"],
)


# ============================================================================
# Exception Handlers
# ============================================================================


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Global exception handler for unhandled errors.

    Logs error with full context and returns safe response.
    """
    # Try to get request_id safely
    request_id = "unknown"
    try:
        from app.core.logging import get_request_id
        request_id = get_request_id() or getattr(request.state, "request_id", "unknown")
    except ImportError:
        request_id = getattr(request.state, "request_id", "unknown")

    # Get error message
    error_msg = str(exc)

    logger.error("Unhandled exception", error=error_msg, exc_type=type(exc).__name__, path=request.url.path)

    # Don't expose internal errors in production
    if settings.is_production:
        detail = "Internal server error"
    else:
        detail = error_msg

    return JSONResponse(
        status_code=500,
        content={
            "detail": detail,
            "request_id": request_id,
        },
        headers={"X-Request-ID": request_id},
    )


# ============================================================================
# Development Server
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_level="debug" if settings.DEBUG else "info",
    )
