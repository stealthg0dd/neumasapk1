# Mobile API Contract

**Version:** 1.0  
**Last updated:** 2025  
**Base URL:** `https://api.neumas.com`

---

## Overview

This document specifies the API surface consumed by Neumas mobile clients (iOS / Android / React Native).

All requests must carry a valid JWT in the `Authorization: Bearer <token>` header, obtained via `POST /api/auth/login`.

Mobile clients **must** include:

| Header | Required | Description |
|---|---|---|
| `Authorization` | ✅ | `Bearer <jwt>` |
| `X-Neumas-Client` | ✅ | Client identifier, e.g. `ios/2.1.0` |
| `X-Neumas-Device` | recommended | Stable device ID (UUID) for correlation |
| `Idempotency-Key` | for POST/PATCH | Client-generated UUID; prevents duplicate writes on retry |

---

## Authentication

### POST `/api/auth/login`

Authenticate with email + password.

**Request**
```json
{
  "email": "user@example.com",
  "password": "s3cr3t"
}
```

**Response 200**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "expires_in": 3600,
  "token_type": "Bearer",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "Jane Smith",
    "role": "staff"
  }
}
```

### POST `/api/auth/refresh`

Exchange a valid refresh token for a new access token.

**Request**
```json
{ "refresh_token": "eyJ..." }
```

**Response 200**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

---

## Scans

### POST `/api/scan/upload`

Upload a receipt or barcode image for processing.

**Content-Type:** `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `file` | file | JPEG/PNG/WEBP image, max 10 MB |
| `scan_type` | string | `receipt` \| `barcode` |

**Response 202**
```json
{
  "scan_id": "uuid",
  "status": "queued"
}
```

> **Mobile note:** Add `Idempotency-Key` header to prevent duplicate uploads when the device retries on network failure.  
> Duplicate uploads of the same file within 5 minutes are rejected with HTTP 409.

### GET `/api/scan/{scan_id}/status`

Poll scan processing status.

**Response 200**
```json
{
  "scan_id": "uuid",
  "status": "completed",
  "processed": true,
  "items_detected": 12,
  "extracted_items": [
    { "name": "Whole Milk 1L", "quantity": 4, "unit": "unit", "confidence": 0.97 }
  ]
}
```

**Status values:** `queued` | `processing` | `completed` | `failed`

**Polling strategy:** Poll every 2 s for up to 60 s; back off to 5 s after that.

---

## Inventory

### GET `/api/inventory/`

List inventory items for the current property.

**Query params**

| Param | Type | Description |
|---|---|---|
| `limit` | int | Default 20, max 100 |
| `offset` | int | Pagination offset |
| `search` | string | Item name substring search |
| `stock_status` | string | `normal` \| `low_stock` \| `out_of_stock` |

**Response 200**
```json
{
  "items": [...],
  "total": 140,
  "page": 1,
  "page_size": 20,
  "low_stock_count": 3
}
```

### PATCH `/api/inventory/{item_id}`

Update an inventory item's quantity or metadata.

**Request**
```json
{
  "quantity": 6,
  "unit": "kg",
  "min_quantity": 2
}
```

**Response 200** — updated `InventoryItem`

---

## Alerts

### GET `/api/alerts/`

List alerts for the current context.

**Query params**

| Param | Type | Default |
|---|---|---|
| `state` | string | `open` |
| `alert_type` | string | — |
| `page_size` | int | 20 |

**Response 200**
```json
{
  "alerts": [...],
  "open_count": 5,
  "page": 1,
  "page_size": 20
}
```

### POST `/api/alerts/{alert_id}/snooze`

Snooze an alert until a given time.

**Request**
```json
{ "snooze_until": "2025-07-01T09:00:00Z" }
```

**Response 200** — updated `Alert`

### POST `/api/alerts/{alert_id}/resolve`

Mark an alert as resolved.

**Response 200** — updated `Alert`

---

## Documents

### GET `/api/documents/review-queue`

Fetch documents pending human review.

**Response 200** — array of `Document` objects with `review_needed: true`

### POST `/api/documents/{document_id}/approve`

Approve and post a document to inventory.

**Request**
```json
{ "notes": "Checked against paper invoice" }
```

**Response 200**
```json
{ "ok": true, "document_id": "uuid", "movements_created": 8 }
```

### PATCH `/api/documents/{document_id}/line-items/{line_item_id}`

Edit a single line item before approval.

**Request**
```json
{
  "normalized_name": "Whole Milk 1L",
  "normalized_quantity": 4,
  "normalized_unit": "unit"
}
```

---

## Shopping Lists

### POST `/api/shopping-list/generate`

Generate a shopping list from current predictions.

**Request**
```json
{
  "days_ahead": 7,
  "budget_limit": "500.00",
  "include_low_stock": true,
  "include_predictions": true
}
```

**Response 202**
```json
{ "task_id": "celery-uuid", "status": "queued" }
```

---

## Offline Queue

Mobile clients may queue operations while offline and replay them when connectivity resumes.

### Requirements

1. Each queued operation must be assigned a client-generated `Idempotency-Key` (UUID v4).
2. Operations must be submitted within `MAX_OFFLINE_QUEUE_AGE_DAYS` (7 days) of their `submitted_at_client` timestamp; older operations are rejected with HTTP 422.
3. The server replays idempotent POST/PATCH operations if the key is already in cache — returning the original response with header `X-Idempotency-Replayed: true`.

### Retry strategy

```
Attempt 1: immediately
Attempt 2: +1s
Attempt 3: +2s
Attempt 4: +4s
Attempt 5: +8s (give up after 5 attempts)
```

---

## Error Responses

All errors follow this envelope:

```json
{
  "detail": "Human-readable error message"
}
```

| Status | Meaning |
|---|---|
| 400 | Validation error |
| 401 | Missing or invalid JWT |
| 403 | Insufficient permissions |
| 404 | Resource not found |
| 409 | Conflict (e.g. duplicate upload) |
| 422 | Unprocessable — stale offline queue item |
| 429 | Rate limited |
| 500 | Internal server error |

---

## Rate Limits

| Endpoint group | Limit |
|---|---|
| Auth (`/api/auth/*`) | 20 req / min |
| Scan upload | 30 req / min per org |
| All other endpoints | 120 req / min per user |

Response headers: `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## Versioning

The API does not currently use URL versioning. Breaking changes will be communicated via mobile push notifications and will include a minimum-app-version enforcement gate.

---

## Changelog

| Date | Change |
|---|---|
| 2025-01 | Initial mobile API contract |
