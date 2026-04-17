# Runbook: Scan Failure Recovery

**Applies to:** All environments
**Last updated:** 2026-04-17

---

## Symptom: Scan Stuck in "Processing"

### Check 1 — Celery worker is running
```bash
# Railway
railway logs --service neumas-worker

# Local docker-compose
docker-compose logs worker
```
Look for `Received task: scans.process_scan` entries.

If no workers are processing, check Redis connectivity:
```bash
redis-cli -u $REDIS_URL ping
# Expected: PONG
```

### Check 2 — Task is in the queue but not being consumed
```bash
redis-cli -u $REDIS_URL llen scans
# Returns number of items in the scans queue
```
If > 0 and workers are running, check for task deserialization errors in worker logs.

### Check 3 — Manual requeue
If a scan is stuck in `processing` status for more than 5 minutes:
```python
# In a Python shell with backend dependencies
from app.tasks.scan_tasks import process_scan
process_scan.apply_async(
    args=[scan_id, property_id, user_id, image_url, scan_type],
    queue="scans"
)
```

---

## Symptom: Scan Failed with Vision Agent Error

### Check 1 — API key exhausted or rate limited
Check backend logs for `AnthropicError` or `OpenAIError`. If rate limited, wait and retry.

Check env vars: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`

### Check 2 — Image not accessible
The image URL stored in the scan record must be accessible to the backend worker. If using Supabase Storage, check the bucket is not private or the service role key has access.

### Check 3 — Manual retry of a failed scan
```python
# Change scan status back to pending first
# Then requeue (the task will pick up the new status)
```

Or use `DEV_MODE=true` to test the pipeline with stub responses.

---

## Symptom: Scan Completed but Inventory Not Updated

### Check 1 — Check scan processed_results
```sql
SELECT processed_results, error_message FROM scans WHERE id = '<scan_id>';
```
If `processed_results` is empty, the VisionAgent returned no items. Check image quality.

### Check 2 — Inventory upsert failed silently
Check worker logs around the scan completion time for `inventory_upsert` errors.

### Check 3 — Schema cache miss (PGRST204)
If the logs show `PGRST204`, the Supabase schema cache is stale:
```sql
NOTIFY pgrst, 'reload schema';
```
Then retry the scan.

---

## Symptom: Duplicate Items Created After Scan

This indicates the idempotency mechanism did not fire. Check:

1. The `idempotency_key` stored on the `inventory_movements` row for this scan
2. Whether the task was replayed with a different `scan_id` or key

If items were doubled, manually create a `correction` movement to restore the correct quantity.
