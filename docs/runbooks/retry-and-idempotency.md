# Runbook: Retry and Idempotency

**Applies to:** All environments
**Last updated:** 2026-04-17

---

## Overview

Neumas uses idempotency keys to prevent double-writes when Celery tasks are retried or API requests are replayed.

---

## How Idempotency Keys Work

### For Celery Tasks

Tasks that write to the database include an `idempotency_key` parameter. This key is stored with the write. If the same task is retried with the same key, the write is skipped (the existing row is returned).

Common sources of idempotency keys:
- `scan_id` for scan processing tasks
- `{scan_id}:{item_name}` for inventory movement writes
- `{shopping_list_id}` for shopping list generation

### For API Requests

Clients send an `Idempotency-Key: <uuid>` header with mutating requests. The backend stores the key and response for 24 hours. Duplicate requests within this window return the cached response.

---

## Diagnosing a Double-Write

If operators report duplicated inventory movements:

```sql
-- Find movements with the same reference_id
SELECT reference_id, count(*) as cnt
FROM inventory_movements
WHERE property_id = '<property_id>'
GROUP BY reference_id
HAVING count(*) > 1;
```

If duplicates exist and have different `idempotency_key` values, the task was replayed without a consistent key (a bug). File a bug report.

If duplicates have the same key but different content, the uniqueness constraint failed (a database issue). Check the constraint:
```sql
SELECT * FROM pg_indexes WHERE tablename = 'inventory_movements';
```

---

## Fixing a Double-Write

1. Identify the incorrect movement (usually the second one with the same `reference_id`).
2. Create a `correction` movement to reverse the duplicate:
   ```sql
   INSERT INTO inventory_movements (
     item_id, property_id, org_id, movement_type, quantity_delta, notes, created_by_id
   ) VALUES (
     '<item_id>', '<property_id>', '<org_id>', 'correction', -<duplicate_delta>,
     'Manual correction: duplicate movement from task retry <task_id>', '<admin_user_id>'
   );
   ```
3. Update `inventory_items.quantity` to reflect the corrected value.
4. Log the correction in the audit log.

---

## Preventing Duplicate Reports

Report generation is idempotent. If a report is requested for the same period and property within 24 hours, the existing report is returned rather than generating a new one.

To force a regeneration (e.g., after data correction):
```python
# Set the existing report status to 'stale' first
# Then request generation again
```

---

## Celery Task Retry Policy

Default retry policy:
- Max retries: 3
- Backoff: exponential (10s, 30s, 90s)
- Retry on: network errors, 5xx from Supabase, Redis connection errors
- Do NOT retry on: 4xx from Supabase (bad data), explicit `do_not_retry` flag

To see failed tasks:
```bash
redis-cli -u $REDIS_URL keys "celery-task-meta-*" | head -20
```
