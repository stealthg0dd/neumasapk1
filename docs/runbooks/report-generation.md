# Runbook: Report Generation

**Applies to:** All environments
**Last updated:** 2026-04-17

---

## Generating a Report

Reports are generated asynchronously. The flow:

1. Client calls `POST /api/reports/generate` with parameters
2. Backend enqueues a `report_tasks.generate_report` Celery task
3. Client polls `GET /api/reports/{id}` until status is `completed` or `failed`
4. Client calls `GET /api/reports/{id}/download` for CSV or PDF

---

## Available Report Types

| Type | Description |
|------|-------------|
| `weekly_summary` | Spend, scan activity, top items for a 7-day window |
| `inventory_snapshot` | Current inventory status with stock levels |
| `vendor_comparison` | Price and supply reliability by vendor |
| `consumption_analysis` | Item-level consumption vs. purchases |
| `forecast_accuracy` | Predicted vs. actual values for closed predictions |

---

## Symptom: Report Stuck in "Generating"

### Check 1 — Worker is processing report tasks
```bash
railway logs --service neumas-worker | grep report
```

### Check 2 — Report record status
```sql
SELECT id, status, error_message, created_at, completed_at
FROM reports
WHERE id = '<report_id>';
```

### Check 3 — Retry generation
If status is `failed`, call `POST /api/reports/generate` again with the same parameters. The `report_service.py` will create a new report record and enqueue a new task.

---

## Symptom: PDF Download Fails

PDF generation requires the `weasyprint` library (or equivalent) to be installed. Check:

```bash
python -c "import weasyprint; print('OK')"
```

If missing, either install it or fall back to CSV export which has no additional dependencies.

---

## Symptom: Report Data Looks Wrong

### Check 1 — Date range
Reports use the property's configured timezone. If the timezone is wrong, the date bucketing will be off. Check `properties.timezone` for the property.

### Check 2 — Missing movements
If inventory movements are missing for the period, the report will show lower-than-expected activity. Run the inventory movement diagnostic in the Retry & Idempotency runbook.

### Check 3 — Force regeneration
To force a report to regenerate with fresh data:
```sql
UPDATE reports SET status = 'stale' WHERE id = '<report_id>';
```
Then request generation again.
