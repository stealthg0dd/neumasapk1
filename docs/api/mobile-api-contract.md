# Neumas Mobile API Contract

> Version: 1.0
> Last updated: 2026-04-17

This document describes the conventions, headers, and patterns that mobile clients (iOS, Android, React Native) must use when calling the Neumas backend API.

The Neumas backend is a **single FastAPI service** — there is no separate mobile backend. Mobile clients use the same API as the web frontend.

---

## Required Headers

All authenticated requests from mobile clients must include:

```
Authorization: Bearer <access_token>
Content-Type: application/json
X-Client-Platform: ios | android | react-native
X-Client-Version: <semver>
X-Device-Id: <stable-device-uuid>
```

For mutating operations (POST, PATCH, DELETE), clients must also include:

```
Idempotency-Key: <uuid-v4>
```

---

## Token Lifecycle

Tokens expire in `expires_in` seconds (returned at login). Mobile clients must:

1. Store `access_token` and `refresh_token` in secure storage (Keychain / Keystore).
2. On receiving a 401, call `POST /api/auth/refresh` with the stored refresh token.
3. Retry the original request with the new access token.
4. If refresh also returns 401, clear all stored tokens and route to login.

```json
POST /api/auth/refresh
{
  "refresh_token": "<refresh_token>"
}

Response 200:
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

---

## Idempotency

All mutating operations must include an `Idempotency-Key` header:

```
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

The backend stores idempotency keys and returns the same response for duplicate requests within a 24-hour window. This enables safe retry of failed requests.

Generate a new UUID per logical operation. Do not reuse keys across different operations.

---

## Offline Queue Replay

Mobile clients may queue operations while offline. When connectivity is restored:

1. Include `submitted_at_client` in the request body (ISO 8601 UTC):
   ```json
   { "submitted_at_client": "2026-04-17T10:30:00Z" }
   ```
2. Include an `Idempotency-Key` header (same key generated at queue time).
3. The backend will reject operations queued more than 7 days ago with `409 Conflict`.

---

## Push Notifications (future)

Push token registration endpoint (not yet implemented):

```
POST /api/auth/push-token
{
  "token": "<apns-or-fcm-token>",
  "platform": "ios | android",
  "device_id": "<device-uuid>"
}
```

---

## Resumable Uploads

For scan uploads, mobile clients should:

1. Check file size before uploading.
2. Files under 10 MB: use standard `POST /api/scan/upload` (multipart).
3. Files over 10 MB: use Supabase Storage direct upload (TUS protocol) and pass the resulting storage URL to `POST /api/scan/upload` as `image_url` instead of uploading the file.

---

## Pagination

All list endpoints support:
```
?page=1&page_size=20
```

Response envelope:
```json
{
  "items": [...],
  "total": 150,
  "page": 1,
  "page_size": 20,
  "has_next": true
}
```

Mobile clients should use cursor-based pagination when available (indicated by `next_cursor` in the response).

---

## Filtering

Mobile clients should use query parameters for filtering:
```
GET /api/inventory/?status=low_stock&category_id=<uuid>&search=chicken
GET /api/alerts/?state=open&severity=critical
GET /api/documents/?review_needed=true
```

---

## Error Format

All errors follow this structure:
```json
{
  "detail": "Human-readable error message"
}
```

For validation errors:
```json
{
  "detail": [
    {
      "loc": ["body", "email"],
      "msg": "value is not a valid email address",
      "type": "value_error.email"
    }
  ]
}
```

Standard HTTP status codes apply:
- `400` — validation error or bad request
- `401` — unauthenticated (trigger refresh)
- `403` — forbidden (insufficient permissions)
- `404` — resource not found
- `409` — conflict (duplicate idempotency key with different data)
- `422` — unprocessable entity
- `429` — rate limit exceeded (check `Retry-After` header)
- `500` — internal server error
- `503` — service unavailable (backend maintenance)
