"""
File hashing utilities for upload deduplication.

Provides:
- compute_hash(data)         -- SHA-256 digest of arbitrary bytes
- dedup_key(hash, tenant_id) -- Redis key used for upload dedup check
- is_duplicate_upload()      -- check + set Redis key atomically
"""

import hashlib

from app.core.constants import FILE_HASH_ALGO, UPLOAD_DEDUP_WINDOW_SECONDS
from app.core.logging import get_logger

logger = get_logger(__name__)

_SUPPORTED_ALGOS: frozenset[str] = frozenset({"sha256", "sha1", "md5"})


def compute_hash(
    data: bytes,
    algo: str = FILE_HASH_ALGO,
) -> str:
    """
    Compute a hex digest of *data* using the specified algorithm.

    Args:
        data: Raw bytes to hash
        algo: Hash algorithm — "sha256" (default), "sha1", or "md5"

    Returns:
        Lowercase hex digest string
    """
    if algo not in _SUPPORTED_ALGOS:
        raise ValueError(f"Unsupported hash algorithm: {algo!r}. Choose from {_SUPPORTED_ALGOS}")
    h = hashlib.new(algo)
    h.update(data)
    return h.hexdigest()


def dedup_key(file_hash: str, org_id: str, property_id: str) -> str:
    """
    Build a Redis key for upload deduplication.

    Scoped to (org_id, property_id) so the same receipt uploaded for
    different properties does NOT trigger a duplicate detection.

    Args:
        file_hash: Hex digest from compute_hash()
        org_id: Organisation UUID as string
        property_id: Property UUID as string

    Returns:
        Redis key string
    """
    return f"upload_dedup:{org_id}:{property_id}:{file_hash}"


def is_duplicate_upload(
    file_hash: str,
    org_id: str,
    property_id: str,
    redis_client,  # redis.Redis — typed as Any to avoid hard dep
    ttl: int = UPLOAD_DEDUP_WINDOW_SECONDS,
) -> bool:
    """
    Atomically check whether a file has been uploaded recently.

    Uses Redis SET NX + EXPIRE to ensure only one writer succeeds within
    the dedup window.

    Args:
        file_hash: Hex digest of the uploaded file
        org_id: Organisation UUID string
        property_id: Property UUID string
        redis_client: Synchronous redis.Redis instance
        ttl: Window in seconds (defaults to UPLOAD_DEDUP_WINDOW_SECONDS)

    Returns:
        True  → this is a duplicate (key already existed)
        False → first upload within the window (key was set)
    """
    key = dedup_key(file_hash, org_id, property_id)
    try:
        # SET key 1 NX EX ttl — returns True if key was newly set
        was_set = redis_client.set(key, "1", nx=True, ex=ttl)
        if was_set:
            logger.debug(
                "Upload dedup key created",
                key=key,
                ttl_seconds=ttl,
            )
            return False  # not a duplicate
        logger.info(
            "Duplicate upload detected",
            file_hash=file_hash,
            org_id=org_id,
            property_id=property_id,
        )
        return True
    except Exception as exc:
        # If Redis is unavailable, fail open (allow the upload)
        logger.warning(
            "Upload dedup Redis check failed — allowing upload",
            error=str(exc),
            file_hash=file_hash,
        )
        return False
