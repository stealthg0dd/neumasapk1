# Neumas Admin API Contract

> Version: 1.0
> Last updated: 2026-04-17

This document describes the admin API available to users with `role = admin`.

All admin endpoints require:
```
Authorization: Bearer <access_token>
```
Where the token belongs to a user with `role = admin`. Non-admin requests return `403 Forbidden`.

---

## Organization Management

### List Organizations
```
GET /api/admin/organizations
```
Returns all organizations (super-admin only in future; currently org-admin sees own org).

### Get Organization
```
GET /api/admin/organizations/{org_id}
```

### Update Organization
```
PATCH /api/admin/organizations/{org_id}
{
  "name": "...",
  "settings": { ... },
  "subscription_tier": "free | starter | pro | enterprise"
}
```

---

## User Management

### List Users
```
GET /api/admin/users?org_id=<uuid>&status=active
```

### Deactivate User
```
POST /api/admin/users/{user_id}/deactivate
```

### Change User Role
```
PATCH /api/admin/users/{user_id}/role
{
  "role": "admin | staff | resident"
}
```

---

## Property Management

### List Properties
```
GET /api/admin/properties?org_id=<uuid>
```

---

## System Health

```
GET /api/admin/system-health
```

Response:
```json
{
  "status": "healthy | degraded | unhealthy",
  "backend": "ok",
  "database": "ok",
  "redis": "ok",
  "celery_workers": "ok | no_workers",
  "version": "0.1.0",
  "environment": "prod"
}
```

---

## Usage Metrics

```
GET /api/admin/usage?org_id=<uuid>&start_date=2026-04-01&end_date=2026-04-17
```

Response:
```json
{
  "org_id": "...",
  "period": { "start": "...", "end": "..." },
  "documents_scanned": 42,
  "line_items_processed": 380,
  "active_users": 5,
  "active_properties": 2,
  "exports_generated": 3,
  "ai_operations": 87,
  "estimated_ai_cost_usd": 1.24
}
```

---

## Feature Flags

### List Feature Flags
```
GET /api/admin/feature-flags
```

### Set Feature Flag
```
POST /api/admin/feature-flags
{
  "flag_name": "enable_vendor_normalization",
  "org_id": "<uuid>",           // null = global
  "enabled": true
}
```

Available flags:
- `enable_vendor_normalization` — normalize vendor names on scan
- `enable_canonical_items` — map items to canonical catalog
- `enable_reorder_engine` — generate reorder recommendations
- `enable_copilot` — experimental copilot features
- `enable_pdf_export` — PDF report download

---

## Audit Logs

```
GET /api/admin/audit-logs?org_id=<uuid>&user_id=<uuid>&event_type=<type>&start_date=...
```

Event types: `login`, `logout`, `item_created`, `item_updated`, `item_deleted`, `quantity_adjusted`, `document_approved`, `reorder_generated`, `report_exported`, `admin_action`
