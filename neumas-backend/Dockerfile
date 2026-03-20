# =============================================================================
# Neumas Backend Dockerfile - FIXED
# =============================================================================
# Multi-stage build for development and production

# -----------------------------------------------------------------------------
# Stage 1: Base image with Python and dependencies
# -----------------------------------------------------------------------------
FROM python:3.12-slim AS base

# Prevent Python from writing bytecode and buffering stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PYTHONUTF8=1 \
    # pip settings
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# -----------------------------------------------------------------------------
# Stage 2: Development image
# -----------------------------------------------------------------------------
FROM base AS development

# CRITICAL FIX: Copy manifest AND the source directory before installing.
# Hatchling requires these to generate the editable metadata.
COPY pyproject.toml README.md ./
COPY app/ ./app/

# Install in editable mode
RUN pip install -e ".[dev]"

# Copy the rest of the project (config files, tests, etc.)
COPY . .

# Expose port
EXPOSE 8000

# Run with hot reload for fast iteration
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# -----------------------------------------------------------------------------
# Stage 3: Builder for production
# -----------------------------------------------------------------------------
FROM base AS builder

# CRITICAL FIX: Ensure README and app source are present for the build
COPY pyproject.toml README.md ./
COPY app/ ./app/

# Create virtual environment and install dependencies
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN pip install --upgrade pip && \
    pip install .

# -----------------------------------------------------------------------------
# Stage 4: Production image
# -----------------------------------------------------------------------------
FROM python:3.12-slim AS production

# Runtime environment
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PYTHONUTF8=1 \
    ENV=prod \
    PATH="/opt/venv/bin:$PATH" \
    # Gunicorn defaults
    GUNICORN_WORKERS=4 \
    GUNICORN_THREADS=2 \
    GUNICORN_TIMEOUT=120 \
    PORT=8000

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libpq5 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --shell /bin/bash appuser

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv

# Copy application code with correct ownership
COPY --chown=appuser:appuser . .

# Switch to non-root user for security
USER appuser

# Expose port
EXPOSE 8000

# Health check - ensure the container is actually serving requests
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Run with Gunicorn + Uvicorn workers for production stability
CMD gunicorn app.main:app \
    --workers ${GUNICORN_WORKERS:-4} \
    --threads ${GUNICORN_THREADS:-2} \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:${PORT:-8000} \
    --timeout ${GUNICORN_TIMEOUT:-120} \
    --graceful-timeout 30 \
    --keep-alive 5 \
    --access-logfile - \
    --error-logfile - \
    --capture-output \
    --enable-stdio-inheritance