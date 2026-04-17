"""
Shared business constants for the Neumas backend.

Keep model pricing up to date when providers change their rates.
All USD prices are per 1000 tokens.
"""

# ---------------------------------------------------------------------------
# Extraction / confidence
# ---------------------------------------------------------------------------

# Items with confidence below this threshold are flagged for human review
CONFIDENCE_REVIEW_THRESHOLD: float = 0.75

# ---------------------------------------------------------------------------
# Inventory movements
# ---------------------------------------------------------------------------

VALID_MOVEMENT_TYPES = frozenset({
    "purchase",
    "manual_adjustment",
    "usage",
    "waste",
    "expiry",
    "transfer",
    "correction",
})

# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------

VALID_ALERT_TYPES = frozenset({
    "low_stock",
    "out_of_stock",
    "expiry_risk",
    "unusual_price_increase",
    "no_recent_scan",
})

VALID_ALERT_STATES = frozenset({"open", "snoozed", "resolved"})

ALERT_SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}

# Days without a scan before triggering a no_recent_scan alert
NO_RECENT_SCAN_DAYS = 7

# Reorder engine defaults
REORDER_HORIZON_DAYS = 14        # Planning horizon in days
REORDER_SAFETY_BUFFER = 0.20     # 20% safety stock buffer

# ---------------------------------------------------------------------------
# LLM model cost estimates (USD per 1000 tokens, approximate)
# ---------------------------------------------------------------------------

MODEL_COST_PER_1K_TOKENS: dict[str, dict[str, float]] = {
    "claude-3-5-sonnet": {"input": 0.003, "output": 0.015},
    "claude-3-haiku": {"input": 0.00025, "output": 0.00125},
    "gpt-4o": {"input": 0.005, "output": 0.015},
    "gpt-4-turbo": {"input": 0.01, "output": 0.03},
    "gpt-3.5-turbo": {"input": 0.001, "output": 0.002},
    "gemini-1.5-pro": {"input": 0.00125, "output": 0.005},
}

def estimate_llm_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
) -> float:
    """Estimate LLM cost in USD for a given model and token counts."""
    rates = MODEL_COST_PER_1K_TOKENS.get(model)
    if not rates:
        return 0.0
    return (input_tokens * rates["input"] + output_tokens * rates["output"]) / 1000

# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

# ---------------------------------------------------------------------------
# Idempotency
# ---------------------------------------------------------------------------

# How long (seconds) to keep idempotency key results in Redis cache
IDEMPOTENCY_TTL_SECONDS = 86400  # 24 hours

# Maximum age (days) of offline-queued operations accepted from mobile
MAX_OFFLINE_QUEUE_AGE_DAYS = 7

# ---------------------------------------------------------------------------
# Upload deduplication
# ---------------------------------------------------------------------------

# How long (seconds) to consider an identical file a duplicate upload
UPLOAD_DEDUP_WINDOW_SECONDS = 300  # 5 minutes

# Hash algorithm used to fingerprint uploaded files
FILE_HASH_ALGO = "sha256"

# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------

# How long (hours) before allowing a duplicate report for same period+type
REPORT_DEDUP_WINDOW_HOURS = 24
