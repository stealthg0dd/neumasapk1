"""
Idempotency middleware for safe task retries.

For HTTP POST/PATCH requests that include an `Idempotency-Key` header:
1. Hash the key + method + path
2. Check Redis for a cached response
3. If found, replay the cached response (status code + body)
4. If not found, run the handler, cache the result, return it

Cache TTL: IDEMPOTENCY_TTL_SECONDS (default 24 hours).

This is used for:
- Mobile offline queue replay
- Celery task retries
- Operator form submissions that may be retried on network failure
"""

import hashlib
import json
from collections.abc import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.constants import IDEMPOTENCY_TTL_SECONDS
from app.core.logging import get_logger

logger = get_logger(__name__)

_IDEMPOTENT_METHODS = frozenset({"POST", "PATCH"})
_IDEMPOTENCY_HEADER = "Idempotency-Key"


def _cache_key(method: str, path: str, idempotency_key: str) -> str:
    raw = f"{method}:{path}:{idempotency_key}"
    return "idempotency:" + hashlib.sha256(raw.encode()).hexdigest()[:32]


class IdempotencyMiddleware(BaseHTTPMiddleware):
    """
    Redis-backed idempotency replay middleware.

    Only active if Redis is configured. Silently skips if Redis is unavailable
    so that idempotency failures do not block requests.
    """

    def __init__(self, app, redis_url: str | None = None) -> None:
        super().__init__(app)
        self._redis = None
        if redis_url:
            try:
                import redis as redis_lib
                self._redis = redis_lib.from_url(
                    redis_url, socket_connect_timeout=1, socket_timeout=1, decode_responses=True
                )
            except Exception as e:
                logger.warning("Idempotency middleware: Redis unavailable", error=str(e))

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.method not in _IDEMPOTENT_METHODS:
            return await call_next(request)

        idem_key = request.headers.get(_IDEMPOTENCY_HEADER)
        if not idem_key or not self._redis:
            return await call_next(request)

        cache_key = _cache_key(request.method, request.url.path, idem_key)

        # Try cache lookup
        try:
            cached = self._redis.get(cache_key)
            if cached:
                payload = json.loads(cached)
                logger.debug(
                    "Idempotency cache hit",
                    key=idem_key,
                    path=request.url.path,
                )
                return JSONResponse(
                    content=payload["body"],
                    status_code=payload["status_code"],
                    headers={"X-Idempotency-Replayed": "true"},
                )
        except Exception as e:
            logger.warning("Idempotency cache read failed", error=str(e))

        # Execute request
        response = await call_next(request)

        # Cache successful responses only
        if 200 <= response.status_code < 300:
            try:
                body_bytes = b""
                async for chunk in response.body_iterator:
                    body_bytes += chunk
                body = json.loads(body_bytes.decode())
                self._redis.setex(
                    cache_key,
                    IDEMPOTENCY_TTL_SECONDS,
                    json.dumps({"status_code": response.status_code, "body": body}),
                )
                return JSONResponse(
                    content=body,
                    status_code=response.status_code,
                    headers=dict(response.headers),
                )
            except Exception as e:
                logger.warning("Idempotency cache write failed", error=str(e))
                # Return original response body we already consumed
                return Response(
                    content=body_bytes,
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    media_type=response.media_type,
                )

        return response
