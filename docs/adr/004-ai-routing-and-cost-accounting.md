# ADR 004 — AI Routing and Cost Accounting

**Date:** 2026-04-17
**Status:** Accepted
**Deciders:** Engineering

---

## Context

The `orchestration_service.py` already implements LLM failover (Claude → GPT-4 → Gemini), but AI operation costs are not tracked, making it impossible to reason about per-tenant AI spend, enforce usage limits, or bill for usage-based features.

## Decision

1. **All AI-intensive operations record a `usage_event`** with: `event_type`, `org_id`, `property_id`, `model_provider`, `model_name`, `input_tokens`, `output_tokens`, `estimated_cost_usd`, `operation_id`, `created_at`.

2. **Model cost constants** live in `app/core/constants.py`. They are approximate and should be updated when provider pricing changes.

3. **LLM failover chain remains:** Claude 3.5 Sonnet → GPT-4o → Gemini 1.5 Pro. The chain is configurable via settings and will use the first available key.

4. **`DEV_MODE=true`** stubs all LLM calls with deterministic responses and records zero-cost usage events.

5. **Usage data is available via the admin API** (`GET /api/admin/usage`) for plan enforcement and billing support.

6. **No provider-specific logic in services.** All LLM calls go through `orchestration_service.py`, which handles failover, cost recording, and error normalization.

## Consequences

- Per-tenant AI cost visibility.
- Usage limits can be enforced at the `usage_service.py` layer.
- Model pricing changes require only `constants.py` updates.
- Operators can see which AI operations are most expensive.

## Alternatives Considered

- **LangChain callback handlers for cost tracking:** Rejected because LangChain is not in the dependency tree and would add significant weight and abstraction.
- **Provider dashboard cost tracking only:** Rejected because it cannot be broken down per tenant.
