# Neumas Product API Surface

> Version: 2.0 (Modular Monolith)
> Last updated: 2026-04-17

This document describes the full product-facing API surface exposed by the Neumas backend.

---

## Authentication

All endpoints (except `/api/auth/signup`, `/api/auth/login`, `/health`) require:
```
Authorization: Bearer <access_token>
```

Custom JWT claims carried by the token:
- `sub` — user UUID
- `org_id` — organization UUID
- `property_ids` — array of accessible property UUIDs
- `role` — `admin | staff | resident`

---

## Auth Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/signup` | Register new org + user |
| `POST` | `/api/auth/login` | Email/password login |
| `POST` | `/api/auth/refresh` | Refresh access token |
| `POST` | `/api/auth/logout` | Invalidate session |
| `GET`  | `/api/auth/me` | Get current user profile |
| `POST` | `/api/auth/google/complete` | Complete Google OAuth onboarding |

---

## Inventory Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/inventory/` | List inventory items (filterable) |
| `POST` | `/api/inventory/` | Create inventory item |
| `GET`  | `/api/inventory/{id}` | Get single item |
| `PATCH`| `/api/inventory/{id}` | Update item |
| `DELETE`| `/api/inventory/{id}` | Soft-delete item |
| `POST` | `/api/inventory/{id}/adjust-quantity` | Manual quantity adjustment (creates movement) |
| `POST` | `/api/inventory/bulk` | Bulk upsert items |
| `GET`  | `/api/inventory/movements` | List inventory movements (ledger) |

---

## Scan Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/scan/upload` | Upload receipt/barcode image |
| `GET`  | `/api/scan/{id}/status` | Poll scan status |
| `GET`  | `/api/scan/{id}` | Get scan result |
| `GET`  | `/api/scan/` | List scans |

---

## Document Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/documents/` | List documents (filterable by status) |
| `GET`  | `/api/documents/{id}` | Get document with line items |
| `POST` | `/api/documents/{id}/approve` | Approve and post document to inventory |
| `PATCH`| `/api/documents/{id}/line-items/{line_id}` | Edit extracted line item |
| `GET`  | `/api/documents/review-queue` | Items needing human review |

---

## Vendor Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/vendors/` | List vendors |
| `GET`  | `/api/vendors/{id}` | Get vendor detail |
| `POST` | `/api/vendors/` | Create vendor |
| `PATCH`| `/api/vendors/{id}` | Update vendor |
| `GET`  | `/api/vendors/{id}/price-history` | Price trend for vendor |
| `GET`  | `/api/vendors/compare` | Compare multiple vendors |

---

## Shopping Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/shopping/` | List shopping lists |
| `POST` | `/api/shopping/generate` | Generate AI shopping list |
| `GET`  | `/api/shopping/{id}` | Get shopping list detail |
| `PATCH`| `/api/shopping/{id}/items/{item_id}` | Mark item purchased |
| `POST` | `/api/shopping/{id}/approve` | Approve shopping list |

---

## Prediction Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/predictions/` | List predictions (by property) |
| `POST` | `/api/predictions/forecast` | Trigger prediction refresh |
| `GET`  | `/api/predictions/reorder` | Reorder recommendations |

---

## Alert Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/alerts/` | List alerts (filterable) |
| `GET`  | `/api/alerts/{id}` | Get alert detail |
| `POST` | `/api/alerts/{id}/snooze` | Snooze alert |
| `POST` | `/api/alerts/{id}/resolve` | Resolve alert |

---

## Report Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/reports/` | List generated reports |
| `POST` | `/api/reports/generate` | Generate report |
| `GET`  | `/api/reports/{id}` | Get report |
| `GET`  | `/api/reports/{id}/download` | Download CSV/PDF |

---

## Analytics Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/analytics/summary` | Spend + confidence + category breakdown |
| `GET`  | `/api/analytics/consumption` | Consumption trends |
| `GET`  | `/api/analytics/vendor-spend` | Spend by vendor |

---

## Admin Endpoints (admin role required)

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/organizations` | List all orgs |
| `GET`  | `/api/admin/users` | List all users |
| `GET`  | `/api/admin/usage` | Aggregate usage metrics |
| `GET`  | `/api/admin/system-health` | System health status |
| `POST` | `/api/admin/feature-flags` | Set feature flag |

---

## Health

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/health` | Service health check |
