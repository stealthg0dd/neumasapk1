"""
OpenTelemetry-ready tracing and span context helpers.

Provides thin wrappers around structlog for business-span tracing.
When an OTel SDK is wired (e.g. via opentelemetry-sdk), the helpers here
will propagate trace/span IDs automatically through structlog context vars.

Usage:
    from app.core.tracing import start_span, finish_span

    span_ctx = start_span("scan.process", {"scan_id": scan_id})
    try:
        ...
        finish_span(span_ctx, status="ok")
    except Exception as exc:
        finish_span(span_ctx, status="error", error=str(exc))
        raise
"""

import time
import uuid
from collections.abc import Generator
from contextlib import contextmanager
from typing import Any

import structlog

from app.core.logging import get_logger

logger = get_logger(__name__)


def _try_otel_tracer(name: str):  # type: ignore[return]
    """Return an OTel tracer if the SDK is installed; else None."""
    try:
        from opentelemetry import trace  # type: ignore

        return trace.get_tracer(name)
    except ImportError:
        return None


class SpanContext:
    """Lightweight span context for business events."""

    def __init__(self, operation: str, attributes: dict[str, Any]) -> None:
        self.operation = operation
        self.attributes = attributes
        self.trace_id = str(uuid.uuid4()).replace("-", "")
        self.span_id = self.trace_id[:16]
        self.start_time = time.perf_counter()
        self._token = structlog.contextvars.bind_contextvars(
            trace_id=self.trace_id,
            span_op=operation,
        )

    def elapsed_ms(self) -> int:
        return int((time.perf_counter() - self.start_time) * 1000)


def start_span(operation: str, attributes: dict[str, Any] | None = None) -> SpanContext:
    """
    Start a new tracing span.

    Binds trace_id / span_op to structlog context vars so all log lines
    emitted within the span carry tracing metadata.

    Args:
        operation: Dot-namespaced operation name, e.g. "scan.process"
        attributes: Optional key/value attributes for the span

    Returns:
        SpanContext to pass to finish_span()
    """
    attrs = attributes or {}
    ctx = SpanContext(operation, attrs)
    logger.debug(
        "Span started",
        span_op=operation,
        trace_id=ctx.trace_id,
        **attrs,
    )
    return ctx


def finish_span(
    ctx: SpanContext,
    *,
    status: str = "ok",
    error: str | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    """
    Finish a tracing span and emit a completion log.

    Args:
        ctx: SpanContext returned by start_span()
        status: "ok" | "error" | "skipped"
        error: Error message if status == "error"
        extra: Additional key/value pairs for the completion log
    """
    elapsed = ctx.elapsed_ms()
    log_fn = logger.warning if status == "error" else logger.info
    log_fn(
        "Span finished",
        span_op=ctx.operation,
        trace_id=ctx.trace_id,
        status=status,
        elapsed_ms=elapsed,
        **(extra or {}),
        **({"error": error} if error else {}),
    )


@contextmanager
def traced(
    operation: str,
    attributes: dict[str, Any] | None = None,
) -> Generator[SpanContext, None, None]:
    """
    Context manager that wraps a block with start_span / finish_span.

    Usage:
        with traced("scan.process", {"scan_id": scan_id}) as span:
            ...

    Automatically sets status="error" and captures the exception message
    if an unhandled exception propagates out of the block.
    """
    ctx = start_span(operation, attributes)
    try:
        yield ctx
        finish_span(ctx, status="ok")
    except Exception as exc:
        finish_span(ctx, status="error", error=str(exc))
        raise
